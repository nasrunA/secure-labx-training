import React, {useMemo, useState} from 'react'
import {PageTitle, Panel, Button, Empty, Icon} from './UI'
import {api, labels, money} from './api'
import './TrainingRecords.css'

const PAYMENT_RATE = 0.96
const REBATE_PER_PARTICIPANT = 1399
const compactDate = value => {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}
const remarkTone = value => value === 'Bayaran Bil' ? 'bill' : value === 'Belian Device inc Langganan' ? 'device-subscription' : value === 'Bayaran Tunggakan' ? 'arrears' : value ? 'custom' : ''
function RemarkInput({row, save, disabled}) {
  const [value, setValue] = useState(row.remark)
  return <input className={`training-record-remark ${remarkTone(value)}`} list="training-remark-templates" value={value} placeholder="Add remark" disabled={disabled} onChange={event => setValue(event.target.value)} onBlur={() => {if (value !== row.remark) save(row, {rebateProfile:{...row.rebateProfile, trainingRemark:value}})}}/>
}

export default function TrainingRecords({training, refresh}) {
  const [search, setSearch] = useState('')
  const [session, setSession] = useState('')
  const [claimStatus, setClaimStatus] = useState('')
  const [rebateStatus, setRebateStatus] = useState('')
  const [savingId, setSavingId] = useState('')
  const rows = useMemo(() => training.sessions.flatMap((trainingSession, index) => training.companies.filter(company => company.sessionId === trainingSession.id).map(company => {
    const gross = Number(company.total || 0)
    const participants = Number(company.participantCount || 0)
    const received = gross * PAYMENT_RATE
    const rebate = participants * REBATE_PER_PARTICIPANT
    return {id:company.id, sessionNumber:String(trainingSession.position ?? index + 1).padStart(2, '0'), trainingDate:`${compactDate(trainingSession.startDate)} - ${compactDate(trainingSession.endDate)}`, companyName:company.companyName, participants, gross, received, rebate, net:received - rebate, claimStatus:company.grantStatus, rebateStatus:company.rebateStatus || (company.grantStatus === 'approved' ? 'fully_used' : 'unused'), rebateProfile:company.rebateProfile || {}, remark:company.rebateProfile?.trainingRemark || ''}
  })), [training])
  const sessions = [...new Set(rows.map(row => row.sessionNumber))]
  const claimStatuses = [...new Set(rows.map(row => row.claimStatus))]
  const shown = rows.filter(row => row.companyName.toLowerCase().includes(search.toLowerCase()) && (!session || row.sessionNumber === session) && (!claimStatus || row.claimStatus === claimStatus) && (!rebateStatus || row.rebateStatus === rebateStatus))
  const reset = () => {setSearch(''); setSession(''); setClaimStatus(''); setRebateStatus('')}
  const saveStatus = async (row, update) => {
    setSavingId(row.id)
    try {await api(`/training-companies/${row.id}`, {method:'PATCH', body:JSON.stringify(update)}); await refresh?.()}
    finally {setSavingId('')}
  }
  const grossTotal = rows.reduce((total, row) => total + row.gross, 0)
  const netTotal = rows.reduce((total, row) => total + row.net, 0)
  return <>
    <PageTitle kicker="TRAINING MANAGEMENT" title="Training Contribution Management">Manage training sessions, companies, claims, rebates and received payments in one interface.</PageTitle>
    <div className="training-record-metrics"><div><span>Training Sessions</span><strong>{training.sessions.length}</strong></div><div><span>Companies</span><strong>{rows.length}</strong></div><div><span>Gross Claim</span><strong>{money(grossTotal)}</strong></div><div><span>Net Contribution</span><strong>{money(netTotal)}</strong></div></div>
    <div className="training-record-filters"><label className="slx-search"><Icon name="search"/><input aria-label="Search company" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search company..."/></label><select aria-label="Filter training session" value={session} onChange={event => setSession(event.target.value)}><option value="">All sessions</option>{sessions.map(number => <option key={number} value={number}>Session {number}</option>)}</select><select aria-label="Filter claim status" value={claimStatus} onChange={event => setClaimStatus(event.target.value)}><option value="">All claim status</option>{claimStatuses.map(status => <option key={status} value={status}>{labels[status] || status}</option>)}</select><select aria-label="Filter rebate status" value={rebateStatus} onChange={event => setRebateStatus(event.target.value)}><option value="">All rebate status</option><option value="fully_used">Fully Used</option><option value="unused">Unused</option></select><Button onClick={reset}>Reset</Button></div>
    <Panel title="Training Records" action={<span className="training-record-count">Showing {shown.length} of {rows.length} records</span>}>
      {shown.length ? <><div className="slx-table-wrap"><table className="slx-table training-record-table"><thead><tr><th>Session</th><th>Training Date</th><th>Client / Company</th><th className="numeric">Participants</th><th className="numeric">Gross Claim</th><th className="numeric">Amount Received</th><th className="numeric">Rebate Credit</th><th className="numeric">Net Contribution</th><th>Claim</th><th>Rebate</th><th>Remark</th></tr></thead><tbody>{shown.map(row => <tr key={row.id}><td className="tabular"><strong>{row.sessionNumber}</strong></td><td>{row.trainingDate}</td><td><strong>{row.companyName}</strong></td><td className="numeric">{row.participants}</td><td className="numeric">{money(row.gross)}</td><td className="numeric">{money(row.received)}</td><td className="numeric">{money(row.rebate)}</td><td className="numeric amount">{money(row.net)}</td><td><select className={`training-record-status claim ${row.claimStatus}`} aria-label={`Claim status for ${row.companyName}`} disabled={savingId === row.id} value={row.claimStatus} onChange={event => saveStatus(row, {grantStatus:event.target.value})}><option value="follow_up">Follow up</option><option value="applied">Applied</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></td><td><select className={`training-record-status rebate ${row.rebateStatus}`} aria-label={`Rebate status for ${row.companyName}`} disabled={savingId === row.id} value={row.rebateStatus} onChange={event => saveStatus(row, {rebateStatus:event.target.value})}><option value="fully_used">Fully Used</option><option value="unused">Unused</option></select></td><td><RemarkInput row={row} save={saveStatus} disabled={savingId === row.id}/></td></tr>)}</tbody></table></div><datalist id="training-remark-templates"><option value="Bayaran Bil"/><option value="Belian Device"/><option value="Belian Device inc Langganan"/><option value="Bayaran Tunggakan"/></datalist></> : <Empty title="No training records found">Try a different filter or add a company to a training session.</Empty>}
    </Panel>
  </>
}
