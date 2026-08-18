/**
 * Reports the playing length of audio files without decoding them.
 *
 * The ultimate director has to hold its effects for exactly as long as the
 * voice line plays, so the length has to be a known number at build time
 * rather than something read from an Audio element at runtime - by the time
 * the browser reports duration, the cinematic has already started.
 *
 * Handles Ogg Vorbis/Opus (last granule / rate) and RIFF WAVE (data size /
 * byte rate). Both are exact; neither needs a decoder.
 *
 * Usage:  node tools/audio-duration.mjs <file-or-directory>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function audioDuration(file) {
  const buf = readFileSync(file);
  if (buf.length > 4 && buf.toString('latin1', 0, 4) === 'OggS') return oggDuration(buf);
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF') return wavDuration(buf);
  throw new Error('unsupported container: ' + file);
}

function oggDuration(buf) {
  // Sample rate lives in the first logical packet: either a Vorbis
  // identification header or an OpusHead. Opus granules always count at 48kHz.
  let rate = 0;
  const head = buf.toString('latin1', 0, Math.min(buf.length, 8192));
  const vorbis = head.indexOf('\x01vorbis');
  const opus = head.indexOf('OpusHead');
  if (vorbis >= 0) {
    rate = buf.readUInt32LE(vorbis + 12);
  } else if (opus >= 0) {
    rate = 48000;
  }
  if (!rate) throw new Error('no Vorbis or Opus header found');

  // The last page's granule position is the total sample count.
  let granule = 0;
  for (let i = buf.length - 4; i >= 0; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      granule = Number(buf.readBigUInt64LE(i + 6));
      break;
    }
  }
  if (!granule) throw new Error('no final page granule');
  return granule / rate;
}

function wavDuration(buf) {
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(pos + 16);
    else if (id === 'data' && byteRate) return size / byteRate;
    pos += 8 + size + (size % 2);
  }
  throw new Error('no fmt/data chunks');
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const target = process.argv[2];
  if (!target) { console.error('usage: audio-duration.mjs <file|dir>'); process.exit(2); }
  const files = statSync(target).isDirectory()
    ? readdirSync(target).map((f) => join(target, f))
    : [target];
  for (const f of files) {
    if (!['.ogg', '.wav', '.opus'].includes(extname(f).toLowerCase())) continue;
    try {
      console.log(audioDuration(f).toFixed(3).padStart(8) + ' s  ' + f);
    } catch (err) {
      console.log('   ?     s  ' + f + '   (' + err.message + ')');
    }
  }
}
