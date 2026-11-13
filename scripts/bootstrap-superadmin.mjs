import {spawn} from 'node:child_process'
import {webcrypto} from 'node:crypto'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? '' : process.argv[index + 1] || ''
}

function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin
    if (!input.isTTY || !input.setRawMode) {
      reject(new Error('Run this command in an interactive terminal so the password can be entered securely.'))
      return
    }
    let value = ''
    process.stdout.write(label)
    input.setRawMode(true)
    input.resume()
    const finish = (error) => {
      input.setRawMode(false)
      input.pause()
      input.removeListener('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Setup cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else if (character >= ' ' && character <= '~' && value.length < 256) value += character
      }
    }
    input.on('data', onData)
  })
}

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password, salt) {
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await webcrypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000}, key, 256)
  return hex(new Uint8Array(bits))
}

function runWrangler(file, remote) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const args = ['--yes', 'wrangler@4', 'd1', 'execute', 'DB', ...(remote ? ['--remote'] : []), '--file', file]
    const child = spawn(executable, args, {stdio: 'inherit', shell: process.platform === 'win32'})
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited with status ${code}.`)))
  })
}

try {
  const email = argument('--email').trim().toLowerCase()
  const remote = process.argv.includes('--remote')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Provide a valid email address with --email user@example.com.')
  }
  const password = await hiddenPrompt('Superadmin password (12+ characters): ')
  if (password.length < 12) throw new Error('Password must contain at least 12 characters.')
  const confirmation = await hiddenPrompt('Confirm password: ')
  if (password !== confirmation) throw new Error('Passwords do not match.')

  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const digest = await hashPassword(password, salt)
  const quote = value => `'${value.replaceAll("'", "''")}'`
  const sql = `INSERT INTO users (id,email,role,password_salt,password_hash,created_at,updated_at) VALUES (lower(hex(randomblob(16))),${quote(email)},'superadmin',${quote(hex(salt))},${quote(digest)},strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));`
  const directory = await mkdtemp(join(tmpdir(), 'slx-auth-'))
  const file = join(directory, 'bootstrap.sql')
  try {
    await writeFile(file, sql, {mode:0o600})
    await runWrangler(file, remote)
  } finally {
    await rm(directory, {recursive:true,force:true})
  }
  console.log(`Superadmin account created for ${email}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
