import {afterEach, expect, test, vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import worker from '../worker/index.js'

afterEach(()=>vi.unstubAllGlobals())

const authRequest = (url, method='GET') => ({
  url,
  method,
  headers:new Headers({Cookie:'slx_session=test-session'}),
})
const passwordDigest = async (password,saltHex) => {
  const salt=Uint8Array.from(saltHex.match(/.{2}/g),byte=>parseInt(byte,16))
  const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const bits=await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:150000},key,256)
  return [...new Uint8Array(bits)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
}

test('hosted dashboard reporting is calculated from live training records', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const rows = [
    {sessionId:'s1', startDate:'2026-04-07', companyId:'c1', participantCount:2, grossClaim:3598, grantStatus:'approved', rebateProfile:JSON.stringify({creditUsed:'100', rebatePlan:'Yearly Subscription'})},
    {sessionId:'s2', startDate:'2026-09-07', companyId:null, participantCount:null, grossClaim:null, grantStatus:null, rebateProfile:null},
  ]
  const DB = {
    prepare(sql) {
      return {
        bind() { return this },
        async all() {
          if (sql.includes('SELECT p.id sessionId')) return {results:rows}
          if (sql.includes('SELECT DISTINCT')) return {results:[{year:2026}]}
          throw new Error(`Unexpected query: ${sql}`)
        },
        async first() {
          if (sql.includes('FROM user_sessions')) return {id:'root',email:'admin@example.com',role:'superadmin'}
          if (sql.includes('COUNT(cp.id)')) return {participantRecords:1}
          throw new Error(`Unexpected query: ${sql}`)
        },
      }
    },
  }
  const response = await worker.fetch(authRequest('https://example.test/api/reporting?year=2026'), {DB})
  const report = await response.json()

  expect(report.summary).toMatchObject({
    total_training_revenue:3454.08,
    total_rebate_credit:2798,
    hrdc_paid_to_slx:3454.08,
    net_training_contribution:656.08,
    rebate_credit_used:100,
    unutilised_rebate_credit:2698,
    number_of_trainings:2,
    number_of_companies:1,
    total_participants:2,
    participant_records:1,
  })
  expect(report.monthly).toHaveLength(12)
  expect(report.monthly[3]).toMatchObject({month:4, number_of_trainings:1, rebate_issued:2798})
  expect(report.monthly[8]).toMatchObject({month:9, number_of_trainings:1})
  expect(report.usage).toEqual([{name:'Yearly Subscription', amount:100, count:1}])
  expect(report.years).toEqual([2026])
})

test('deleting a session removes its uploaded files before cascading database records', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const calls = []
  const DB = {
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) { this.args = args; return this },
        async first() {
          calls.push({sql, args:this.args})
          if (sql.includes('FROM user_sessions')) return {id:'root',email:'admin@example.com',role:'superadmin'}
          if (sql.startsWith('SELECT id FROM training_programs')) return {id:'s1'}
          throw new Error(`Unexpected first query: ${sql}`)
        },
        async all() {
          calls.push({sql, args:this.args})
          if (sql.startsWith('SELECT rebate_profile')) return {results:[{rebateProfile:JSON.stringify({referenceFiles:[{key:'companies/c1/invoice'}],relatedFiles:[{key:'companies/c1/proof'}]})}]}
          throw new Error(`Unexpected all query: ${sql}`)
        },
        async run() { calls.push({sql, args:this.args}); return {success:true} },
      }
      return statement
    },
  }
  const deletedFiles = []
  const response = await worker.fetch(authRequest('https://example.test/api/training-sessions/s1','DELETE'), {DB,BUCKET:{delete:async key=>deletedFiles.push(key)}})
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({deleted:true})
  expect(deletedFiles).toEqual(['companies/c1/invoice','companies/c1/proof'])
  expect(calls.at(-1)).toMatchObject({sql:'DELETE FROM training_programs WHERE id=?',args:['s1']})
})

test('data endpoints reject requests without a session cookie', async () => {
  const response=await worker.fetch({url:'https://example.test/api/training-sessions',method:'GET',headers:new Headers()}, {})
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({error:{message:'Sign in to continue.'}})
})

test('account administration is limited to superadmins', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const DB={
    prepare(sql){
      return{
        bind(){return this},
        async first(){
          if(sql.includes('FROM user_sessions'))return{id:'trainer',email:'trainer@example.com',role:'trainer'}
          throw new Error(`Unexpected query: ${sql}`)
        },
      }
    },
  }
  const response=await worker.fetch(authRequest('https://example.test/api/accounts'),{DB})
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({error:{message:'Superadmin access is required.'}})
})

test('login verifies the selected role and stores only a session token hash', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const password='SecureUserPassword123'
  const salt='00112233445566778899aabbccddeeff'
  const storedHash=await passwordDigest(password,salt)
  const writes=[]
  const DB={
    prepare(sql){
      const statement={args:[],bind(...args){this.args=args;return this}}
      statement.first=async()=>sql.includes('FROM users WHERE email')?{
        id:'user-1',email:'applicant@example.com',role:'applicant',password_salt:salt,password_hash:storedHash,
      }:null
      statement.run=async()=>{writes.push({sql,args:statement.args});return{success:true}}
      return statement
    },
  }
  const response=await worker.fetch(new Request('https://example.test/api/auth/login',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({email:'applicant@example.com',password,role:'applicant'}),
  }),{DB})
  const result=await response.json()
  expect(response.status).toBe(200)
  expect(result.user).toEqual({id:'user-1',email:'applicant@example.com',role:'applicant'})
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  expect(response.headers.get('set-cookie')).toContain('SameSite=Lax')
  expect(writes).toHaveLength(2)
  expect(writes[1].sql).toContain('INSERT INTO user_sessions')
  expect(writes[1].args[1]).not.toBe(password)
  expect(writes[1].args[1]).toMatch(/^[a-f0-9]{64}$/)
})

test('users can update their own profile after confirming their current password', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const password='CurrentSecurePassword123'
  const salt='00112233445566778899aabbccddeeff'
  const storedHash=await passwordDigest(password,salt)
  const writes=[]
  let duplicateEmail=false
  const DB={
    prepare(sql){
      const statement={args:[],bind(...args){this.args=args;return this}}
      statement.first=async()=>{
        if(sql.includes('FROM user_sessions'))return{id:'user-1',email:'trainer@example.com',role:'trainer'}
        if(sql.includes('FROM users WHERE id'))return{password_salt:salt,password_hash:storedHash}
        throw new Error(`Unexpected query: ${sql}`)
      }
      statement.run=async()=>{if(duplicateEmail&&sql.includes('UPDATE users SET email'))throw new Error('UNIQUE constraint failed: users.email');writes.push({sql,args:statement.args});return{success:true}}
      return statement
    },
  }
  const request=(currentPassword)=>new Request('https://example.test/api/auth/profile',{
    method:'PATCH',
    headers:{'content-type':'application/json',Cookie:'slx_session=test-session'},
    body:JSON.stringify({email:'updated@example.com',currentPassword,newPassword:'UpdatedSecurePassword123'}),
  })
  const rejected=await worker.fetch(request('wrong-current-password'),{DB})
  expect(rejected.status).toBe(401)
  expect(writes).toHaveLength(0)

  const response=await worker.fetch(request(password),{DB})
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({user:{id:'user-1',email:'updated@example.com',role:'trainer'}})
  expect(writes[0].sql).toContain('UPDATE users SET email=?')
  expect(writes[0].args[2]).not.toBe(salt)
  expect(writes[0].args[3]).not.toBe('UpdatedSecurePassword123')
  expect(writes[1].sql).toContain('token_hash<>?')
  duplicateEmail=true
  const conflict=await worker.fetch(request(password),{DB})
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toMatchObject({error:{message:'An account already uses that email address.'}})
})

test('superadmins create role-limited accounts with password hashes', async () => {
  vi.stubGlobal('crypto',webcrypto)
  const writes=[]
  const DB={
    prepare(sql){
      const statement={args:[],bind(...args){this.args=args;return this}}
      statement.first=async()=>sql.includes('FROM user_sessions')?{id:'root',email:'admin@example.com',role:'superadmin'}:null
      statement.run=async()=>{writes.push({sql,args:statement.args});return{success:true}}
      return statement
    },
  }
  const response=await worker.fetch(new Request('https://example.test/api/accounts',{
    method:'POST',
    headers:{'content-type':'application/json',Cookie:'slx_session=test-session'},
    body:JSON.stringify({email:'trainer@example.com',role:'trainer',password:'TrainerSecure123'}),
  }),{DB})
  const result=await response.json()
  expect(response.status).toBe(201)
  expect(result).toMatchObject({email:'trainer@example.com',role:'trainer'})
  expect(result).not.toHaveProperty('password')
  expect(writes[0].sql).toContain('INSERT INTO users')
  expect(writes[0].args[4]).not.toBe('TrainerSecure123')
  expect(writes[0].args[4]).toMatch(/^[a-f0-9]{64}$/)
})
