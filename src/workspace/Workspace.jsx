import React, {useCallback, useEffect, useRef, useState} from 'react'
import logo from '../../logoSlx.png'
import {api, loadTraining, downloadCSV, labels} from './api'
import {Icon, Button, ErrorMessage, Modal, Panel, PageTitle, Field} from './UI'
import Training from './Training'
import Participants from './Participants'
import TrainingRecords from './TrainingRecords'
import RebateManagement from './RebateManagement'
import Summary from './Summary'
import Reporting from './Reporting'
import Editor from './Editors'
import AccountManagement from './AccountManagement'
import ProductCatalogue from './ProductCatalogue'
import './profile.css'
import './dark-mode.css'

const navigation = [['dashboard','dashboard','Dashboard'],['training','training','Training activity'],['training-records','report','Training records'],['rebate-management','credit','Rebate management'],['catalogue','report','Product Catalogue'],['summary','report','Summary'],['credit','credit','Credit management'],['participants','people','Participants'],['reports','report','Reports'],['settings','settings','Settings']]
const accountNavigation = [['catalogue-management','report','Product Catalogue'],['manage-trainer-sales','people','Trainer & Sales'],['manage-applicants','people','Applicants']]
const route = () => window.location.hash.slice(1) || 'dashboard'
export default function Workspace({user,onLogout,onUserUpdated}) {
  const isSuperadmin = user?.role === 'superadmin'
  const menu = isSuperadmin ? accountNavigation : navigation
  const defaultPage = menu[0][0]
  const [profileUser, setProfileUser] = useState(user)
  const [page, setPage] = useState(() => {
    const requested = route()
    return menu.some(([id]) => id === requested) || (!isSuperadmin && requested.startsWith('company/')) ? requested : defaultPage
  })
  const [sidebar, setSidebar] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [data, setData] = useState({sessions:[], companies:[]})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [notice, setNotice] = useState('')
  const [help, setHelp] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileEmail, setProfileEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const profileMenuRef = useRef(null)
  const [unsaved, setUnsaved] = useState(false)
  const pageRef = useRef(page)
  const unsavedRef = useRef(false)
  const [density, setDensity] = useState(() => localStorage.getItem('slx-density') || 'comfortable')
  const [theme, setTheme] = useState(() => localStorage.getItem('slx-theme') || 'dark')
  const updateUnsaved = useCallback(value => {unsavedRef.current = value; setUnsaved(value)}, [])
  useEffect(() => {setProfileUser(user);setProfileEmail(user?.email || '')}, [user])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('slx-theme', theme)
  }, [theme])
  const navigate = next => {if(unsavedRef.current){setNotice('Save or cancel your changes before leaving this page.');return}pageRef.current=next;window.location.hash=next;setPage(next);setSidebar(false)}
  useEffect(() => {const listener = () => {if(unsavedRef.current){window.history.replaceState(null,'',`#${pageRef.current}`);setNotice('Save or cancel your changes before leaving this page.');return}const requested=route();const next=menu.some(([id])=>id===requested)||(!isSuperadmin&&requested.startsWith('company/'))?requested:defaultPage;if(next!==requested)window.history.replaceState(null,'',`#${next}`);pageRef.current=next;setPage(next);setSidebar(false)}; window.addEventListener('hashchange',listener); return () => window.removeEventListener('hashchange',listener)}, [user?.role])
  useEffect(() => {const requested=route();if(!menu.some(([id])=>id===requested)&&!( !isSuperadmin&&requested.startsWith('company/'))){pageRef.current=defaultPage;window.history.replaceState(null,'',`#${defaultPage}`);setPage(defaultPage)}}, [user?.role])
  useEffect(() => {if(!unsaved)return;const listener=event=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener)}, [unsaved])
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''),4500); return () => clearTimeout(timer)}, [notice])
  useEffect(() => {const listener = e => {if(e.key === 'Escape')setSidebar(false)}; window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener)}, [])
  useEffect(() => {
    if (!profileMenuOpen) return
    const closeOutside = event => {if(!profileMenuRef.current?.contains(event.target))setProfileMenuOpen(false)}
    const closeOnEscape = event => {if(event.key==='Escape')setProfileMenuOpen(false)}
    document.addEventListener('pointerdown',closeOutside)
    window.addEventListener('keydown',closeOnEscape)
    return () => {document.removeEventListener('pointerdown',closeOutside);window.removeEventListener('keydown',closeOnEscape)}
  }, [profileMenuOpen])
  const load = useCallback(async () => {setLoading(true); setError(''); try {setData(await loadTraining())} catch(e) {setError(e.message)} finally {setLoading(false)}}, [])
  useEffect(() => {if(!isSuperadmin)load()}, [load,isSuperadmin])
  const current = page.startsWith('company/') ? 'training' : page === 'overview' && !isSuperadmin ? 'dashboard' : menu.some(n => n[0] === page) ? page : defaultPage
  const roleLabel = user?.role === 'sales' ? 'Sales Team' : user?.role === 'superadmin' ? 'Superadmin' : user?.role === 'trainer' ? 'Trainer' : 'Applicant'
  const displayUser = profileUser || user
  const accountScope = current === 'manage-trainer-sales' ? 'staff' : 'applicant'
  const company = page.startsWith('company/') ? data.companies.find(c => c.id === page.split('/')[1]) : null
  const exportTraining = () => downloadCSV('training-register.csv',['Session','Start date','End date','Company','Participants','Unit price','Total','Grant status'],data.sessions.flatMap(s => {
    const companies = data.companies.filter(c => c.sessionId === s.id)
    return companies.length ? companies.map(c => [s.name,s.startDate,s.endDate,c.companyName,c.participantCount,c.unitPrice,c.total,labels[c.grantStatus]]) : [[s.name,s.startDate,s.endDate,'',0,'',0,'']]
  }))
  const openProfile = () => {
    setProfileEmail(displayUser?.email || '')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setProfileError('')
    setProfileMenuOpen(false)
    setProfileOpen(true)
  }
  const saveProfile = async event => {
    event.preventDefault()
    setProfileError('')
    if (newPassword && newPassword !== confirmPassword) {
      setProfileError('The new passwords do not match.')
      return
    }
    setProfileBusy(true)
    try {
      const result = await api('/auth/profile', {
        method:'PATCH',
        body:JSON.stringify({email:profileEmail,currentPassword,newPassword}),
      })
      setProfileUser(result.user)
      onUserUpdated?.(result.user)
      setProfileOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Profile updated.')
    } catch (caught) {
      setProfileError(caught.message)
    } finally {
      setProfileBusy(false)
    }
  }
  return <div className={`slx-app ${collapsed ? 'nav-collapsed' : ''} ${sidebar ? 'nav-open' : ''} density-${density}`}>
    {sidebar && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setSidebar(false)}/>}
    <aside className="slx-sidebar"><a className="slx-brand" href={`#${defaultPage}`} onClick={e => {e.preventDefault();navigate(defaultPage)}}><span className="brand-mark"><img src={logo} alt=""/></span><span>secure <b>labx</b><small>{isSuperadmin?'SUPERADMIN WORKSPACE':'TRAINING ADMINISTRATION'}</small></span></a><span className="nav-section">{isSuperadmin?'ACCOUNT ACCESS':'WORKSPACE'}</span><nav>{menu.map(([id,icon,label],index) => <React.Fragment key={id}>{!isSuperadmin&&index === 6 && <span className="nav-section">MANAGE</span>}<a href={`#${id}`} className={current === id ? 'active' : ''} aria-current={current === id ? 'page' : undefined} onClick={e => {e.preventDefault();navigate(id)}}><Icon name={icon}/><span>{label}</span>{id === 'training' && <em>{data.sessions.length}</em>}</a></React.Fragment>)}</nav><div className="sidebar-bottom">{!isSuperadmin&&<Button icon="help" variant="text" onClick={() => setHelp(true)}>Help & shortcuts</Button>}<small>Secure LabX · Administration</small></div></aside>
    <div className="slx-main"><header className="slx-topbar"><button className="nav-toggle" aria-label="Toggle navigation" onClick={() => {if(window.matchMedia('(max-width: 850px)').matches) setSidebar(!sidebar); else setCollapsed(!collapsed)}}><Icon name="menu"/></button><div className="breadcrumb-title">Workspace <span>/</span> <strong>{menu.find(n => n[0] === current)?.[2]}</strong>{company && <><span>/</span><strong>Participants</strong></>}</div><div className="topbar-right"><div className="profile-menu" ref={profileMenuRef}><button type="button" className="profile-menu-trigger" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen(open=>!open)}><span className="profile-avatar">{displayUser?.email?.[0]?.toUpperCase() || 'U'}</span><span className="profile-trigger-label">{displayUser?.email} · {roleLabel}</span><span className="profile-chevron" aria-hidden="true"/></button>{profileMenuOpen&&<div className="profile-menu-list" role="menu"><div className="profile-menu-heading">{displayUser?.email}<small>{roleLabel}</small></div><button type="button" role="menuitem" onClick={openProfile}>Manage profile</button><button type="button" role="menuitem" onClick={onLogout}>Sign out</button></div>}</div></div></header>
    <main className="slx-content"><ErrorMessage message={error} retry={load}/>
      {current === 'catalogue' && !isSuperadmin && <ProductCatalogue notify={setNotice}/>}
      {current === 'catalogue-management' && isSuperadmin && <ProductCatalogue manage notify={setNotice}/>}
      {current === 'training' && <>
        {loading && !data.sessions.length ? <div className="slx-loading">Loading training sessions…</div> : company ? <Participants key={company.id} company={company} data={data} back={() => navigate('training')} notify={setNotice}/> : page.startsWith('company/') ? <Panel><div className="slx-empty"><h2>Company record not found</h2><Button onClick={() => navigate('training')}>Back to training sessions</Button></div></Panel> : <Training data={data} edit={(kind,record) => setEditor({kind,record})} openCompany={c => navigate(`company/${c.id}`)} refresh={load}/>}
      </>}
      {current === 'participants' && <Participants data={data} notify={setNotice}/>}
      {current === 'training-records' && <TrainingRecords training={data} refresh={load}/>}
      {current === 'rebate-management' && <RebateManagement data={data} refresh={load} notify={setNotice} onDirtyChange={updateUnsaved}/>}
      {current === 'summary' && <Summary data={data}/>} 
      {['manage-trainer-sales','manage-applicants'].includes(current) && user?.role === 'superadmin' && <AccountManagement key={current} scope={accountScope} notify={setNotice}/>}
      {['dashboard','credit','reports'].includes(current) && <Reporting key={current} view={current} training={data} navigate={navigate}/>}
      {current === 'settings' && <><PageTitle kicker="PREFERENCES" title="Settings">Choose how records are displayed on this device.</PageTitle><Panel title="Display preferences"><div className="settings-body"><Field label="Appearance"><select aria-label="Appearance" value={theme} onChange={e => {setTheme(e.target.value);localStorage.setItem('slx-theme',e.target.value);setNotice(`${e.target.value==='dark'?'Dark':'Light'} appearance saved.`)}}><option value="dark">Dark</option><option value="light">Light</option></select></Field><Field label="Table spacing"><select value={density} onChange={e => {setDensity(e.target.value); localStorage.setItem('slx-density',e.target.value); setNotice('Display preference saved.')}}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field><p>Appearance and table spacing apply to this device.</p><Button onClick={() => {setTheme('dark');setDensity('comfortable');localStorage.setItem('slx-theme','dark');localStorage.removeItem('slx-density');setNotice('Display settings reset.')}}>Reset preferences</Button></div></Panel></>}
      <footer className="slx-footer"><span>© 2026 Secure LabX. All Rights Reserved.</span><span>Website developed by Nasrun Amin.</span></footer>
    </main></div>
    {notice && <div className="slx-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {profileOpen && <Modal title="Manage profile" close={() => !profileBusy&&setProfileOpen(false)} busy={profileBusy}><form className="profile-form" onSubmit={saveProfile}><p>Update your sign-in email or password. Your account role and access are managed by the Superadmin.</p><Field label="Email address"><input type="email" required maxLength={254} autoComplete="email" value={profileEmail} onChange={event=>setProfileEmail(event.target.value)}/></Field><Field label="Current password"><input type="password" required autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} placeholder="Confirm your identity"/></Field><Field label="New password (optional)"><input type="password" minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="At least 12 characters"/></Field>{newPassword&&<Field label="Confirm new password"><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></Field>}{profileError&&<p className="slx-error" role="alert">{profileError}</p>}<div className="profile-form-actions"><Button type="submit" variant="primary" disabled={profileBusy}>{profileBusy?'Saving…':'Save profile'}</Button><Button disabled={profileBusy} onClick={()=>setProfileOpen(false)}>Cancel</Button></div></form></Modal>}
    {editor && <Editor key={`${editor.kind}-${editor.record.id || 'new'}`} {...editor} close={() => setEditor(null)} saved={async message => {await load();setNotice(message)}} onDirtyChange={updateUnsaved}/>}
    {help && <Modal title="Help & shortcuts" close={() => setHelp(false)}><div className="help-content"><h3>Manage your training records</h3><p>Open Training activity to schedule sessions. Expand a session to see its companies, then select a company name to register participants.</p><p>The square arrow action button opens a record for editing. Removal is available inside the edit form and requires confirmation.</p><p>Use Filter sessions to sort by date, sequence number or company count. Reports supports CSV export and Print / Save PDF.</p><Button variant="primary" onClick={() => {setHelp(false);navigate('training')}}>Open training activity</Button></div></Modal>}
  </div>
}
