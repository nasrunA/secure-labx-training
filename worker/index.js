const headers={'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers})
const now=()=>new Date().toISOString()
const newId=()=>crypto.randomUUID()
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return{}}}
const error=(message,status=422)=>json({error:{message}},status)

function decodeDataUrl(data){const match=/^data:([^;,]+)?(;base64)?,(.*)$/.exec(data||'');if(!match)return null;const bytes=match[2]?Uint8Array.from(atob(match[3]),c=>c.charCodeAt(0)):new TextEncoder().encode(decodeURIComponent(match[3]));return{type:match[1]||'application/octet-stream',bytes}}
async function storeFiles(profile,env,companyId){for(const group of ['referenceFiles','relatedFiles']){if(!Array.isArray(profile[group]))continue;profile[group]=await Promise.all(profile[group].map(async file=>{if(!file?.data?.startsWith('data:'))return file;const decoded=decodeDataUrl(file.data);if(!decoded)return file;const key=`companies/${companyId}/${newId()}`;await env.BUCKET.put(key,decoded.bytes,{httpMetadata:{contentType:file.type||decoded.type},customMetadata:{filename:file.name||'document'}});return{name:file.name||'document',type:file.type||decoded.type,size:file.size||decoded.bytes.length,key,data:`/api/files/${encodeURIComponent(key)}`}}))}return profile}
function exposeFiles(profile){for(const group of ['referenceFiles','relatedFiles'])if(Array.isArray(profile[group]))profile[group]=profile[group].map(file=>file?.key?{...file,data:`/api/files/${encodeURIComponent(file.key)}`}:file);return profile}
async function removeStoredFiles(env,profiles){const keys=profiles.flatMap(row=>{const profile=parse(row.rebateProfile);return['referenceFiles','relatedFiles'].flatMap(group=>Array.isArray(profile[group])?profile[group].map(file=>file?.key).filter(Boolean):[])});if(keys.length&&env.BUCKET)await Promise.all(keys.map(key=>env.BUCKET.delete(key)))}

const number=value=>{const parsed=Number(String(value??'').replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)?parsed:0}
const rounded=value=>Math.round((value+Number.EPSILON)*100)/100
function assembleReporting(rows,participantRecords,years){
  const months=Array.from({length:12},(_,index)=>({month:index+1,training_revenue:0,rebate_issued:0,credit_used:0,remaining_credit:0,number_of_trainings:0,net_contribution:0,sessions:new Set()}))
  const sessions=new Set(),usageByPlan=new Map()
  let trainingRevenue=0,rebateIssued=0,creditUsed=0,hrdcPaid=0,totalParticipants=0,numberOfCompanies=0
  for(const row of rows){
    sessions.add(row.sessionId)
    const calendarMonth=Number(String(row.startDate||'').slice(5,7))
    const monthIndex=Number.isInteger(calendarMonth)&&calendarMonth>=1&&calendarMonth<=12?calendarMonth-1:0
    const month=months[monthIndex]
    month.sessions.add(row.sessionId)
    if(!row.companyId)continue
    const rebateProfile=typeof row.rebateProfile==='string'?parse(row.rebateProfile):(row.rebateProfile||{})
    const participants=number(row.participantCount),revenue=number(row.grossClaim)*.96
    const issued=rebateProfile.creditIssued!==''&&rebateProfile.creditIssued!=null?number(rebateProfile.creditIssued):participants*1399
    const used=number(rebateProfile.creditUsed),remaining=Math.max(issued-used,0)
    trainingRevenue+=revenue;rebateIssued+=issued;creditUsed+=used;totalParticipants+=participants;numberOfCompanies++
    if(row.grantStatus==='approved')hrdcPaid+=revenue
    month.training_revenue+=revenue;month.rebate_issued+=issued;month.credit_used+=used;month.remaining_credit+=remaining;month.net_contribution+=revenue-issued
    const plan=rebateProfile.rebatePlan||rebateProfile.currentPlan||'Other'
    const usage=usageByPlan.get(plan)||{name:plan,amount:0,count:0}
    usage.amount+=used;if(used>0)usage.count++;usageByPlan.set(plan,usage)
  }
  const unutilised=Math.max(rebateIssued-creditUsed,0)
  return{
    summary:sessions.size?{total_training_revenue:rounded(trainingRevenue),total_rebate_credit:rounded(rebateIssued),hrdc_paid_to_slx:rounded(hrdcPaid),net_training_contribution:rounded(trainingRevenue-rebateIssued),rebate_credit_used:rounded(creditUsed),unutilised_rebate_credit:rounded(unutilised),rebate_utilisation_percent:rebateIssued?rounded(creditUsed/rebateIssued*100):0,number_of_trainings:sessions.size,number_of_companies:numberOfCompanies,total_participants:totalParticipants,participant_records:number(participantRecords)}:null,
    monthly:months.map(month=>({month:month.month,training_revenue:rounded(month.training_revenue),rebate_issued:rounded(month.rebate_issued),credit_used:rounded(month.credit_used),remaining_credit:rounded(month.remaining_credit),number_of_trainings:month.sessions.size,net_contribution:rounded(month.net_contribution)})),
    usage:[...usageByPlan.values()].map(item=>({...item,amount:rounded(item.amount)})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name)),
    years:[...new Set(years.map(number).filter(Boolean))].sort((a,b)=>b-a)
  }
}
async function reporting(env,year){
  const [companies,participants,availableYears]=await Promise.all([
    env.DB.prepare(`SELECT p.id sessionId,p.start_date startDate,c.id companyId,c.participant_count participantCount,c.gross_hrdc_claim grossClaim,c.grant_status grantStatus,c.rebate_profile rebateProfile FROM training_programs p LEFT JOIN training_companies c ON c.training_program_id=p.id WHERE substr(p.start_date,1,4)=? ORDER BY p.start_date,c.created_at`).bind(String(year)).all(),
    env.DB.prepare(`SELECT COUNT(cp.id) participantRecords FROM company_participants cp JOIN training_companies c ON c.id=cp.training_company_id JOIN training_programs p ON p.id=c.training_program_id WHERE substr(p.start_date,1,4)=?`).bind(String(year)).first(),
    env.DB.prepare(`SELECT DISTINCT CAST(substr(start_date,1,4) AS INTEGER) year FROM training_programs WHERE start_date IS NOT NULL ORDER BY year DESC`).all()
  ])
  return assembleReporting(companies.results,participants?.participantRecords||0,availableYears.results.map(row=>row.year))
}

export default{async fetch(request,env){const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);const path=url.pathname.slice(5);try{
  if(request.method==='GET'&&path.startsWith('files/')){const key=decodeURIComponent(path.slice(6)),object=await env.BUCKET.get(key);if(!object)return new Response('Not found',{status:404});const responseHeaders=new Headers();object.writeHttpMetadata(responseHeaders);responseHeaders.set('etag',object.httpEtag);responseHeaders.set('content-disposition',`inline; filename="${(object.customMetadata?.filename||'document').replaceAll('"','')}"`);return new Response(object.body,{headers:responseHeaders})}
  if(request.method==='GET'&&path==='training-sessions'){const search=`%${url.searchParams.get('search')||''}%`;const {results}=await env.DB.prepare(`SELECT p.id,p.reference_code referenceCode,p.name,p.start_date startDate,p.end_date endDate,p.location,COUNT(c.id) companyCount,COALESCE(SUM(c.participant_count),0) participantCount,COALESCE(SUM(c.gross_hrdc_claim),0) totalAmount FROM training_programs p LEFT JOIN training_companies c ON c.training_program_id=p.id WHERE p.name LIKE ? OR COALESCE(p.location,'') LIKE ? GROUP BY p.id ORDER BY p.start_date`).bind(search,search).all();return json(results)}
  let match=path.match(/^training-sessions\/([^/]+)\/companies$/)
  if(request.method==='GET'&&match){const {results}=await env.DB.prepare(`SELECT id,company_name companyName,participant_count participantCount,unit_price unitPrice,gross_hrdc_claim total,grant_status grantStatus,rebate_status rebateStatus,rebate_profile rebateProfile,updated_at lastRefresh FROM training_companies WHERE training_program_id=? ORDER BY created_at`).bind(match[1]).all();return json(results.map(row=>({...row,rebateProfile:exposeFiles(parse(row.rebateProfile))})))}
  if(request.method==='POST'&&path==='training-sessions'){const input=await request.json(),record={id:newId(),referenceCode:input.referenceCode,name:input.name,startDate:input.startDate,endDate:input.endDate,location:input.location||null};if(!record.referenceCode||!record.name||!record.startDate||!record.endDate)return error('Complete all required session fields.');await env.DB.prepare('INSERT INTO training_programs(id,reference_code,name,start_date,end_date,location,status,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(record.id,record.referenceCode,record.name,record.startDate,record.endDate,record.location,'planned',now()).run();return json(record)}
  match=path.match(/^training-sessions\/([^/]+)$/)
  if(request.method==='PATCH'&&match){const input=await request.json(),current=await env.DB.prepare('SELECT * FROM training_programs WHERE id=?').bind(match[1]).first();if(!current)return error('Training session was not found.',404);await env.DB.prepare('UPDATE training_programs SET name=?,start_date=?,end_date=?,location=? WHERE id=?').bind(input.name??current.name,input.startDate??current.start_date,input.endDate??current.end_date,input.location??current.location,match[1]).run();return json({saved:true})}
  if(request.method==='DELETE'&&match){const current=await env.DB.prepare('SELECT id FROM training_programs WHERE id=?').bind(match[1]).first();if(!current)return error('Training session was not found.',404);const {results}=await env.DB.prepare('SELECT rebate_profile rebateProfile FROM training_companies WHERE training_program_id=?').bind(match[1]).all();await removeStoredFiles(env,results);await env.DB.prepare('DELETE FROM training_programs WHERE id=?').bind(match[1]).run();return json({deleted:true})}
  match=path.match(/^training-sessions\/([^/]+)\/companies$/)
  if(request.method==='POST'&&match){const input=await request.json(),participants=Number(input.participantCount);if(!input.companyName||!Number.isInteger(participants)||participants<0)return error('Enter a company name and valid participant count.');const companyId=newId(),created=now(),unit=1799;await env.DB.prepare(`INSERT INTO training_companies(id,training_program_id,company_name,participant_count,unit_price,gross_hrdc_claim,grant_status,rebate_status,rebate_profile,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(companyId,match[1],input.companyName,participants,unit,participants*unit,input.grantStatus||'follow_up',input.rebateStatus||'unused','{}',created,created).run();return json({id:companyId,companyName:input.companyName,participantCount:participants,unitPrice:unit,total:participants*unit,grantStatus:input.grantStatus||'follow_up',rebateStatus:input.rebateStatus||'unused'})}
  match=path.match(/^training-companies\/([^/]+)$/)
  if(match&&request.method==='PATCH'){const input=await request.json(),current=await env.DB.prepare('SELECT * FROM training_companies WHERE id=?').bind(match[1]).first();if(!current)return error('Company record was not found.',404);const participants=input.participantCount===undefined?current.participant_count:Number(input.participantCount);const profile=input.rebateProfile===undefined?parse(current.rebate_profile):await storeFiles(structuredClone(input.rebateProfile),env,match[1]);await env.DB.prepare(`UPDATE training_companies SET company_name=?,participant_count=?,gross_hrdc_claim=?,grant_status=?,rebate_status=?,rebate_profile=?,updated_at=? WHERE id=?`).bind(input.companyName??current.company_name,participants,participants*current.unit_price,input.grantStatus??current.grant_status,input.rebateStatus??current.rebate_status,JSON.stringify(profile),now(),match[1]).run();return json({saved:true})}
  if(match&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM training_companies WHERE id=?').bind(match[1]).run();return json({deleted:true})}
  match=path.match(/^training-companies\/([^/]+)\/participants$/)
  if(match&&request.method==='GET'){const {results}=await env.DB.prepare(`SELECT id,full_name fullName,ic_number icNumber,phone_number phoneNumber,application_status applicationStatus FROM company_participants WHERE training_company_id=? ORDER BY created_at`).bind(match[1]).all();return json(results)}
  if(match&&request.method==='POST'){const input=await request.json();if(!input.fullName||!input.icNumber||!input.phoneNumber)return error('Enter the participant name, IC number and phone number.');const participantId=newId(),created=now();try{await env.DB.prepare(`INSERT INTO company_participants(id,training_company_id,full_name,ic_number,phone_number,application_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(participantId,match[1],input.fullName,input.icNumber,input.phoneNumber,input.applicationStatus||'pending_application',created,created).run()}catch(caught){if(/UNIQUE constraint failed/i.test(caught?.message||''))return error('A participant with this IC number already exists for this company.',409);throw caught}return json({id:participantId,...input})}
  match=path.match(/^company-participants\/([^/]+)$/)
  if(match&&request.method==='PATCH'){const input=await request.json(),current=await env.DB.prepare('SELECT * FROM company_participants WHERE id=?').bind(match[1]).first();if(!current)return error('Participant record was not found.',404);await env.DB.prepare('UPDATE company_participants SET full_name=?,ic_number=?,phone_number=?,application_status=?,updated_at=? WHERE id=?').bind(input.fullName??current.full_name,input.icNumber??current.ic_number,input.phoneNumber??current.phone_number,input.applicationStatus??current.application_status,now(),match[1]).run();return json({saved:true})}
  if(match&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM company_participants WHERE id=?').bind(match[1]).run();return json({deleted:true})}
  if(request.method==='GET'&&path==='reporting')return json(await reporting(env,Number(url.searchParams.get('year')||2026)))
  return error('Route not found.',404)
}catch(caught){return error(caught?.message||'The request could not be completed.',500)}}}
