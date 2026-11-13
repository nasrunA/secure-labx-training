import {spawn} from 'node:child_process'
import {resolve} from 'node:path'

const root = process.cwd()

const commands = [
  ['backend', resolve(root, 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs'), ['src/index.ts'], resolve(root, 'backend')],
  ['frontend', resolve(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['--port', '3000', '--strictPort'], root],
]
const children = []

for (const [name, script, args, cwd] of commands) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)

  child.on('error', error => {
    console.error(`Could not start the ${name}: ${error.message}`)
    process.exitCode = 1
    for (const running of children) running.kill()
  })

  child.on('exit', (code, signal) => {
    if (!signal && code !== 0) process.exitCode = code || 1
    if (children.some(running => running.exitCode === null && running.signalCode === null)) {
      for (const running of children) if (running !== child) running.kill()
    }
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal)
  })
}
