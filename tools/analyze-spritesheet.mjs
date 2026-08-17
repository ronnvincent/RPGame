/**
 * Sprite sheet frame detector.
 *
 * Decodes a PNG's alpha channel and finds frame boundaries from fully
 * transparent gutter columns/rows, so frame sizes are MEASURED rather than
 * guessed from the image dimensions. Guessing across a hundred sheets is how
 * you end up with effects that render half a frame offset.
 *
 * Usage:  node tools/analyze-spritesheet.mjs <file-or-directory> [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, extname, basename } from 'node:path';

/** Minimal PNG reader: 8-bit RGBA / RGB / grayscale+alpha, no interlacing. */
function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null, trns = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace) throw new Error('interlaced PNG unsupported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // Undo per-scanline filtering.
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      cur[x] = v & 0xff;
    }
  }

  // Build an alpha mask.
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) alpha[i] = out[i * 4 + 3];
    else if (colorType === 4) alpha[i] = out[i * 2 + 1];
    else if (colorType === 3) {
      const idx = out[i];
      alpha[i] = trns && idx < trns.length ? trns[idx] : 255;
    } else alpha[i] = 255; // opaque formats: no gutters to find
  }
  return { width, height, alpha, colorType };
}

/** Indices of fully transparent columns / rows. */
function emptyLines(width, height, alpha) {
  const cols = [], rows = [];
  for (let x = 0; x < width; x++) {
    let empty = true;
    for (let y = 0; y < height; y++) if (alpha[y * width + x]) { empty = false; break; }
    if (empty) cols.push(x);
  }
  for (let y = 0; y < height; y++) {
    let empty = true;
    for (let x = 0; x < width; x++) if (alpha[y * width + x]) { empty = false; break; }
    if (empty) rows.push(y);
  }
  return { cols, rows };
}

/**
 * Largest cell size that divides the axis evenly AND never cuts through
 * occupied pixels - i.e. every internal boundary lands on an empty line.
 */
function bestDivision(total, emptySet, minCell = 8) {
  const options = [];
  for (let n = 1; n <= Math.floor(total / minCell); n++) {
    if (total % n !== 0) continue;
    const cell = total / n;
    let ok = true;
    for (let k = 1; k < n; k++) {
      // Allow the boundary itself or the pixel before it to be the gutter.
      if (!emptySet.has(k * cell) && !emptySet.has(k * cell - 1)) { ok = false; break; }
    }
    if (ok) options.push({ count: n, cell });
  }
  // Prefer the most frames that still respects the gutters.
  return options.length ? options[options.length - 1] : { count: 1, cell: total };
}

function analyze(file) {
  const png = decodePng(file);
  const { width, height, alpha } = png;
  const { cols, rows } = emptyLines(width, height, alpha);
  const colSet = new Set(cols), rowSet = new Set(rows);

  const h = bestDivision(width, colSet);
  const v = bestDivision(height, rowSet);

  // Count cells that actually contain art.
  let used = 0;
  for (let r = 0; r < v.count; r++) {
    for (let c = 0; c < h.count; c++) {
      let any = false;
      for (let y = r * v.cell; y < (r + 1) * v.cell && !any; y++)
        for (let x = c * h.cell; x < (c + 1) * h.cell; x++)
          if (alpha[y * width + x]) { any = true; break; }
      if (any) used++;
    }
  }

  const kind = v.count === 1 ? (h.count === 1 ? 'single' : 'strip-h')
             : h.count === 1 ? 'strip-v' : 'grid';

  return {
    file, width, height,
    cols: h.count, rows: v.count,
    frameW: h.cell, frameH: v.cell,
    cells: h.count * v.count, used, kind
  };
}

const target = process.argv[2];
const asJson = process.argv.includes('--json');
if (!target) { console.error('usage: analyze-spritesheet.mjs <file|dir> [--json]'); process.exit(2); }

const files = [];
(function collect(t) {
  const st = statSync(t);
  if (st.isDirectory()) {
    for (const e of readdirSync(t)) {
      if (e.startsWith('__MACOSX') || e.startsWith('.')) continue;
      collect(join(t, e));
    }
  } else if (extname(t).toLowerCase() === '.png') files.push(t);
})(target);

const results = [];
for (const f of files.sort()) {
  try { results.push(analyze(f)); }
  catch (e) { results.push({ file: f, error: e.message }); }
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    if (r.error) { console.log(`  ERROR  ${basename(r.file)}: ${r.error}`); continue; }
    console.log(
      `  ${String(r.width).padStart(4)}x${String(r.height).padEnd(4)} ` +
      `${r.frameW}x${r.frameH} ${String(r.cols)}x${String(r.rows)} ` +
      `${String(r.used).padStart(3)}/${String(r.cells).padEnd(3)} ${r.kind.padEnd(7)} ${basename(r.file)}`
    );
  }
}
