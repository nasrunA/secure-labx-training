import {build} from 'vite'
import {cp,mkdir} from 'node:fs/promises'

await build()
await mkdir('dist/server',{recursive:true})
await mkdir('dist/.openai',{recursive:true})
await cp('worker/index.js','dist/server/index.js')
await cp('.openai/hosting.json','dist/.openai/hosting.json')
await cp('drizzle','dist/.openai/drizzle',{recursive:true})
