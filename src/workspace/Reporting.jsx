import React, {useCallback, useEffect, useState} from 'react'
import {PageTitle, Panel, Button, Empty, ErrorMessage, Modal, Icon} from './UI'
import {api, money, dateLabel, downloadCSV} from './api'
import logo from '../../logoSlx.png'
import './FilterEnhancements.css'

export const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
const columns = ['Month','Training revenue','Rebate issued','Net contribution','Credit used','Remaining credit','No. of trainings']
const keys = ['training_revenue','rebate_issued','net_contribution','credit_used','remaining_credit','number_of_trainings']
function MonthlyTable({rows}) {return <div className="slx-table-wrap"><table className="slx-table monthly-table"><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.month}><td>{months[r.month-1]}</td>{keys.map(k => <td className="numeric" key={k}>{k === 'number_of_trainings' ? r[k] : money(r[k])}</td>)}</tr>)}</tbody><tfoot><tr><th>Total</th>{keys.map(k => <th className="numeric" key={k}>{k === 'number_of_trainings' ? rows.reduce((s,r) => s+Number(r[k]),0) : money(rows.reduce((s,r) => s+Number(r[k]),0))}</th>)}</tr></tfoot></table></div>}

export default function Reporting({view = 'dashboard', training, navigate}) {
  const [year, setYear] = useState('2026')
  const [month, setMonth] = useState('all')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recordFilter, setRecordFilter] = useState('all')
  const [sessionLocation, setSessionLocation] = useState('')
  const load = useCallback(async () => {setLoading(true); setError(''); try {setData(await api(`/reporting?year=${year}`))} catch(e){setError(e.message)} finally {setLoading(false)}}, [year])
  useEffect(() => {load()}, [load])
  const baseRows = data?.monthly.filter(r => month === 'all' || Number(month) === r.month) || []
  const reportRows = baseRows.filter(row => months[row.month-1].toLowerCase().includes(query.toLowerCase()) && (recordFilter === 'all' || (recordFilter === 'with_activity' ? Number(row.number_of_trainings) > 0 : Number(row.number_of_trainings) === 0)))
  const rows = view === 'reports' ? reportRows : baseRows
  const sessionLocations = [...new Set(training.sessions.map(item => item.location).filter(Boolean))].sort()
  const sessionRows = training.sessions.filter(item => `${item.name} ${item.referenceCode || ''} ${item.location || ''}`.toLowerCase().includes(query.toLowerCase()) && (!sessionLocation || item.location === sessionLocation))
  const exportReport = () => view === 'credit'
    ? downloadCSV(`credit-usage-${year}.csv`, ['Usage type','Amount used','No. of usage'], filteredUsage.map(u => [u.name,u.amount,u.count]))
    : downloadCSV(`monthly-training-performance-${year}.csv`,columns,rows.map(r => [months[r.month-1],...keys.map(k => r[k])]))
  const annual = data?.summary
  const isDashboard = view === 'dashboard'
  const usage = data?.usage || []
  const filteredUsage = usage.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (recordFilter === 'all' || (recordFilter === 'used' ? Number(item.amount) > 0 : Number(item.amount) === 0)))
  const usageTotal = usage.reduce((a,u) => a+Number(u.amount),0)
  const selectors = <div className="report-selectors"><label>Reporting year<select aria-label="Reporting year" value={year} onChange={e => setYear(e.target.value)}>{[...new Set([Number(year),...(data?.years || [])])].sort().reverse().map(y => <option key={y}>{y}</option>)}</select></label>{view !== 'credit' && <label>Reporting month<select aria-label="Reporting month" value={month} onChange={e => setMonth(e.target.value)}><option value="all">All months</option>{months.map((m,i) => <option key={m} value={i+1}>{m}</option>)}</select></label>}</div>
  const resetFilters = () => {setQuery(''); setRecordFilter('all'); setSessionLocation('')}
  const resultCount = isDashboard ? sessionRows.length : view === 'credit' ? filteredUsage.length : rows.length
  const filterToolbar = <div className="module-data-toolbar"><label className="slx-search"><Icon name="search"/><input aria-label={`Search ${view}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={isDashboard ? 'Search sessions, references or locations...' : view === 'credit' ? 'Search credit usage type...' : 'Search reporting month...'}/></label>{isDashboard && <select aria-label="Filter dashboard sessions by location" value={sessionLocation} onChange={event => setSessionLocation(event.target.value)}><option value="">All locations</option>{sessionLocations.map(location => <option key={location}>{location}</option>)}</select>}{view === 'credit' && <select aria-label="Filter credit usage" value={recordFilter} onChange={event => setRecordFilter(event.target.value)}><option value="all">All usage records</option><option value="used">Credit used</option><option value="unused">No credit used</option></select>}{view === 'reports' && <select aria-label="Filter report activity" value={recordFilter} onChange={event => setRecordFilter(event.target.value)}><option value="all">All months</option><option value="with_activity">Months with training</option><option value="no_activity">Months without training</option></select>}<Button onClick={resetFilters}>Reset filters</Button><span className="toolbar-count">{resultCount} matching records</span></div>
  return <>
    <PageTitle kicker="TRAINING & REBATE CREDIT" title={isDashboard ? 'Dashboard' : view === 'credit' ? 'Credit management' : 'Reports'} actions={isDashboard ? <Button icon="training" variant="primary" onClick={() => navigate('training')}>Training activity</Button> : <Button icon="download" disabled={view === 'credit' ? !filteredUsage.length : !rows.length} onClick={exportReport}>Export CSV</Button>}>{isDashboard ? 'A clear view of your training revenue and credit position.' : view === 'credit' ? 'Recorded rebate credit, utilisation and balances.' : 'Monthly training performance and financial reporting.'}</PageTitle>
    <div className="report-toolbar">{selectors}<span className="subtle">{year} reporting records</span></div>
    {filterToolbar}
    <ErrorMessage message={error} retry={load}/>
    {loading ? <div className="slx-loading">Loading reporting records…</div> : !annual ? !error && <Panel><Empty title="No reporting records for this year"/></Panel> : <>
      {isDashboard && <>
        <div className="metric-grid primary-metrics">{[['Total training revenue',annual.total_training_revenue,'Training revenue recorded'],['Total rebate credit',annual.total_rebate_credit,'Credit issued to companies'],['HRDC paid to SLX',annual.hrdc_paid_to_slx,'Claim payments received'],['Net training contribution',annual.net_training_contribution,'Revenue less rebate issued']].map(([label,value,note]) => <div className="metric" key={label}><span>{label}</span><strong>{money(value)}</strong><small>{note}</small></div>)}</div>
        <div className="metric-grid secondary-metrics">{[['Rebate credit used',money(annual.rebate_credit_used)],['Unutilised credit',money(annual.unutilised_rebate_credit)],['Rebate utilisation',`${Number(annual.rebate_utilisation_percent).toFixed(1)}%`],['No. of trainings',annual.number_of_trainings],['Company records',annual.number_of_companies],['Total participants',annual.total_participants]].map(([label,value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <p className="data-note"><span className="live-data-dot"/>Live totals from the training, company, participant and rebate records stored in the database.</p>
        <div className="dashboard-panels">
          <Panel title="Monthly training performance" subtitle={month === 'all' ? `January – December ${year}` : `${months[Number(month)-1]} ${year}`} action={<Button variant="text" onClick={() => setReportOpen(true)}>View report →</Button>}>
            <div className="chart-legend"><span><i/>Training revenue</span><span><i/>Rebate issued</span><span><i/>Net contribution</span></div>
            <div className="performance-chart"><div className="chart-scale"><span>RM 60k</span><span>40k</span><span>20k</span><span>0</span></div><div className="chart-bars">{rows.map(r => <div className="chart-month" key={r.month}><div className="chart-columns">{['training_revenue','rebate_issued','net_contribution'].map(k => <div key={k} title={`${months[r.month-1]} · ${k.replaceAll('_',' ')}: ${money(r[k])}`} style={{height:`${Math.min(Number(r[k])/60000*100,100)}%`}}/>)}</div><span>{months[r.month-1].slice(0,3)}</span></div>)}</div></div>
          </Panel>
          <Panel title="Rebate utilisation" subtitle="Annual credit position"><div className="credit-donut" style={{'--utilisation':`${annual.rebate_utilisation_percent}%`}}><div><b>{Number(annual.rebate_utilisation_percent).toFixed(1)}%</b><span>credit utilised</span></div></div><div className="balance-lines"><span>Used <b>{money(annual.rebate_credit_used)}</b></span><span>Available <b>{money(annual.unutilised_rebate_credit)}</b></span></div></Panel>
        </div>
        <Panel title="Training sessions" subtitle="All sessions from your live training register" action={<Button variant="text" onClick={() => navigate('training')}>Manage activity →</Button>}><div className="slx-table-wrap"><table className="slx-table"><thead><tr><th>Session</th><th>Training dates</th><th>Location</th><th className="numeric">Companies</th><th className="numeric">Participants</th></tr></thead><tbody>{sessionRows.map(s => <tr key={s.id}><td><a href="#training" onClick={e => {e.preventDefault();navigate('training')}}>{s.name}</a><small>{s.referenceCode||'Reference not recorded'}</small></td><td>{dateLabel(s.startDate)} to {dateLabel(s.endDate)}</td><td>{s.location || 'Location not recorded'}</td><td className="numeric">{training.companies.filter(c => c.sessionId === s.id).length}</td><td className="numeric">{training.companies.filter(c => c.sessionId === s.id).reduce((a,c) => a+Number(c.participantCount),0)}</td></tr>)}</tbody></table>{!sessionRows.length && <Empty title="No matching training sessions">Adjust the search or location filter.</Empty>}</div></Panel>
      </>}
      {view === 'credit' && <><div className="metric-grid primary-metrics">{[['Total rebate credit',annual.total_rebate_credit],['Rebate credit used',annual.rebate_credit_used],['Available balance',annual.unutilised_rebate_credit]].map(([l,v]) => <div className="metric" key={l}><span>{l}</span><strong>{money(v)}</strong></div>)}</div><Panel title="Credit usage" subtitle="Allocation by usage type">{filteredUsage.length?<div className="slx-table-wrap"><table className="slx-table"><thead><tr><th>Usage type</th><th className="numeric">Amount used</th><th className="numeric">No. of usage</th><th className="numeric">Share</th></tr></thead><tbody>{filteredUsage.map(u => <tr key={u.name}><td>{u.name||'Usage type not recorded'}</td><td className="numeric">{money(u.amount)}</td><td className="numeric">{u.count}</td><td className="numeric">{usageTotal ? (Number(u.amount)/usageTotal*100).toFixed(1) : '0.0'}%</td></tr>)}</tbody></table></div>:<Empty title="No matching credit usage">Adjust the search or usage filter.</Empty>}</Panel></>}
      {view === 'reports' && <Panel title="Monthly training performance" subtitle={`${month === 'all' ? 'All months' : months[Number(month)-1]} · ${year}`} action={<Button onClick={() => setReportOpen(true)}>Open print report</Button>}>{rows.length?<MonthlyTable rows={rows}/>:<Empty title="No matching reporting months">Adjust the search or activity filter.</Empty>}</Panel>}
    </>}
    {reportOpen && <Modal size="xl" title="Monthly training performance" close={() => setReportOpen(false)}><article className="report-sheet"><header><img src={logo} alt="Secure LabX"/><div><strong>SECURE LABX</strong><h2>Monthly training performance</h2><p>{year} · {month === 'all' ? 'All months' : months[Number(month)-1]}</p></div></header><MonthlyTable rows={rows}/><footer>© 2026 Secure LabX. All Rights Reserved. · Website developed by Nasrun Amin.</footer></article><div className="form-actions no-print"><Button onClick={() => setReportOpen(false)}>Close</Button><Button icon="download" onClick={exportReport}>Download CSV</Button><Button variant="primary" onClick={() => window.print()}>Print / Save PDF</Button></div></Modal>}
  </>
}
