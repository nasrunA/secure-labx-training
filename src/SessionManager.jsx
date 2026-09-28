import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {CButton, CCard, CCardBody, CFormInput, CModal, CModalBody, CModalHeader, CModalTitle, CTable} from '@coreui/react'

const RATE = 1799
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'
const rm = (value) => `RM ${Number(value || 0).toLocaleString('en-MY', {minimumFractionDigits: 2})}`
const date = (value) => value ? new Intl.DateTimeFormat('en-MY', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : 'Not set'

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {headers: {'Content-Type': 'application/json'}, ...options})
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Unable to complete this request.')
  return body
}

const toCompany = (record, sessionId) => ({
  id: record.id, sessionId, client: record.companyName, people: Number(record.participantCount),
  gross: Number(record.total), claim: record.grantStatus,
})

function CompanyModal({draft, setDraft, onSave, onDelete, onClose, saving, error}) {
  if (!draft) return null
  const rawPeople = draft.people ?? ''
  const people = rawPeople === '' ? 0 : Number(rawPeople)
  const validPeople = rawPeople !== '' && Number.isInteger(people) && people >= 0
  const total = validPeople ? people * RATE : 0
  return <CModal visible onClose={onClose} alignment="center" className="training-editor">
    <CModalHeader closeButton><CModalTitle>{draft.id ? 'Edit company' : 'Add company to session'}</CModalTitle></CModalHeader>
    <CModalBody>
      <div className="editor-grid">
        <label>Company name<input value={draft.client} onChange={(event) => setDraft({...draft, client: event.target.value})}/></label>
        <label>Number of participants<input type="number" min="0" placeholder="Enter participants" value={rawPeople} onChange={(event) => setDraft({...draft, people: event.target.value})}/></label>
        <label>Grant status<select value={draft.claim} onChange={(event) => setDraft({...draft, claim: event.target.value})}><option value="follow_up">Follow up-ed</option><option value="applied">Applied</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <div className="gross-preview"><span>Unit price: RM 1,799.00</span><b>Total: {rm(total)}</b><small>{validPeople ? `RM 1,799.00 × ${people} participant${people !== 1 ? 's' : ''}` : 'Enter at least 0 participants.'}</small></div>
      </div>
      {!validPeople && <p className="participant-error">Please enter at least 0 participants.</p>}
      {error && <p className="participant-error">{error}</p>}
      <div className="editor-actions">
        {draft.id && <button className="modal-delete" disabled={saving} onClick={() => onDelete(draft.id)}>Delete company</button>}
        <CButton color="light" disabled={saving} onClick={onClose}>Cancel</CButton>
        <CButton className="add-training" disabled={!draft.client.trim() || !validPeople || saving} onClick={() => onSave({...draft, people, gross: total})}>{saving ? 'Saving…' : draft.id ? 'Update company' : 'Add company'}</CButton>
      </div>
    </CModalBody>
  </CModal>
}

function SessionEditor({draft, setDraft, onSave, onClose, saving, error}) {
  if (!draft) return null
  const isNew = draft.mode === 'new'
  return <div className="session-editor-overlay" role="dialog" aria-modal="true">
    <section className="session-editor-modal">
      <button className="session-editor-close" onClick={onClose} aria-label="Close">×</button>
      <h2>{isNew ? 'Schedule new session' : 'Edit session'}</h2>
      <p>{isNew ? 'Enter the details for the upcoming training session.' : 'Update the session information below.'}</p>
      <label>Session title<input value={draft.name} onChange={(event) => setDraft({...draft, name: event.target.value})}/></label>
      <div className="session-date-fields"><label><span>Start date</span><input type="date" value={String(draft.startDate || '').slice(0, 10)} onChange={(event) => setDraft({...draft, startDate: event.target.value})}/></label><label><span>End date</span><input type="date" value={String(draft.endDate || '').slice(0, 10)} min={String(draft.startDate || '').slice(0, 10)} onChange={(event) => setDraft({...draft, endDate: event.target.value})}/></label></div>
      <label>Location<input value={draft.location || ''} onChange={(event) => setDraft({...draft, location: event.target.value})}/></label>
      {error && <p className="participant-error">{error}</p>}
      <footer><button className="session-editor-cancel" disabled={saving} onClick={onClose}>Cancel</button><button className="session-editor-save" disabled={saving || !draft.name.trim() || !draft.startDate || !draft.endDate} onClick={onSave}>{saving ? 'Saving…' : isNew ? 'Schedule session' : 'Save changes'}</button></footer>
    </section>
  </div>
}

function Session({session, companies, onEdit, onAdd, onDelete, onEditSession}) {
  const [open, setOpen] = useState(false)
  const total = companies.reduce((sum, item) => sum + item.gross, 0)
  return <CCard className="session-card"><div className="session-heading"><button className="session-toggle" onClick={() => setOpen(!open)}><span className="session-number">{String(session.position).padStart(2, '0')}</span><span><b>{session.name}</b><small>{date(session.startDate)} – {date(session.endDate)} · {session.location || 'No location'}</small></span><span className="company-count">{companies.length} companies</span><span className="chevron">{open ? '⌃' : '⌄'}</span></button><button className="session-edit" onClick={() => onEditSession(session)}>Edit session</button><CButton className="add-company" onClick={() => onAdd(session.id)}>+ Add company</CButton></div>{open && <CCardBody><div className="session-summary"><span><b>{date(session.startDate)}</b> start date</span><span><b>{date(session.endDate)}</b> end date</span><span><b>{companies.reduce((sum, item) => sum + item.people, 0)}</b> total participants</span><span><b>{rm(total)}</b> session total</span></div><div className="company-table-wrap"><CTable className="company-table simple-company-table" hover><thead><tr><th>#</th><th>Nama Syarikat / Company</th><th>Number of participants</th><th>Unit Price (RM)</th><th>Total (RM)</th><th>Grant Status</th><th>Action</th></tr></thead><tbody>{companies.map((record, index) => <tr key={record.id}><td>{index + 1}</td><td className="client-cell">{record.client}</td><td>{record.people}</td><td>{rm(RATE)}</td><td className="net-cell">{rm(record.gross)}</td><td><span className={`compact-status ${record.claim}`}>{record.claim.replace('_', ' ')}</span></td><td><button className="edit-record" onClick={() => onEdit(record)}>Edit</button><button className="delete-record" onClick={() => onDelete(record.id)}>Delete</button></td></tr>)}</tbody></CTable></div></CCardBody>}</CCard>
}

export default function SessionManager() {
  const [sessions, setSessions] = useState([])
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [companyDraft, setCompanyDraft] = useState(null)
  const [sessionDraft, setSessionDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const records = await request('/training-sessions')
      const ordered = records.map((record, index) => ({...record, position: index + 1}))
      const companyGroups = await Promise.all(ordered.map(async (session) => (await request(`/training-sessions/${session.id}/companies`)).map((record) => toCompany(record, session.id))))
      setSessions(ordered); setCompanies(companyGroups.flat())
    } catch (caught) { setError(caught.message || 'Unable to load training data.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const shown = useMemo(() => sessions.filter((session) => `${session.name} ${session.location || ''}`.toLowerCase().includes(query.toLowerCase())), [sessions, query])

  const saveCompany = async (item) => {
    setSaving(true); setError('')
    const body = {companyName: item.client.trim(), participantCount: item.people, grantStatus: item.claim}
    try {
      const record = item.id ? await request(`/training-companies/${item.id}`, {method: 'PATCH', body: JSON.stringify(body)}) : await request(`/training-sessions/${item.sessionId}/companies`, {method: 'POST', body: JSON.stringify(body)})
      const next = toCompany(record, item.sessionId)
      setCompanies((rows) => item.id ? rows.map((row) => row.id === item.id ? next : row) : [...rows, next])
      setCompanyDraft(null)
    } catch (caught) { setError(caught.message || 'Unable to save company.') }
    finally { setSaving(false) }
  }
  const deleteCompany = async (id) => {
    if (!window.confirm('Delete this company record?')) return
    setSaving(true); setError('')
    try { await request(`/training-companies/${id}`, {method: 'DELETE'}); setCompanies((rows) => rows.filter((row) => row.id !== id)); setCompanyDraft(null) }
    catch (caught) { setError(caught.message || 'Unable to delete company.') }
    finally { setSaving(false) }
  }
  const saveSession = async () => {
    if (!sessionDraft) return
    setSaving(true); setError('')
    try {
      const isNew = sessionDraft.mode === 'new'
      const body = {name: sessionDraft.name.trim(), startDate: sessionDraft.startDate, endDate: sessionDraft.endDate, location: sessionDraft.location?.trim() || undefined}
      if (isNew) body.referenceCode = `TRN-${sessionDraft.startDate.replaceAll('-', '')}-${Date.now().toString().slice(-5)}`
      const record = isNew ? await request('/training-sessions', {method: 'POST', body: JSON.stringify(body)}) : await request(`/training-sessions/${sessionDraft.id}`, {method: 'PATCH', body: JSON.stringify(body)})
      setSessions((rows) => isNew ? [...rows, {...record, position: rows.length + 1}] : rows.map((row) => row.id === record.id ? {...record, position: row.position} : row))
      setSessionDraft(null)
    } catch (caught) { setError(caught.message || 'Unable to save session.') }
    finally { setSaving(false) }
  }
  const beginSchedule = () => setSessionDraft({mode: 'new', name: '', startDate: '', endDate: '', location: ''})
  const beginEdit = (session) => setSessionDraft({...session, mode: 'edit'})

  return <div className="training-page content"><div className="page-title"><div><p className="eyebrow">training management</p><h1>Training sessions</h1><p className="subtitle">Manage company details, participants, unit pricing, totals, and grant status.</p></div><CButton className="add-training" onClick={beginSchedule}>+ Schedule new session</CButton></div><div className="session-toolbar"><CFormInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a session or location..."/><span>{sessions.length} sessions · {companies.length} company records</span></div>{error && !companyDraft && !sessionDraft && <div className="participant-error">{error} <button className="session-edit" onClick={load}>Try again</button></div>}{loading ? <p className="subtitle">Loading training sessions…</p> : <div className="session-list">{shown.map((session) => <Session key={session.id} session={session} companies={companies.filter((company) => company.sessionId === session.id)} onEdit={(company) => {setError(''); setCompanyDraft(company)}} onAdd={(id) => {setError(''); setCompanyDraft({sessionId: id, client: '', people: '', claim: 'follow_up'})}} onDelete={deleteCompany} onEditSession={beginEdit}/>)}</div>}<CompanyModal draft={companyDraft} setDraft={setCompanyDraft} onSave={saveCompany} onDelete={deleteCompany} onClose={() => {setCompanyDraft(null); setError('')}} saving={saving} error={error}/><SessionEditor draft={sessionDraft} setDraft={setSessionDraft} onSave={saveSession} onClose={() => {setSessionDraft(null); setError('')}} saving={saving} error={error}/></div>
}
