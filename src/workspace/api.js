export const RATE = 1799
export const labels = {follow_up: 'Follow-up', applied: 'Applied', approved: 'Approved', rejected: 'Rejected', registered: 'Registered', pending_application: 'Pending application'}
export const money = value => `RM ${Number(value || 0).toLocaleString('en-MY', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
export const dateLabel = value => {
  if (!value) return 'Not set'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-MY', {day: 'numeric', month: 'short', year: 'numeric'})
}
export const formatIC = value => value.replace(/\D/g, '').slice(0, 12).replace(/^(\d{6})(\d{1,2})?(\d{1,4})?$/, (_, a, b, c) => a + (b ? `-${b}` : '') + (c ? `-${c}` : ''))
export async function api(path, options = {}) {
  let response
  try {
    const base = import.meta.env.VITE_API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api')
    response = await fetch(`${base}${path}`, { ...options, headers: {'Content-Type': 'application/json', ...options.headers}, signal: options.signal || AbortSignal.timeout(15000) })
  } catch { throw new Error('Cannot connect to the server. Check that the backend and database are running, then retry.') }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || 'The request could not be completed. Please try again.')
  return body
}
export async function loadTraining() {
  const sessions = (await api('/training-sessions')).map((session, index) => ({...session, position: index + 1}))
  const groups = await Promise.all(sessions.map(async session => (await api(`/training-sessions/${session.id}/companies`)).map(company => ({...company, sessionId: session.id, sessionName: session.name}))))
  return {sessions, companies: groups.flat()}
}
export function sortSessions(sessions, query, mode, companies, location = '') {
  const counts = id => companies.filter(c => c.sessionId === id).length
  return sessions.filter(s => `${s.name} ${s.location || ''}`.toLowerCase().includes(query.toLowerCase()) && (!location || s.location === location)).slice().sort((a, b) => {
    const tie = a.position - b.position
    const dates = (a.startDate || '9999').localeCompare(b.startDate || '9999')
    switch (mode) {
      case 'latest': return -dates || tie
      case 'number-desc': return -tie
      case 'number-asc': return tie
      case 'companies-desc': return counts(b.id) - counts(a.id) || tie
      case 'companies-asc': return counts(a.id) - counts(b.id) || tie
      case 'name': return a.name.localeCompare(b.name) || tie
      default: return dates || tie
    }
  })
}
export function downloadCSV(filename, columns, rows) {
  const escape = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"'
  const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
