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
