import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';

// Creates only labelled, disposable test records and removes those exact IDs in finally.
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const base = `http://127.0.0.1:${process.env.PORT || 3001}/api`;
const reference = `QA-${randomUUID().slice(0,8)}`;
let session;
let checks = 0;
async function request(path, method = 'GET', body, status = 200) {
  const response = await fetch(`${base}${path}`, {method,headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json();
  assert.equal(response.status,status, `${method} ${path}: ${response.status}`);
  checks++;
  return data;
}
try {
  const before = await request('/training-sessions');
  const report = await request('/reporting?year=2026');
  assert.ok(report.summary); assert.equal(report.monthly.length,12);
  session = await request('/training-sessions','POST',{referenceCode:reference,name:`${reference} temporary workflow check`,startDate:'2026-09-07',endDate:'2026-09-08',location:'QA only'});
  assert.equal(session.startDate,'2026-09-07');
  const updated = await request(`/training-sessions/${session.id}`,'PATCH',{name:`${reference} edited`,startDate:'2026-09-09',endDate:'2026-09-10',location:''});
  assert.equal(updated.startDate,'2026-09-09');assert.equal(updated.location,'');
  const company = await request(`/training-sessions/${session.id}/companies`,'POST',{companyName:`${reference} company`,participantCount:0,grantStatus:'follow_up'});
  assert.equal(Number(company.total),0);
  for (const grantStatus of ['applied','approved','rejected','follow_up']) {
    const result = await request(`/training-companies/${company.id}`,'PATCH',{companyName:`${reference} company edited`,participantCount:3,grantStatus});
    assert.equal(Number(result.total),5397);assert.equal(result.grantStatus,grantStatus);
  }
  const p1 = await request(`/training-companies/${company.id}/participants`,'POST',{fullName:'Disposable Test One',icNumber:'000000000001',applicationStatus:'pending_application'});
  assert.equal(p1.icNumber,'000000-00-0001');
  const duplicate = await request(`/training-companies/${company.id}/participants`,'POST',{fullName:'Disposable Duplicate',icNumber:'000000-00-0001',applicationStatus:'registered'},409);
  assert.match(duplicate.error.message,/already been added/);
  const p2 = await request(`/training-companies/${company.id}/participants`,'POST',{fullName:'Disposable Test Two',icNumber:'000000-00-0002',applicationStatus:'registered'});
  await request(`/company-participants/${p2.id}`,'PATCH',{icNumber:'000000000001'},409);
  const changed = await request(`/company-participants/${p1.id}`,'PATCH',{fullName:'Disposable Edited',applicationStatus:'registered'});
  assert.equal(changed.applicationStatus,'registered');
  assert.equal((await request(`/training-companies/${company.id}/participants`)).length,2);
  await request(`/company-participants/${p2.id}`,'DELETE');
  assert.equal((await request(`/training-companies/${company.id}/participants`)).length,1);
  await request(`/training-companies/${company.id}`,'DELETE');
  assert.equal((await request(`/training-sessions/${session.id}/companies`)).length,0);
  assert.equal((await request(`/training-companies/${company.id}/participants`)).length,0);
  const after = await request('/training-sessions');
  assert.equal(after.length,before.length+1);
  console.log(`PASS: ${checks} live API checks. Dates, session edits, company calculation and grant statuses, participant CRUD and duplicate IC validation verified.`);
} finally {
  // Never clean up user records: both generated ID and generated reference must match.
  if(session) await pool.query('DELETE FROM training_programs WHERE id = $1 AND reference_code = $2',[session.id,reference]);
  await pool.end();
  console.log('Disposable workflow-check records removed; existing business records unchanged.');
}
