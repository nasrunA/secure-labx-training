import 'dotenv/config'
import {pbkdf2, randomBytes, randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {Pool} from 'pg'

const deriveBits = promisify(pbkdf2)
const argument = name => {
  const index = process.argv.indexOf(name)
  return index < 0 ? '' : process.argv[index + 1] || ''
}
const hex = bytes => Buffer.from(bytes).toString('hex')

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
    const finish = error => {
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

const email = argument('--email').trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  console.error('Provide a valid email address with --email user@example.com.')
  process.exitCode = 1
} else {
  let pool
  try {
    const password = await hiddenPrompt('Superadmin password (12+ characters): ')
    if (password.length < 12) throw new Error('Password must contain at least 12 characters.')
    if (password !== await hiddenPrompt('Confirm password: ')) throw new Error('Passwords do not match.')

    const salt = randomBytes(16)
    const passwordHash = hex(await deriveBits(password, salt, 150_000, 32, 'sha256'))
    pool = new Pool({connectionString: process.env.DATABASE_URL})
    await pool.query(
      `INSERT INTO users (id, email, role, password_salt, password_hash)
       VALUES ($1, $2, 'superadmin', $3, $4)`,
      [randomUUID(), email, salt.toString('hex'), passwordHash],
    )
    console.log(`Superadmin account created for ${email}.`)
  } catch (error) {
    console.error(error instanceof Error && 'code' in error && error.code === '23505'
      ? 'A superadmin account already exists or this email is already in use.'
      : error instanceof Error ? error.message : 'Superadmin setup failed.')
    process.exitCode = 1
  } finally {
    await pool?.end()
  }
}
