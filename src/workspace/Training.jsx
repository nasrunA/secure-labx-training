import React, {useMemo, useState} from 'react'
import {PageTitle, Button, Icon, Panel, Badge, Action, Empty} from './UI'
import {dateLabel, money, RATE, sortSessions} from './api'

export default function Training({data, edit, openCompany, refresh}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('oldest')
  const [location, setLocation] = useState('')
  const [filters, setFilters] = useState(false)
  const [expanded, setExpanded] = useState({})
  const shown = useMemo(() => sortSessions(data.sessions, search, sort, data.companies, location), [data, search, sort, location])
  const options = [['oldest','Oldest to latest'],['latest','Latest to oldest'],['number-asc','Session number: low to high'],['number-desc','Session number: high to low'],['companies-desc','Most companies'],['companies-asc','Fewest companies'],['name','Session name: A–Z']]
  return <>
    <PageTitle kicker="TRAINING MANAGEMENT" title="Training sessions" actions={<Button variant="primary" icon="plus" onClick={() => edit('session', {name:'', startDate:'', endDate:'', location:''})}>Schedule new session</Button>}>Schedule training, manage companies and register participants.</PageTitle>
    <div className="mini-stats"><span><b>{data.sessions.length}</b> Sessions</span><span><b>{data.companies.length}</b> Company records</span><span><b>{data.companies.reduce((a,c) => a + Number(c.participantCount),0)}</b> Participants allocated</span></div>
    <div className="slx-toolbar"><label className="slx-search"><Icon name="search"/><input aria-label="Search sessions" placeholder="Search sessions or locations…" value={search} onChange={e => setSearch(e.target.value)}/></label><Button icon="filter" aria-expanded={filters} onClick={() => setFilters(!filters)}>Filter sessions{sort !== 'oldest' || location ? ' •' : ''}</Button><Button icon="refresh" onClick={refresh}>Refresh</Button><span className="toolbar-count">{shown.length} of {data.sessions.length} sessions</span></div>
    {filters && <div className="slx-filter-panel"><label>Sort by<select aria-label="Sort sessions" value={sort} onChange={e => setSort(e.target.value)}>{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Location<select value={location} onChange={e => setLocation(e.target.value)}><option value="">All locations</option>{[...new Set(data.sessions.map(s => s.location).filter(Boolean))].sort().map(l => <option key={l}>{l}</option>)}</select></label><Button onClick={() => {setSort('oldest'); setLocation(''); setSearch('')}}>Reset filters</Button></div>}
    <div className="slx-session-list">{shown.map(session => {
      const companies = data.companies.filter(c => c.sessionId === session.id)
      const open = !!expanded[session.id]
      return <Panel key={session.id} className="slx-session">
        <div className="slx-session-heading"><button className="session-disclosure" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${session.name}`} onClick={() => setExpanded({...expanded, [session.id]:!open})}><span className="session-sequence">{String(session.position).padStart(2,'0')}</span><span className="session-title"><strong>{session.name}</strong><small>{dateLabel(session.startDate)} – {dateLabel(session.endDate)}<i/> {session.location || 'No location'}</small></span><span className="company-count">{companies.length} companies</span><Icon name="chevron" className={open ? 'rotated' : ''}/></button><div className="session-actions"><Button onClick={() => edit('session', {...session, location:session.location || ''})}>Edit session</Button><Button icon="plus" variant="soft" onClick={() => edit('company', {sessionId:session.id, companyName:'', participantCount:'', grantStatus:'follow_up'})}>Add company</Button></div></div>
        {open && <><div className="session-details"><span>Start date <b>{dateLabel(session.startDate)}</b></span><span>End date <b>{dateLabel(session.endDate)}</b></span><span>Participants <b>{companies.reduce((a,c) => a + Number(c.participantCount),0)}</b></span><span>Session total <b>{money(companies.reduce((a,c) => a + Number(c.total),0))}</b></span></div>{companies.length ? <div className="slx-table-wrap"><table className="slx-table company-table"><thead><tr><th>#</th><th>Company name</th><th className="numeric">Participants</th><th className="numeric">Unit price (RM)</th><th className="numeric">Total (RM)</th><th>Grant status</th><th>Action</th></tr></thead><tbody>{companies.map((c,i) => <tr key={c.id}><td className="muted">{i+1}</td><td><a href={`#company/${c.id}`} onClick={e => {e.preventDefault(); openCompany(c)}}>{c.companyName}</a></td><td className="numeric">{c.participantCount}</td><td className="numeric">{money(c.unitPrice ?? RATE)}</td><td className="numeric amount">{money(c.total)}</td><td><Badge value={c.grantStatus}/></td><td><Action label={`Edit company ${c.companyName}`} onClick={() => edit('company',c)}/></td></tr>)}</tbody></table></div> : <Empty title="No companies in this session">Select Add company to create the first record.</Empty>}</>}
      </Panel>
    })}{!shown.length && <Panel><Empty title="No matching sessions">Adjust your search or schedule a new session.</Empty></Panel>}</div>
  </>
}
