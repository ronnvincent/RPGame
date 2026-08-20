import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const configFile = join(projectRoot, 'vite.config.ts')
const moduleScriptUrls = (html, indexUrl) => [...html.matchAll(/<script\b[^>]*>/gi)]
  .map(([tag]) => {
    if (!/\btype=["']module["']/i.test(tag)) return null
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
    return src ? new URL(src, indexUrl) : null
  })
  .filter(url => url && url.origin === indexUrl.origin)

const closePreview = server => new Promise((resolve, reject) => {
  server.httpServer.close(error => error ? reject(error) : resolve())
})

test('production previews serve maps, the client bundle, and runtime UI at root and subpath', async () => {
  const sourceHtml = await readFile(join(projectRoot, 'index.html'), 'utf8')
  assert.doesNotMatch(sourceHtml, /@rpgjs\/ui-css/)
  assert.match(sourceHtml, /id=["']orientation-rotate-shield["']/)

  const temporaryOutput = await mkdtemp(join(tmpdir(), 'rpgjs-starter-production-'))

  try {
    for (const variant of [
      { name: 'root', base: '/', route: '/' },
      { name: 'subpath', base: '/quest/', route: '/quest/' }
    ]) {
      const outDir = join(temporaryOutput, variant.name)
      await build({
        root: projectRoot,
        configFile,
        base: variant.base,
        build: { outDir, emptyOutDir: true }
      })
      await access(join(outDir, 'assets', 'runtime', 'maps', 'pixel-platformer', 'backgrounds.png'))

      const server = await preview({
        root: projectRoot,
        configFile: false,
        base: variant.base,
        build: { outDir },
        preview: {
          host: '127.0.0.1',
          port: 0,
          strictPort: true
        }
      })

      try {
        const address = server.httpServer.address()
        assert(address && typeof address === 'object')
        const origin = new URL(`http://127.0.0.1:${address.port}`)
        const indexUrl = new URL(variant.route, origin)

        const indexResponse = await fetch(indexUrl)
        assert.equal(indexResponse.status, 200, `${variant.name} index status`)
        const builtHtml = await indexResponse.text()
        assert.doesNotMatch(builtHtml, /node_modules\/@rpgjs\/ui-css/)

        const mapResponse = await fetch(new URL(
          `${variant.route}assets/runtime/maps/pixel-platformer/backgrounds.png`,
          origin,
        ))
        assert.equal(mapResponse.status, 200, `${variant.name} map status`)
        assert.match(mapResponse.headers.get('content-type') ?? '', /^image\/png\b/)

        const moduleScripts = moduleScriptUrls(builtHtml, indexUrl)
        assert(moduleScripts.length > 0, `${variant.name} emitted no local module bundle`)
        for (const scriptUrl of moduleScripts) {
          const response = await fetch(scriptUrl)
          assert.equal(response.status, 200, `${variant.name} script status: ${scriptUrl}`)
          assert.match(response.headers.get('content-type') ?? '', /javascript/)
        }

        const panelResponse = await fetch(new URL(
          `${variant.route}assets/runtime/ui/fantasy-borders/default-panel/panel-016.png`,
          origin,
        ))
        assert.equal(panelResponse.status, 200, `${variant.name} runtime UI panel status`)
        assert.match(panelResponse.headers.get('content-type') ?? '', /^image\/png\b/)
      } finally {
        await closePreview(server)
      }
    }
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true })
  }
})
