import React, {useEffect, useState} from 'react'
import {Modal, Field, Button, ErrorMessage, DateInput} from './UI'
import {api, RATE, money, formatIC, formatPhone, labels} from './api'

export default function Editor({kind, record, close, saved, onDirtyChange}) {
  const [draft, setDraft] = useState(record)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(record)
  useEffect(() => {onDirtyChange?.(dirty)}, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const set = (key, value) => setDraft(old => ({...old, [key]: value}))
  const title = kind === 'session' ? (record.id ? 'Edit session' : 'Schedule new session') : `${record.id ? 'Edit' : 'Add'} ${kind}`
  const submit = async event => {
    event.preventDefault(); setError('')
    const name = kind === 'session' ? draft.name : kind === 'company' ? draft.companyName : draft.fullName
    if (!name?.trim()) return setError(`Please enter the ${kind === 'session' ? 'session title' : kind + ' name'}.`)
    if (kind === 'session' && draft.endDate < draft.startDate) return setError('End date must be on or after the start date.')
    if (kind === 'company' && (draft.participantCount === '' || !Number.isInteger(Number(draft.participantCount)) || Number(draft.participantCount) < 0)) return setError('Please enter a whole number of participants, 0 or more.')
    if (kind === 'participant' && !/^\d{6}-\d{2}-\d{4}$/.test(draft.icNumber)) return setError('Enter all 12 digits of the IC number.')
    if (kind === 'participant' && !/^\d{10,11}$/.test(draft.phoneNumber || '')) return setError('Enter a valid 10 or 11 digit phone number.')
    setBusy(true)
    try {
      let path, body
      if (kind === 'session') {
        path = record.id ? `/training-sessions/${record.id}` : '/training-sessions'
        body = {name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate, location: draft.location.trim()}
        if (!record.id) body.referenceCode = `TRN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      } else if (kind === 'company') {
        path = record.id ? `/training-companies/${record.id}` : `/training-sessions/${record.sessionId}/companies`
        body = {companyName: draft.companyName.trim(), participantCount: Number(draft.participantCount), grantStatus: draft.grantStatus}
      } else {
        path = record.id ? `/company-participants/${record.id}` : `/training-companies/${record.companyId}/participants`
        body = {fullName: draft.fullName.trim(), icNumber: draft.icNumber, phoneNumber: draft.phoneNumber, applicationStatus: draft.applicationStatus}
      }
      await api(path, {method: record.id ? 'PATCH' : 'POST', body: JSON.stringify(body)})
      await saved(`${kind[0].toUpperCase() + kind.slice(1)} ${record.id ? 'updated' : 'added'} successfully.`)
      close()
    } catch (caught) {setError(caught.message)} finally {setBusy(false)}
  }
  const remove = async () => {
    setBusy(true); setError('')
    try {
      const resource = kind === 'session' ? 'training-sessions' : kind === 'company' ? 'training-companies' : 'company-participants'
      await api(`/${resource}/${record.id}`, {method: 'DELETE'})
      await saved(`${kind === 'session' ? 'Session' : kind === 'company' ? 'Company' : 'Participant'} removed successfully.`); close()
    } catch (caught) {setError(caught.message)} finally {setBusy(false)}
  }
  return <Modal title={title} close={close} busy={busy || dirty}><form onSubmit={submit}>
    <fieldset disabled={busy} className="slx-form-grid">
      {kind === 'session' && <>
        <div className="full"><Field label="Session title"><input autoFocus required maxLength={180} value={draft.name} onChange={e => set('name', e.target.value)}/></Field></div>
        <Field label="Start date"><DateInput required value={draft.startDate || ''} onChange={e => set('startDate', e.target.value)}/></Field>
        <Field label="End date"><DateInput required min={draft.startDate} value={draft.endDate || ''} onChange={e => set('endDate', e.target.value)}/></Field>
        <div className="full"><Field label="Location"><input maxLength={120} value={draft.location || ''} onChange={e => set('location', e.target.value)} placeholder="City or venue"/></Field></div>
      </>}
      {kind === 'company' && <>
        <div className="full"><Field label="Company name"><input autoFocus required maxLength={180} value={draft.companyName} onChange={e => set('companyName', e.target.value)}/></Field></div>
        <Field label="Number of participants"><input required type="number" min="0" step="1" placeholder="Enter a number" value={draft.participantCount} onChange={e => set('participantCount', e.target.value)}/></Field>
        <Field label="Grant status"><select value={draft.grantStatus} onChange={e => set('grantStatus', e.target.value)}>{['follow_up','applied','approved','rejected'].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></Field>
        {draft.participantCount === '' && <small className="full validation">Please enter a participant count of at least 0.</small>}
        <div className="full total-preview"><span>Unit price <b>{money(RATE)}</b></span><span>Total <strong>{money(Math.max(0, Number(draft.participantCount) || 0) * RATE)}</strong></span></div>
      </>}
      {kind === 'participant' && <>
        <div className="full"><Field label="Participant name"><input autoFocus required maxLength={160} value={draft.fullName} onChange={e => set('fullName', e.target.value)}/></Field></div>
        <Field label="IC number"><input required inputMode="numeric" pattern="[0-9]{6}-[0-9]{2}-[0-9]{4}" title="Enter 12 digits, for example 900101-14-1234" placeholder="900101-14-1234" value={draft.icNumber} onChange={e => set('icNumber', formatIC(e.target.value))}/></Field>
        <Field label="Phone number"><input required type="tel" inputMode="numeric" pattern="[0-9]{10,11}" title="Enter a 10 or 11 digit phone number, for example 0169272236" placeholder="0169272236" value={draft.phoneNumber || ''} onChange={e => set('phoneNumber', formatPhone(e.target.value))}/></Field>
        <Field label="Application status"><select value={draft.applicationStatus} onChange={e => set('applicationStatus', e.target.value)}><option value="pending_application">Pending application</option><option value="registered">Registered</option></select></Field>
      </>}
    </fieldset>
    <ErrorMessage message={error}/>
    {confirmDelete && <div className="delete-confirm" role="alert"><strong>Remove this {kind}?</strong><p>{kind === 'session' ? 'All companies, participants, rebate information, and uploaded files stored under this session will also be removed. This cannot be undone.' : kind === 'company' ? 'Its participant records will also be removed. This cannot be undone.' : 'This participant record will be permanently removed.'}</p><Button variant="danger" disabled={busy} onClick={remove}>Confirm removal</Button><Button disabled={busy} onClick={() => setConfirmDelete(false)}>Keep {kind}</Button></div>}
    <footer className="form-actions">
      {record.id && <Button variant="danger-quiet" disabled={busy} onClick={() => setConfirmDelete(true)}>{kind === 'session' ? 'Delete session' : kind === 'company' ? 'Delete company' : 'Remove participant'}</Button>}
      {dirty && <span className="unsaved-note">Unsaved changes</span>}<span className="spacer"/><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : record.id ? `Update ${kind}` : kind === 'session' ? 'Schedule session' : `Add ${kind}`}</Button>
    </footer>
  </form></Modal>
}
