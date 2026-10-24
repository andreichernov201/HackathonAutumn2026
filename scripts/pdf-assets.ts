import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
const pdfRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const folders = ['cmaps', 'standard_fonts'] as const

/** PDF.js auxiliary data stays on our origin in development and production. */
export function pdfAssets(): Plugin {
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use('/assets/pdfjs', (request, response, next) => {
        const match = request.url?.split('?')[0].match(/^\/(cmaps|standard_fonts)\/([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/)
        if (!match || !['GET', 'HEAD'].includes(request.method || '')) {next(); return}
        readFile(join(pdfRoot, match[1], match[2])).then(data => {
          response.setHeader('Content-Type', 'application/octet-stream')
          response.end(request.method === 'HEAD' ? undefined : data)
        }).catch(() => {response.statusCode = 404; response.end()})
      })
    },
    async generateBundle() {
      for (const folder of folders) {
        for (const name of await readdir(join(pdfRoot, folder))) {
          this.emitFile({type: 'asset', fileName: `assets/pdfjs/${folder}/${name}`, source: await readFile(join(pdfRoot, folder, name))})
        }
      }
    },
  }
}
