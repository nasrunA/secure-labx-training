import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {PageTitle, Button, Panel, Badge, Action, Empty, ErrorMessage, Icon} from './UI'
import {api, downloadCSV, labels} from './api'
import Editor from './Editors'

export default function Participants({company, data, back, notify}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [session, setSession] = useState('')
  const sessionNumbers = useMemo(() => new Map(data.sessions.map((item, index) => [item.id, String(item.position ?? index + 1).padStart(2, '0')])), [data.sessions])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const companies = company ? [company] : data.companies
      const groups = await Promise.all(companies.map(async c => (await api(`/training-companies/${c.id}/participants`)).map(p => ({...p, companyId:c.id, companyName:c.companyName, sessionName:c.sessionName, sessionNumber:sessionNumbers.get(c.sessionId) || '—'}))))
      setRows(groups.flat())
    } catch (caught) {setError(caught.message)} finally {setLoading(false)}
  }, [company, data.companies, sessionNumbers])
  useEffect(() => {load()}, [load])
  const sessions = [...new Set(rows.map(row => row.sessionNumber).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, {numeric:true}))
  const shown = rows.filter(r => `${r.fullName} ${r.icNumber} ${r.companyName} ${r.sessionNumber}`.toLowerCase().includes(search.toLowerCase()) && (!status || r.applicationStatus === status) && (!session || r.sessionNumber === session))
  const fresh = () => setDraft({companyId:company.id, fullName:'', icNumber:'', applicationStatus:'pending_application'})
  return <>
    {company && <Button icon="back" variant="text" onClick={back}>Back to training sessions</Button>}
    <PageTitle kicker={company ? company.sessionName : 'REGISTRATION'} title={company ? company.companyName : 'Participants'} actions={<><Button icon="download" disabled={!shown.length} onClick={() => downloadCSV('participants.csv',['Participant','IC number','Status','Company','Session no.'],shown.map(r => [r.fullName,r.icNumber,labels[r.applicationStatus],r.companyName,r.sessionNumber]))}>Export CSV</Button>{company && <Button variant="primary" icon="plus" onClick={fresh}>Add participant</Button>}</>}>{company ? 'Participant registration and application status for this company.' : 'View participant records across all training sessions and companies.'}</PageTitle>
    <Panel title="Participant register" subtitle={company ? `Allocated participants: ${company.participantCount} · Registered records: ${rows.length}` : `${rows.length} participant records`}>
      <div className="slx-toolbar inside">
        <label className="slx-search"><Icon name="search"/><input aria-label="Search participants" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, IC number, company or session…"/></label>
        {!company && <select aria-label="Filter training session" value={session} onChange={e => setSession(e.target.value)}><option value="">All sessions</option>{sessions.map(number => <option key={number} value={number}>Session {number}</option>)}</select>}
        <select aria-label="Filter application status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="registered">Registered</option><option value="pending_application">Pending application</option></select>
        <Button icon="refresh" onClick={load}>Refresh</Button>
      </div>
      <ErrorMessage message={error} retry={load}/>
      {loading ? <div className="slx-loading">Loading participants…</div> : shown.length ? <div className="slx-table-wrap"><table className="slx-table"><thead><tr><th>#</th><th>Participant name</th><th>IC number</th>{!company && <><th>Company</th><th>Session no.</th></>}<th>Application status</th><th>Action</th></tr></thead><tbody>{shown.map((r,i) => <tr key={r.id}><td className="muted">{i+1}</td><td><strong>{r.fullName}</strong></td><td className="tabular">{r.icNumber}</td>{!company && <><td>{r.companyName}</td><td className="tabular">{r.sessionNumber}</td></>}<td><Badge value={r.applicationStatus}/></td><td><Action label={`Edit participant ${r.fullName}`} onClick={() => setDraft(r)}/></td></tr>)}</tbody></table></div> : !error && <Empty title="No participants found">{company ? 'Add a participant to this company to get started.' : 'Add participants by opening a company in Training activity.'}</Empty>}
    </Panel>
    {draft && <Editor kind="participant" record={draft} close={() => setDraft(null)} saved={async message => {await load(); notify(message)}}/>}
  </>
}
