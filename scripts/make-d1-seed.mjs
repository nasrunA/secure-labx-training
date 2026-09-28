import {readFile,writeFile} from 'node:fs/promises'

const columns={
  training_programs:'id,reference_code,name,start_date,end_date,location,status,created_at',
  training_companies:'id,training_program_id,company_name,participant_count,unit_price,gross_hrdc_claim,grant_status,created_at,updated_at,rebate_status,rebate_profile',
  company_participants:'id,training_company_id,full_name,ic_number,application_status,created_at,updated_at',
  reporting_periods:'id,reporting_year,reporting_month,created_at',
  dashboard_summaries:'id,reporting_year,total_training_revenue,total_rebate_credit,hrdc_paid_to_slx,net_training_contribution,rebate_credit_used,unutilised_rebate_credit,rebate_utilisation_percent,number_of_trainings,total_participants,created_at,updated_at',
  monthly_training_performance:'id,reporting_period_id,training_revenue,rebate_issued,credit_used,remaining_credit,number_of_trainings,net_contribution,created_at,updated_at',
  credit_usage_categories:'id,name,display_order',
  credit_usage_records:'id,reporting_period_id,category_id,amount_used,usage_count,created_at',
}
const source=await readFile('migration-local-data.sql','utf8')
const statements=[]
for(const line of source.split(/\r?\n/)){
  const match=line.match(/^INSERT INTO public\.([a-z_]+) VALUES (\(.+\));$/)
  if(match&&columns[match[1]])statements.push(`INSERT OR IGNORE INTO ${match[1]} (${columns[match[1]]}) VALUES ${match[2]};`)
}
await writeFile('drizzle/0001_local_data.sql',`${statements.join('\n')}\n`)
