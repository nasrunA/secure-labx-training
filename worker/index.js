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
async function storeCatalogueFile(file,env,id){if(!file?.data?.startsWith('data:'))return file;const decoded=decodeDataUrl(file.data);if(!decoded)return file;const key=`catalogue/${id}/${newId()}`;await env.BUCKET.put(key,decoded.bytes,{httpMetadata:{contentType:file.type||decoded.type},customMetadata:{filename:file.name||'catalogue-item'}});return{name:file.name||'catalogue-item',type:file.type||decoded.type,size:file.size||decoded.bytes.length,key}}
async function catalogueRoutes(request,env,path,user){
  const fileMatch=path.match(/^catalogue\/([^/]+)\/file$/)
  if(fileMatch&&request.method==='GET'){
    const item=await env.DB.prepare('SELECT file_key,file_name,file_type FROM catalogue_products WHERE id=?').bind(fileMatch[1]).first();if(!item)return error('Catalogue product was not found.',404)
    const object=await env.BUCKET.get(item.file_key);if(!object)return error('Catalogue file was not found.',404)
    const responseHeaders=new Headers();object.writeHttpMetadata(responseHeaders);responseHeaders.set('content-disposition',`inline; filename="${(item.file_name||'catalogue-item').replaceAll('"','')}"`);responseHeaders.set('cache-control','private, no-store');return new Response(object.body,{headers:responseHeaders})
  }
  if(path==='catalogue'&&request.method==='GET'){const {results}=await env.DB.prepare('SELECT id,title,description,file_name fileName,file_type fileType,file_size fileSize,position,created_at createdAt FROM catalogue_products ORDER BY position,created_at DESC').all();return json(results.map(item=>({...item,url:`/api/catalogue/${item.id}/file`})))}
  if(user.role!=='superadmin')return error('Superadmin access is required.',403)
  if(path==='catalogue'&&request.method==='POST'){
    const input=await request.json(),title=String(input.title||'').trim(),description=String(input.description||'').trim(),file=await storeCatalogueFile(input.file,env,newId())
    if(!title||!file?.key)return error('Provide a product title and upload a poster or document.')
    const id=newId(),created=now();await env.DB.prepare('INSERT INTO catalogue_products(id,title,description,file_key,file_name,file_type,file_size,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,title,description,file.key,file.name,file.type,file.size||0,Number(input.position)||0,created,created).run()
    return json({id,title,description,fileName:file.name,fileType:file.type,fileSize:file.size||0,url:`/api/catalogue/${id}/file`},201)
  }
  const match=path.match(/^catalogue\/([^/]+)$/)
  if(match&&request.method==='PATCH'){
    const current=await env.DB.prepare('SELECT * FROM catalogue_products WHERE id=?').bind(match[1]).first();if(!current)return error('Catalogue product was not found.',404)
    const input=await request.json(),file=await storeCatalogueFile(input.file,env,current.id),title=String(input.title??current.title).trim(),description=String(input.description??current.description).trim()
    if(!title)return error('Enter a product title.')
    await env.DB.prepare('UPDATE catalogue_products SET title=?,description=?,file_key=?,file_name=?,file_type=?,file_size=?,position=?,updated_at=? WHERE id=?').bind(title,description,file?.key||current.file_key,file?.name||current.file_name,file?.type||current.file_type,file?.size||current.file_size,Number(input.position??current.position)||0,now(),current.id).run()
    if(file?.key&&env.BUCKET)await env.BUCKET.delete(current.file_key)
    return json({saved:true})
  }
  if(match&&request.method==='DELETE'){
    const current=await env.DB.prepare('SELECT file_key FROM catalogue_products WHERE id=?').bind(match[1]).first();if(!current)return error('Catalogue product was not found.',404)
    await env.DB.prepare('DELETE FROM catalogue_products WHERE id=?').bind(match[1]).run();if(env.BUCKET)await env.BUCKET.delete(current.file_key);return json({deleted:true})
  }
  return error('Route not found.',404)
}

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

const accountRoles = new Set(['applicant','trainer','sales'])
const sessionLifetime = 14 * 24 * 60 * 60
const passwordIterations = 150000
const hex = bytes => [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
const bytesFromHex = value => Uint8Array.from(value.match(/.{2}/g)||[],byte=>parseInt(byte,16))
async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits'])
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytesFromHex(salt),iterations:passwordIterations},key,256)
  return hex(bits)
}
async function hashToken(token){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))}
function validEmail(value){return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=256}
async function verifyPassword(password,salt,expected){
  if(typeof password!=='string'||typeof salt!=='string'||typeof expected!=='string')return false
  const actual=await passwordHash(password,salt)
  if(actual.length!==expected.length)return false
  let difference=0
  for(let index=0;index<actual.length;index++)difference|=actual.charCodeAt(index)^expected.charCodeAt(index)
  return difference===0
}
function cookieValue(request,name){
  const cookie=request.headers?.get('Cookie')||''
  const match=cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))
  return match?match.slice(name.length+1):''
}
function sessionCookie(token,request){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':''
  return `slx_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetime}${secure}`
}
async function currentUser(request,env){
  const token=cookieValue(request,'slx_session')
  if(!token)return null
  return env.DB.prepare(`SELECT u.id,u.email,u.role FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hashToken(token),now()).first()
}
function publicAccount(row){return{id:row.id,email:row.email,role:row.role,createdAt:row.created_at}}
async function accountRoutes(request,env,path,user){
  if(user.role!=='superadmin')return error('Superadmin access is required.',403)
  if(path==='accounts'&&request.method==='GET'){
    const {results}=await env.DB.prepare(`SELECT id,email,role,created_at FROM users WHERE role IN ('applicant','trainer','sales') ORDER BY role,email`).all()
    return json(results.map(publicAccount))
  }
  if(path==='accounts'&&request.method==='POST'){
    const input=await request.json(),email=String(input.email||'').trim().toLowerCase(),role=input.role,password=input.password
    if(!validEmail(email)||!accountRoles.has(role)||!validPassword(password))return error('Provide a valid email, account role and a password of at least 12 characters.')
    const id=newId(),created=now(),salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await passwordHash(password,salt)
    await env.DB.prepare('INSERT INTO users(id,email,role,password_salt,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,email,role,salt,digest,created,created).run()
    return json({id,email,role,createdAt:created},201)
  }
  const match=path.match(/^accounts\/([^/]+)$/)
  if(match&&request.method==='PATCH'){
    const current=await env.DB.prepare(`SELECT id,email,role,password_salt,password_hash,created_at FROM users WHERE id=? AND role IN ('applicant','trainer','sales')`).bind(match[1]).first()
    if(!current)return error('Account was not found.',404)
    const input=await request.json(),email=input.email===undefined?current.email:String(input.email).trim().toLowerCase(),role=input.role===undefined?current.role:input.role,password=input.password
    if(!validEmail(email)||!accountRoles.has(role)||(password!==undefined&&password!==''&&!validPassword(password)))return error('Provide a valid email and account role. Passwords must contain at least 12 characters.')
    let salt=current.password_salt,digest=current.password_hash
    if(password){salt=hex(crypto.getRandomValues(new Uint8Array(16)));digest=await passwordHash(password,salt)}
    const updated=now()
    await env.DB.prepare('UPDATE users SET email=?,role=?,password_salt=?,password_hash=?,updated_at=? WHERE id=?').bind(email,role,salt,digest,updated,current.id).run()
    if(password)await env.DB.prepare('DELETE FROM user_sessions WHERE user_id=?').bind(current.id).run()
    return json({id:current.id,email,role,createdAt:current.created_at})
  }
  if(match&&request.method==='DELETE'){
    const result=await env.DB.prepare(`DELETE FROM users WHERE id=? AND role IN ('applicant','trainer','sales')`).bind(match[1]).run()
    if(!result.meta?.changes)return error('Account was not found.',404)
    return json({deleted:true})
  }
  return error('Route not found.',404)
}

export default{async fetch(request,env){const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);const path=url.pathname.slice(5);try{
  if(request.method==='POST'&&path==='auth/login'){
    const input=await request.json(),email=String(input.email||'').trim().toLowerCase(),role=input.role
    if(!validEmail(email)||!['applicant','trainer','sales','superadmin'].includes(role)||typeof input.password!=='string')return error('Invalid email or password for the selected role.',401)
    const account=await env.DB.prepare('SELECT id,email,role,password_salt,password_hash FROM users WHERE email=? COLLATE NOCASE').bind(email).first()
    const passwordValid=await verifyPassword(input.password,account?.password_salt||'00000000000000000000000000000000',account?.password_hash||'0000000000000000000000000000000000000000000000000000000000000000')
    if(!account||account.role!==role||!passwordValid)return error('Invalid email or password for the selected role.',401)
    const token=hex(crypto.getRandomValues(new Uint8Array(32))),created=now(),expires=new Date(Date.now()+sessionLifetime*1000).toISOString()
    await env.DB.prepare('DELETE FROM user_sessions WHERE expires_at<=?').bind(created).run()
    await env.DB.prepare('INSERT INTO user_sessions(id,token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(newId(),await hashToken(token),account.id,expires,created).run()
    return new Response(JSON.stringify({user:{id:account.id,email:account.email,role:account.role}}),{status:200,headers:{...headers,'set-cookie':sessionCookie(token,request)}})
  }
  if(request.method==='GET'&&path==='auth/me'){
    const user=await currentUser(request,env)
    return user?json({user}):error('Sign in to continue.',401)
  }
  if(request.method==='POST'&&path==='auth/logout'){
    const token=cookieValue(request,'slx_session')
    if(token)await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?').bind(await hashToken(token)).run()
    const secure=url.protocol==='https:'?'; Secure':''
    return new Response(JSON.stringify({loggedOut:true}),{status:200,headers:{...headers,'set-cookie':`slx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`}})
  }
  const user=await currentUser(request,env)
  if(!user)return error('Sign in to continue.',401)
  if(request.method==='PATCH'&&path==='auth/profile'){
    const input=await request.json(),email=typeof input.email==='string'?input.email.trim().toLowerCase():'',currentPassword=input.currentPassword,newPassword=input.newPassword
    if(!validEmail(email)||typeof currentPassword!=='string'||(newPassword!==undefined&&newPassword!==''&&!validPassword(newPassword)))return error('Provide a valid email and current password. New passwords must contain at least 12 characters.')
    const current=await env.DB.prepare('SELECT password_salt,password_hash FROM users WHERE id=?').bind(user.id).first()
    if(!current)return error('Account was not found.',404)
    if(!await verifyPassword(currentPassword,current.password_salt,current.password_hash))return error('The current password is incorrect.',401)
    let salt=current.password_salt,digest=current.password_hash
    if(typeof newPassword==='string'&&newPassword){salt=hex(crypto.getRandomValues(new Uint8Array(16)));digest=await passwordHash(newPassword,salt)}
    await env.DB.prepare('UPDATE users SET email=?,password_salt=?,password_hash=?,updated_at=? WHERE id=?').bind(email,salt,digest,now(),user.id).run()
    if(newPassword){
      const token=cookieValue(request,'slx_session')
      await env.DB.prepare('DELETE FROM user_sessions WHERE user_id=? AND token_hash<>?').bind(user.id,await hashToken(token)).run()
    }
    return json({user:{id:user.id,email,role:user.role}})
  }
  if(path==='accounts'||path.startsWith('accounts/'))return accountRoutes(request,env,path,user)
  if(path==='catalogue'||path.startsWith('catalogue/'))return catalogueRoutes(request,env,path,user)
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
}catch(caught){if(/unique constraint failed: users\.email/i.test(caught?.message||''))return error('An account already uses that email address.',409);return error(caught?.message||'The request could not be completed.',500)}}}
