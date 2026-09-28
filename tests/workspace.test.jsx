import React from 'react'
import {beforeEach, expect, test, vi} from 'vitest'
import {render, screen, fireEvent, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Workspace from '../src/workspace/Workspace'
import Editor from '../src/workspace/Editors'
import Training from '../src/workspace/Training'
import Participants from '../src/workspace/Participants'
import {formatIC, dateLabel, sortSessions} from '../src/workspace/api'

let sessions, companies, participants
const summary = {total_training_revenue:148525.44,total_rebate_credit:120314,hrdc_paid_to_slx:131255.04,net_training_contribution:28211.44,rebate_credit_used:76909,unutilised_rebate_credit:43405,rebate_utilisation_percent:63.9,number_of_trainings:7,number_of_companies:2,total_participants:86}
beforeEach(() => {
  sessions = [{id:'s1',position:1,name:'April session',startDate:'2026-04-07',endDate:'2026-04-08',location:'Kuala Lumpur'}, {id:'s2',position:2,name:'September session',startDate:'2026-09-07',endDate:'2026-09-08',location:'Penang'}]
  companies = [{id:'c1',sessionId:'s1',companyName:'Same Company',participantCount:2,unitPrice:1799,total:3598,grantStatus:'approved',sessionName:'April session'}, {id:'c2',sessionId:'s2',companyName:'Same Company',participantCount:0,unitPrice:1799,total:0,grantStatus:'follow_up',sessionName:'September session'}]
  participants = [{id:'p1',fullName:'Sample Participant',icNumber:'900101-14-1234',applicationStatus:'registered'}]
  vi.stubGlobal('fetch', vi.fn(async (url,opts={}) => {
    let result = []
    if (opts.method) {
      const body=opts.body ? JSON.parse(opts.body) : {}
      if (url.includes('company-participants') && opts.method === 'PATCH' && body.icNumber === '900101-14-9999') return {ok:false,json:async()=>({error:{message:'This IC number has already been added for this company.'}})}
      if (url.includes('participants')) {
        if(opts.method === 'DELETE') participants=[]
        else if(opts.method === 'PATCH') participants=participants.map(p=>({...p,...body}))
        else participants.push({...body,id:'p2'})
      }
      result={...body,id:'saved',deleted:true}
    } else if (url.includes('/reporting')) result={summary,years:[2026],usage:[{name:'Monthly subscription',amount:50,count:1}],monthly:[{month:4,training_revenue:25905.6,rebate_issued:20985,net_contribution:4920.6,credit_used:11192,remaining_credit:9793,number_of_trainings:1},{month:9,training_revenue:17270.4,rebate_issued:13990,net_contribution:3280.4,credit_used:0,remaining_credit:13990,number_of_trainings:1}]}
    else if (url.endsWith('/training-sessions')) result=sessions
    else if (url.includes('/participants')) result=url.includes('/c2/') ? [] : participants
    else if(url.includes('/companies')) result=companies.filter(c=>url.includes(c.sessionId))
    return {ok:true,json:async()=>result}
  }))
})

test('date labels preserve September 7 and IC formatting keeps all 12 digits', () => {
  expect(dateLabel('2026-09-07')).toContain('7 Sept')
  expect(formatIC('900101141234')).toBe('900101-14-1234')
  expect(formatIC('900101-14-1234abc56')).toBe('900101-14-1234')
})
test('sorting keeps sequence numbers and does not mutate source order', () => {
  expect(sortSessions(sessions,'','latest',companies)[0].position).toBe(2)
  expect(sessions[0].position).toBe(1)
  expect(sortSessions(sessions,'april','number-desc',companies)).toHaveLength(1)
  expect(sortSessions(sessions,'','oldest',companies,'Penang')[0].id).toBe('s2')
})
test('session filter, search, expand, company link, edit, schedule and refresh buttons', async () => {
  const user=userEvent.setup(), edit=vi.fn(), openCompany=vi.fn(), refresh=vi.fn()
  const {container}=render(<Training data={{sessions,companies}} edit={edit} openCompany={openCompany} refresh={refresh}/>)
  await user.click(screen.getByRole('button',{name:'Filter sessions'}))
  await user.selectOptions(screen.getByLabelText('Sort sessions'),'latest')
  expect(container.querySelector('.session-title strong').textContent).toBe('September session')
  await user.click(screen.getByRole('button',{name:'Expand September session'}))
  await user.click(screen.getByRole('link',{name:'Same Company'}))
  expect(openCompany.mock.calls[0][0].id).toBe('c2')
  await user.click(screen.getByRole('button',{name:'Edit company Same Company'}))
  expect(edit.mock.calls.at(-1)[1].id).toBe('c2')
  await user.click(screen.getAllByRole('button',{name:'Add company'})[0])
  expect(edit.mock.calls.at(-1)[1].participantCount).toBe('')
  await user.click(screen.getAllByRole('button',{name:'Edit session'})[0])
  expect(edit.mock.calls.at(-1)[0]).toBe('session')
  await user.click(screen.getByRole('button',{name:'Schedule new session'}))
  expect(edit.mock.calls.at(-1)[1].name).toBe('')
  await user.type(screen.getByLabelText('Search sessions'),'april')
  expect(screen.queryByText('September session')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Reset filters'}))
  expect(screen.getByText('September session')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Refresh'}));expect(refresh).toHaveBeenCalled()
})
test('company form stays blank on clear, allows zero and computes participant total', async () => {
  const user=userEvent.setup(), saved=vi.fn(), close=vi.fn()
  render(<Editor kind="company" record={{sessionId:'s1',companyName:'',participantCount:'',grantStatus:'follow_up'}} saved={saved} close={close}/>)
  const number=screen.getByLabelText('Number of participants')
  expect(number.value).toBe('')
  await user.type(screen.getByLabelText('Company name'),'Test Company')
  await user.type(number,'3'); expect(screen.getByText('RM 5,397.00')).toBeTruthy()
  await user.clear(number); expect(number.value).toBe('')
  await user.type(number,'0'); await user.click(screen.getByRole('button',{name:'Add company'}))
  await waitFor(()=>expect(saved).toHaveBeenCalled())
  expect(JSON.parse(fetch.mock.calls.find(([,o])=>o.method==='POST')[1].body).participantCount).toBe(0)
})
test('edit session prefills date and sends same calendar day', async () => {
  const user=userEvent.setup(), saved=vi.fn()
  render(<Editor kind="session" record={sessions[1]} close={vi.fn()} saved={saved}/>)
  expect(screen.getByLabelText('Start date').value).toBe('2026-09-07')
  await user.click(screen.getByRole('button',{name:'Update session'}))
  await waitFor(()=>expect(saved).toHaveBeenCalled())
  expect(JSON.parse(fetch.mock.calls.find(([,o])=>o.method==='PATCH')[1].body).startDate).toBe('2026-09-07')
})
test('company removal requires confirmation, supports cancel, then sends DELETE', async () => {
  const user=userEvent.setup(), saved=vi.fn()
  render(<Editor kind="company" record={companies[0]} close={vi.fn()} saved={saved}/>)
  await user.click(screen.getByRole('button',{name:'Delete company'}))
  expect(fetch).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button',{name:'Keep company'}))
  expect(screen.queryByRole('button',{name:'Confirm removal'})).toBeNull()
  await user.click(screen.getByRole('button',{name:'Delete company'}));await user.click(screen.getByRole('button',{name:'Confirm removal'}))
  await waitFor(()=>expect(saved).toHaveBeenCalled())
  expect(fetch.mock.calls[0][0]).toContain('/training-companies/c1')
})
test('participant action opens edit, formats IC, shows duplicate error and saves status', async () => {
  const user=userEvent.setup()
  render(<Participants company={companies[0]} data={{sessions,companies}} back={vi.fn()} notify={vi.fn()}/>)
  await screen.findByText('Sample Participant')
  await user.click(screen.getByRole('button',{name:'Edit participant Sample Participant'}))
  const dialog=screen.getByRole('dialog'), ic=within(dialog).getByLabelText('IC number')
  await user.clear(ic);await user.type(ic,'900101149999');expect(ic.value).toBe('900101-14-9999')
  await user.click(within(dialog).getByRole('button',{name:'Update participant'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','This IC number has already been added for this company.')
  await user.clear(ic);await user.type(ic,'900101141234')
  await user.selectOptions(within(dialog).getByLabelText('Application status'),'pending_application')
  await user.click(within(dialog).getByRole('button',{name:'Update participant'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.querySelector('.slx-badge.pending_application')).toBeTruthy()
})
test('participant add, status filter, search and removal operate through the API', async () => {
  const user=userEvent.setup()
  render(<Participants company={companies[0]} data={{sessions,companies}} back={vi.fn()} notify={vi.fn()}/>)
  await screen.findByText('Sample Participant')
  await user.click(screen.getByRole('button',{name:'Add participant'}))
  const dialog=screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Participant name'),'New Participant')
  await user.type(within(dialog).getByLabelText('IC number'),'900101141111')
  await user.click(within(dialog).getByRole('button',{name:'Add participant'}))
  await screen.findByText('New Participant')
  await user.selectOptions(screen.getByLabelText('Filter application status'),'pending_application')
  expect(screen.queryByText('Sample Participant')).toBeNull()
  await user.type(screen.getByLabelText('Search participants'),'New')
  await user.click(screen.getByRole('button',{name:'Edit participant New Participant'}))
  await user.click(screen.getByRole('button',{name:'Remove participant'}))
  await user.click(screen.getByRole('button',{name:'Confirm removal'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(fetch.mock.calls.some(([url,o])=>url.endsWith('/company-participants/p2')&&o.method==='DELETE')).toBe(true)
})
test('all sidebar destinations, help, sidebar toggle and preferences respond', async () => {
  const user=userEvent.setup();render(<Workspace/>)
  await screen.findByText('RM 148,525.44')
  expect(screen.getByText(/Live totals from the training, company, participant and rebate records/)).toBeTruthy()
  expect(screen.getByText('Company records')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Toggle navigation'}));expect(document.querySelector('.nav-collapsed')).toBeTruthy()
  await user.click(screen.getByRole('link',{name:'Credit management'}));await screen.findByText('Allocation by usage type')
  await user.click(screen.getByRole('link',{name:'Participants'}));await screen.findByText('Participant register')
  await user.click(screen.getByRole('link',{name:'Settings'}));await user.selectOptions(screen.getByLabelText('Table spacing'),'compact')
  expect(localStorage.getItem('slx-density')).toBe('compact')
  await user.click(screen.getByRole('button',{name:'Reset preferences'}));expect(localStorage.getItem('slx-density')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Help & shortcuts'}));await user.click(screen.getByRole('button',{name:'Open training activity'}))
  expect(screen.getByRole('heading',{name:'Training sessions'})).toBeTruthy()
})
test('monthly selection, report modal, export and print actions work', async () => {
  const user=userEvent.setup(), print=vi.spyOn(window,'print').mockImplementation(()=>{}), download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  render(<Workspace/>);await screen.findByText('RM 148,525.44')
  await user.selectOptions(screen.getByLabelText('Reporting month'),'9')
  await user.click(screen.getByRole('button',{name:'View report →'}))
  const dialog=screen.getByRole('dialog')
  expect(within(dialog).queryByText('April')).toBeNull()
  expect(within(dialog).getAllByText('September').length).toBeGreaterThan(0)
  await user.click(within(dialog).getByRole('button',{name:'Download CSV'}));expect(download).toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button',{name:'Print / Save PDF'}));expect(print).toHaveBeenCalled()
  await user.click(within(dialog).getAllByRole('button',{name:'Close',exact:true})[1]);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  await user.click(screen.getByRole('button',{name:'Export report'}));await screen.findByRole('heading',{name:'Reports'})
})
test('network failure is visible and retry recovers the sessions', async () => {
  const user=userEvent.setup(), healthy=fetch.getMockImplementation()
  fetch.mockImplementation(async()=>{throw new Error('offline')})
  render(<Workspace/>);await screen.findAllByRole('alert')
  fetch.mockImplementation(healthy)
  await user.click(screen.getAllByRole('button',{name:'Try again'})[0])
  await user.click(screen.getByRole('link',{name:/Training activity/}))
  await screen.findByText('April session')
})

test('mobile navigation opens, closes via backdrop and Escape, and closes after selection', async () => {
  window.matchMedia.mockImplementation(query => ({matches:true,media:query,addEventListener(){},removeEventListener(){}}))
  const user=userEvent.setup();render(<Workspace/>);await screen.findByText('RM 148,525.44')
  await user.click(screen.getByRole('button',{name:'Toggle navigation'}));expect(document.querySelector('.nav-open')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Close navigation'}));expect(document.querySelector('.nav-open')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Toggle navigation'}));await user.keyboard('{Escape}');expect(document.querySelector('.nav-open')).toBeNull()
  await user.click(screen.getByRole('button',{name:'Toggle navigation'}));await user.click(screen.getByRole('link',{name:/Training activity/}));expect(document.querySelector('.nav-open')).toBeNull()
})

test('company deep link loads the correct ID and back returns to sessions', async () => {
  window.history.replaceState(null,'','#company/c2')
  const user=userEvent.setup();render(<Workspace/>)
  await screen.findByRole('heading',{name:'Same Company'})
  expect(screen.getByText('September session',{selector:'.slx-kicker'})).toBeTruthy()
  expect(fetch.mock.calls.some(([url])=>url.endsWith('/training-companies/c2/participants'))).toBe(true)
  await user.click(screen.getByRole('button',{name:'Back to training sessions'}))
  expect(await screen.findByRole('heading',{name:'Training sessions'})).toBeTruthy()
})

test('schedule form submits entered dates; Cancel and X do not write records', async () => {
  const user=userEvent.setup(), saved=vi.fn(), close=vi.fn()
  const record={name:'',startDate:'',endDate:'',location:''}
  const rendered=render(<Editor kind="session" record={record} close={close} saved={saved}/>)
  await user.click(screen.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button',{name:'Close'}));expect(close).toHaveBeenCalledTimes(2)
  rendered.unmount()
  render(<Editor kind="session" record={record} close={close} saved={saved}/>)
  await user.type(screen.getByLabelText('Session title'),'QA session')
  fireEvent.change(screen.getByLabelText('Start date'),{target:{value:'2026-09-07'}})
  fireEvent.change(screen.getByLabelText('End date'),{target:{value:'2026-09-08'}})
  await user.type(screen.getByLabelText('Location'),'Kuala Lumpur')
  await user.click(screen.getByRole('button',{name:'Schedule session'}));await waitFor(()=>expect(saved).toHaveBeenCalled())
  const body=JSON.parse(fetch.mock.calls.find(([,o])=>o.method==='POST')[1].body)
  expect(body).toMatchObject({name:'QA session',startDate:'2026-09-07',endDate:'2026-09-08',location:'Kuala Lumpur'})
  expect(body.referenceCode).toMatch(/^TRN-/)
})

test('failed save leaves the editor and entered values available for retry', async () => {
  const user=userEvent.setup(), saved=vi.fn(), close=vi.fn()
  fetch.mockResolvedValueOnce({ok:false,json:async()=>({error:{message:'Server unavailable. Try again.'}})})
  render(<Editor kind="company" record={companies[0]} close={close} saved={saved}/>)
  await user.click(screen.getByRole('button',{name:'Update company'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Server unavailable. Try again.')
  expect(screen.getByLabelText('Company name').value).toBe('Same Company');expect(close).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled()
})

test('all session sort modes return the expected order', () => {
  const records=[...companies,{...companies[0],id:'c3'}]
  for(const [mode,first] of [['oldest','s1'],['latest','s2'],['number-asc','s1'],['number-desc','s2'],['companies-desc','s1'],['companies-asc','s2'],['name','s1']]) expect(sortSessions(sessions,'',mode,records)[0].id).toBe(first)
})

test('participant export downloads a file, refresh reloads data, and empty search is clear', async () => {
  const user=userEvent.setup(), download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  render(<Participants company={companies[0]} data={{sessions,companies}} back={vi.fn()} notify={vi.fn()}/>)
  await screen.findByText('Sample Participant');await user.click(screen.getByRole('button',{name:'Export CSV'}));expect(download).toHaveBeenCalled()
  const count=fetch.mock.calls.length;await user.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('Sample Participant');expect(fetch.mock.calls.length).toBeGreaterThan(count)
  await user.type(screen.getByLabelText('Search participants'),'zzzz');expect(screen.getByText('No participants found')).toBeTruthy()
})
