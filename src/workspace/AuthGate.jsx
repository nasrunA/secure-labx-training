import React, {useEffect, useState} from 'react'
import logo from '../../logoSlx.png'
import {api} from './api'
import './auth.css'

const roles = [
  {id:'applicant', label:'Applicant'},
  {id:'trainer', label:'Trainer'},
  {id:'sales', label:'Sales Team'},
]

export default function AuthGate({children}) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [role, setRole] = useState('applicant')
  const [adminLogin, setAdminLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api('/auth/me').then(result => {if(active)setUser(result.user)}).catch(() => {}).finally(() => {if(active)setChecking(false)})
    return () => {active = false}
  }, [])

  const signIn = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/auth/login', {
        method:'POST',
        body:JSON.stringify({email,password,role:adminLogin?'superadmin':role}),
      })
      setUser(result.user)
      setPassword('')
    } catch (caught) {
      setError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try {
      await api('/auth/logout', {method:'POST'})
      setUser(null)
      setRole('applicant')
      setAdminLogin(false)
      setEmail('')
      setPassword('')
    } catch (caught) {
      setError(caught.message)
    }
  }

  if (checking) return <div className="auth-loading" role="status">Checking your sign-in…</div>
  if (user) return React.cloneElement(children, {user, onLogout:signOut, onUserUpdated:setUser})

  return <main className="auth-screen">
    <section className="auth-branding">
      <div className="auth-branding-pattern"/>
      <div className="auth-brand-content">
        <img src={logo} alt="Secure LabX" className="auth-brand-logo"/>
        <p className="auth-eyebrow">SECURE LABX</p>
        <h1>Training &amp; Rebate<br/>Credit Dashboard</h1>
        <p className="auth-description">A clear view of your training activity, participant records and credit position.</p>
      </div>
      <small>© 2026 Secure LabX. All rights reserved.</small>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-mobile-brand"><img src={logo} alt=""/><span>SECURE LABX</span></div>
        <p className="auth-eyebrow">{adminLogin?'ADMINISTRATOR ACCESS':'WELCOME BACK'}</p>
        <h2>{adminLogin?'Superadmin sign in':'Sign in to your account'}</h2>
        <p className="auth-subtitle">Enter your email and password to continue.</p>
        {!adminLogin && <div className="auth-role-tabs" role="tablist" aria-label="Account type">
          {roles.map(item => <button key={item.id} type="button" role="tab" aria-selected={role===item.id} className={role===item.id?'active':''} onClick={() => {setRole(item.id);setEmail('');setPassword('');setError('')}}>{item.label}</button>)}
        </div>}
        <form className="auth-form" autoComplete="off" onSubmit={signIn}>
          <label>Email address<input type="email" autoComplete="off" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@company.com"/></label>
          <label>Password<input type="password" autoComplete="new-password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder="Enter your password"/></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in to Dashboard'}</button>
        </form>
        {role==='trainer'&&!adminLogin&&<button type="button" className="auth-admin-link" onClick={()=>{setAdminLogin(true);setEmail('');setPassword('');setError('')}}>Administrator sign in</button>}
        {adminLogin&&<button type="button" className="auth-admin-link" onClick={()=>{setAdminLogin(false);setEmail('');setPassword('');setError('')}}>← Return to Trainer sign in</button>}
        <p className="auth-card-foot">Access is managed by your Secure LabX administrator.</p>
      </div>
    </section>
  </main>
}
