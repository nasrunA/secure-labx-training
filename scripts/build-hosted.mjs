import {build} from 'vite'
import {cp, mkdir, rm} from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })
await build({
  build: {
    outDir: 'dist/client',
  },
})
