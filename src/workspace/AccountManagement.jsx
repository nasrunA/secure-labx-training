import React, {useCallback, useEffect, useState} from 'react'
import {api} from './api'
import {Button, Empty, Field, PageTitle, Panel} from './UI'
import './AccountManagement.css'

const roles = {
  applicant:[{value:'applicant',label:'Applicant'}],
  staff:[{value:'trainer',label:'Trainer'},{value:'sales',label:'Sales Team'}],
}
const emptyForm = scope => ({id:'',email:'',role:roles[scope][0].value,password:''})

export default function AccountManagement({notify,scope='applicant'}) {
  const [accounts,setAccounts] = useState([])
  const [form,setForm] = useState(()=>emptyForm(scope))
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const scopedRoles=roles[scope]
  const roleLabel=scope==='applicant'?'Applicant':'Trainer and Sales Team'
  const managedAccounts=accounts.filter(account=>scopedRoles.some(role=>role.value===account.role))

  useEffect(()=>{setForm(emptyForm(scope));setError('')},[scope])
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {setAccounts(await api('/accounts'));return true}
    catch (caught) {setError(caught.message);return false}
    finally {setLoading(false)}
  }, [])
  useEffect(() => {load()}, [load])

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const {id,...payload}=form
      await api(id?`/accounts/${encodeURIComponent(id)}`:'/accounts',{
        method:id?'PATCH':'POST',
        body:JSON.stringify(payload),
      })
      setForm(emptyForm(scope))
      if(await load())notify(id?'Account updated.':'Account created.')
    } catch (caught) {
      setError(caught.message)
    } finally {setBusy(false)}
  }

  const remove = async account => {
    if(!window.confirm(`Delete the ${account.role} account for ${account.email}?`))return
    setError('')
    try {
      await api(`/accounts/${encodeURIComponent(account.id)}`,{method:'DELETE'})
      if(form.id===account.id)setForm(emptyForm(scope))
      if(await load())notify('Account deleted.')
    } catch (caught) {setError(caught.message)}
  }

  return <>
    <PageTitle kicker="SUPERADMIN · ACCOUNT ACCESS" title={scope==='applicant'?'Manage Applicants':'Manage Trainer & Sales Team'}>Create and manage each person’s sign-in email and password. Passwords are securely stored and cannot be viewed here.</PageTitle>
    <Panel title={form.id?'Update account':`Create ${scope==='applicant'?'applicant':'staff'} account`} subtitle={form.id?'Leave the password empty to keep the current password.':'Use a unique email address and a password of at least 12 characters.'}>
      <form className="account-form" onSubmit={save}>
        <Field label={scope==='applicant'?'Applicant Gmail / email address':'Trainer or Sales Team email address'}><input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="name@example.com"/></Field>
        {scope==='staff'&&<Field label="Account type"><select value={form.role} onChange={event=>setForm({...form,role:event.target.value})}>{scopedRoles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></Field>}
        <Field label={form.id?'New password (optional)':'Password'}><input type="password" required={!form.id} minLength={12} maxLength={256} autoComplete="new-password" value={form.password} onChange={event=>setForm({...form,password:event.target.value})} placeholder="At least 12 characters"/></Field>
        <div className="account-form-actions"><Button type="submit" variant="primary" disabled={busy}>{busy?'Saving…':form.id?'Save account':`Create ${scope==='applicant'?'applicant':form.role==='trainer'?'trainer':'Sales Team'} account`}</Button>{form.id&&<Button onClick={()=>{setForm(emptyForm(scope));setError('')}}>Cancel</Button>}</div>
      </form>
    </Panel>
    {error&&<div className="slx-error" role="alert">{error}</div>}
    <Panel title={`${roleLabel} accounts`} subtitle={`${managedAccounts.length} account${managedAccounts.length===1?'':'s'} in this section`}>
      {loading?<div className="slx-loading">Loading accounts…</div>:managedAccounts.length===0?<Empty title={`No ${scope==='applicant'?'applicant':'trainer or sales team'} accounts yet`}>Create the first account above.</Empty>:<div className="slx-table-wrap"><table className="slx-table account-table"><thead><tr><th>Email</th>{scope==='staff'&&<th>Role</th>}<th>Created</th><th>Actions</th></tr></thead><tbody>{managedAccounts.map(account=><tr key={account.id}><td><strong>{account.email}</strong></td>{scope==='staff'&&<td>{scopedRoles.find(role=>role.value===account.role)?.label||account.role}</td>}<td>{account.createdAt?new Date(account.createdAt).toLocaleDateString():''}</td><td><div className="account-row-actions"><Button onClick={()=>{setForm({...emptyForm(scope),id:account.id,email:account.email,role:account.role});setError('')}}>Edit</Button><Button className="danger-quiet" onClick={()=>remove(account)}>Delete</Button></div></td></tr>)}</tbody></table></div>}
    </Panel>
  </>
}
