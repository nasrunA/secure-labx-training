import {build} from 'vite'
import {cp, mkdir, rm} from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })
await build({
  build: {
    outDir: 'dist/client',
  },
})
await mkdir('dist/server',{recursive:true})
await mkdir('dist/.openai',{recursive:true})
await cp('worker/index.js','dist/server/index.js')
await cp('.openai/hosting.json','dist/.openai/hosting.json')
await cp('drizzle','dist/.openai/drizzle',{recursive:true})
