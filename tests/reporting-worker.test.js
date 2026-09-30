import {expect, test} from 'vitest'
import worker from '../worker/index.js'

test('hosted dashboard reporting is calculated from live training records', async () => {
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
          if (sql.includes('COUNT(cp.id)')) return {participantRecords:1}
          throw new Error(`Unexpected query: ${sql}`)
        },
      }
    },
  }
  const response = await worker.fetch({url:'https://example.test/api/reporting?year=2026', method:'GET'}, {DB})
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
  const calls = []
  const DB = {
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) { this.args = args; return this },
        async first() {
          calls.push({sql, args:this.args})
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
  const response = await worker.fetch({url:'https://example.test/api/training-sessions/s1',method:'DELETE'}, {DB,BUCKET:{delete:async key=>deletedFiles.push(key)}})
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({deleted:true})
  expect(deletedFiles).toEqual(['companies/c1/invoice','companies/c1/proof'])
  expect(calls.at(-1)).toMatchObject({sql:'DELETE FROM training_programs WHERE id=?',args:['s1']})
})
