import React, {useCallback, useEffect, useState} from 'react'
import logo from '../../logoSlx.png'
import {loadTraining, downloadCSV, labels} from './api'
import {Icon, Button, ErrorMessage, Modal, Panel, PageTitle, Field} from './UI'
import Training from './Training'
import Participants from './Participants'
import TrainingRecords from './TrainingRecords'
import RebateManagement from './RebateManagement'
import Summary from './Summary'
import Reporting from './Reporting'
import Editor from './Editors'

const navigation = [['dashboard','dashboard','Dashboard'],['training','training','Training activity'],['training-records','report','Training records'],['rebate-management','credit','Rebate management'],['summary','report','Summary'],['credit','credit','Credit management'],['participants','people','Participants'],['reports','report','Reports'],['settings','settings','Settings']]
const route = () => window.location.hash.slice(1) || 'dashboard'
export default function Workspace() {
  const [page, setPage] = useState(route)
  const [sidebar, setSidebar] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [data, setData] = useState({sessions:[], companies:[]})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [notice, setNotice] = useState('')
  const [help, setHelp] = useState(false)
  const [density, setDensity] = useState(() => localStorage.getItem('slx-density') || 'comfortable')
  const navigate = next => {window.location.hash = next; setPage(next); setSidebar(false)}
  useEffect(() => {const listener = () => {setPage(route()); setSidebar(false)}; window.addEventListener('hashchange',listener); return () => window.removeEventListener('hashchange',listener)}, [])
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''),4500); return () => clearTimeout(timer)}, [notice])
  useEffect(() => {const listener = e => {if(e.key === 'Escape')setSidebar(false)}; window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener)}, [])
  const load = useCallback(async () => {setLoading(true); setError(''); try {setData(await loadTraining())} catch(e) {setError(e.message)} finally {setLoading(false)}}, [])
  useEffect(() => {load()}, [load])
  const current = page.startsWith('company/') ? 'training' : page === 'overview' ? 'dashboard' : navigation.some(n => n[0] === page) ? page : 'dashboard'
  const company = page.startsWith('company/') ? data.companies.find(c => c.id === page.split('/')[1]) : null
  const exportTraining = () => downloadCSV('training-register.csv',['Session','Start date','End date','Company','Participants','Unit price','Total','Grant status'],data.sessions.flatMap(s => {
    const companies = data.companies.filter(c => c.sessionId === s.id)
    return companies.length ? companies.map(c => [s.name,s.startDate,s.endDate,c.companyName,c.participantCount,c.unitPrice,c.total,labels[c.grantStatus]]) : [[s.name,s.startDate,s.endDate,'',0,'',0,'']]
  }))
  return <div className={`slx-app ${collapsed ? 'nav-collapsed' : ''} ${sidebar ? 'nav-open' : ''} density-${density}`}>
    {sidebar && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setSidebar(false)}/>}
    <aside className="slx-sidebar"><a className="slx-brand" href="#dashboard" onClick={e => {e.preventDefault();navigate('dashboard')}}><span className="brand-mark"><img src={logo} alt=""/></span><span>secure <b>labx</b><small>TRAINING ADMINISTRATION</small></span></a><span className="nav-section">WORKSPACE</span><nav>{navigation.map(([id,icon,label],index) => <React.Fragment key={id}>{index === 6 && <span className="nav-section">MANAGE</span>}<a href={`#${id}`} className={current === id ? 'active' : ''} aria-current={current === id ? 'page' : undefined} onClick={e => {e.preventDefault();navigate(id)}}><Icon name={icon}/><span>{label}</span>{id === 'training' && <em>{data.sessions.length}</em>}</a></React.Fragment>)}</nav><div className="sidebar-bottom"><Button icon="help" variant="text" onClick={() => setHelp(true)}>Help & shortcuts</Button><small>Secure LabX · Administration</small></div></aside>
    <div className="slx-main"><header className="slx-topbar"><button className="nav-toggle" aria-label="Toggle navigation" onClick={() => {if(window.matchMedia('(max-width: 850px)').matches) setSidebar(!sidebar); else setCollapsed(!collapsed)}}><Icon name="menu"/></button><div className="breadcrumb-title">Workspace <span>/</span> <strong>{navigation.find(n => n[0] === current)?.[2]}</strong>{company && <><span>/</span><strong>Participants</strong></>}</div><div className="topbar-right"><span className="workspace-tag">Secure LabX</span><Button icon="download" onClick={() => current === 'training' || current === 'training-records' || current === 'participants' ? exportTraining() : navigate('reports')}>{current === 'training' || current === 'training-records' || current === 'participants' ? 'Export register' : 'Export report'}</Button></div></header>
    <main className="slx-content"><ErrorMessage message={error} retry={load}/>
      {current === 'training' && <>
        {loading && !data.sessions.length ? <div className="slx-loading">Loading training sessions…</div> : company ? <Participants key={company.id} company={company} data={data} back={() => navigate('training')} notify={setNotice}/> : page.startsWith('company/') ? <Panel><div className="slx-empty"><h2>Company record not found</h2><Button onClick={() => navigate('training')}>Back to training sessions</Button></div></Panel> : <Training data={data} edit={(kind,record) => setEditor({kind,record})} openCompany={c => navigate(`company/${c.id}`)} refresh={load}/>}
      </>}
      {current === 'participants' && <Participants data={data} notify={setNotice}/>}
      {current === 'training-records' && <TrainingRecords training={data} refresh={load}/>}
      {current === 'rebate-management' && <RebateManagement data={data} refresh={load} notify={setNotice}/>}
      {current === 'summary' && <Summary data={data}/>} 
      {['dashboard','credit','reports'].includes(current) && <Reporting key={current} view={current} training={data} navigate={navigate}/>}
      {current === 'settings' && <><PageTitle kicker="PREFERENCES" title="Settings">Choose how records are displayed on this device.</PageTitle><Panel title="Display preferences"><div className="settings-body"><Field label="Table spacing"><select value={density} onChange={e => {setDensity(e.target.value); localStorage.setItem('slx-density',e.target.value); setNotice('Display preference saved.')}}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field><p>Applies to training, participant and report tables.</p><Button onClick={() => {setDensity('comfortable');localStorage.removeItem('slx-density');setNotice('Display settings reset.')}}>Reset preferences</Button></div></Panel></>}
      <footer className="slx-footer"><span>© 2026 Secure LabX. All Rights Reserved.</span><span>Website developed by Nasrun Amin.</span></footer>
    </main></div>
    {notice && <div className="slx-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {editor && <Editor key={`${editor.kind}-${editor.record.id || 'new'}`} {...editor} close={() => setEditor(null)} saved={async message => {await load();setNotice(message)}}/>}
    {help && <Modal title="Help & shortcuts" close={() => setHelp(false)}><div className="help-content"><h3>Manage your training records</h3><p>Open Training activity to schedule sessions. Expand a session to see its companies, then select a company name to register participants.</p><p>The square arrow action button opens a record for editing. Removal is available inside the edit form and requires confirmation.</p><p>Use Filter sessions to sort by date, sequence number or company count. Reports supports CSV export and Print / Save PDF.</p><Button variant="primary" onClick={() => {setHelp(false);navigate('training')}}>Open training activity</Button></div></Modal>}
  </div>
}
