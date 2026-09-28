const api = 'http://localhost:3001/api'

const formatIcNumber = value => {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  if (digits.length <= 6) return digits
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
}

const request = async (path, options = {}) => {
  const response = await fetch(`${api}${path}`, {headers: {'Content-Type': 'application/json'}, ...options})
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message || 'Unable to complete this request.')
  return data
}

const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]))

const openParticipants = async companyName => {
  const overlay = document.createElement('div')
  overlay.className = 'participant-overlay'
  overlay.innerHTML = '<section class="participant-panel"><button class="participant-close" aria-label="Close">×</button><p class="eyebrow">participant registration</p><h2>Loading company…</h2></section>'
  document.body.appendChild(overlay)
  const close = () => overlay.remove()
  overlay.querySelector('.participant-close').onclick = close
  try {
    const sessions = await request('/training-sessions')
    const groups = await Promise.all(sessions.map(async session => ({session, companies: await request(`/training-sessions/${session.id}/companies`)})))
    const match = groups.flatMap(group => group.companies.map(company => ({...company, session: group.session}))).find(company => company.companyName === companyName)
    if (!match) throw new Error('Company record was not found.')

    const openEditor = (participant, refresh) => {
      const modal = document.createElement('div')
      modal.className = 'participant-edit-overlay'
      modal.innerHTML = `<section class="participant-edit-modal"><button class="participant-close">×</button><h2>Edit participant</h2><form><label>Participant name<input name="fullName" required value="${escapeHtml(participant.fullName)}"></label><label>IC number<input name="icNumber" required value="${escapeHtml(participant.icNumber)}"></label><label>Application status<select name="applicationStatus"><option value="registered" ${participant.applicationStatus === 'registered' ? 'selected' : ''}>Registered</option><option value="pending_application" ${participant.applicationStatus === 'pending_application' ? 'selected' : ''}>Pending application</option></select></label><p class="participant-form-error"></p><footer><button type="button" class="modal-delete participant-delete-in-modal">Remove participant</button><button type="button" class="participant-cancel">Cancel</button><button class="participant-save">Save changes</button></footer></form></section>`
      document.body.appendChild(modal)
      const closeEditor = () => modal.remove()
      modal.querySelector('.participant-close').onclick = closeEditor
      modal.querySelector('.participant-cancel').onclick = closeEditor
      modal.querySelector('.participant-delete-in-modal').onclick = async () => { if (!window.confirm('Remove this participant?')) return; await request(`/company-participants/${participant.id}`, {method: 'DELETE'}); closeEditor(); await refresh() }
      const icInput = modal.querySelector('[name="icNumber"]')
      icInput.addEventListener('input', () => { icInput.value = formatIcNumber(icInput.value) })
      modal.querySelector('form').onsubmit = async event => {
        event.preventDefault()
        try { await request(`/company-participants/${participant.id}`, {method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); closeEditor(); await refresh() }
        catch (caught) { modal.querySelector('.participant-form-error').textContent = caught.message }
      }
    }

    const render = async () => {
      const participants = await request(`/training-companies/${match.id}/participants`)
      const rows = participants.length ? participants.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.fullName)}</td><td>${escapeHtml(item.icNumber)}</td><td><span class="participant-status ${item.applicationStatus}">${item.applicationStatus.replace('_', ' ')}</span></td><td class="participant-actions"><button class="edit-record participant-edit-action" data-edit="${item.id}">Edit</button></td></tr>`).join('') : '<tr><td colspan="5">No participants added yet.</td></tr>'
      overlay.querySelector('.participant-panel').innerHTML = `<button class="participant-close" aria-label="Close">×</button><button class="participant-back">← Back to training sessions</button><p class="eyebrow">participant registration</p><h2>${escapeHtml(match.companyName)}</h2><p class="participant-subtitle">${escapeHtml(match.session.name)}</p><form class="participant-form"><label>Participant name<input name="fullName" required placeholder="Full name"></label><label>IC number<input name="icNumber" required placeholder="e.g. 900101-14-1234"></label><label>Application status<select name="applicationStatus"><option value="registered">Registered</option><option value="pending_application" selected>Pending application</option></select></label><button class="participant-save">+ Add participant</button></form><p class="participant-form-error"></p><h3>Participants (${participants.length})</h3><table class="participant-list"><thead><tr><th>#</th><th>Participant name</th><th>IC number</th><th>Application status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
      overlay.querySelector('.participant-close').onclick = close
      overlay.querySelector('.participant-back').onclick = close
      const icInput = overlay.querySelector('[name="icNumber"]')
      icInput.addEventListener('input', () => { icInput.value = formatIcNumber(icInput.value) })
      overlay.querySelector('.participant-form').onsubmit = async event => {
        event.preventDefault()
        const submitted = Object.fromEntries(new FormData(event.currentTarget))
        if (participants.some(item => item.icNumber === submitted.icNumber)) { overlay.querySelector('.participant-form-error').textContent = 'This IC number has already been added for this company.'; return }
        try { await request(`/training-companies/${match.id}/participants`, {method: 'POST', body: JSON.stringify(submitted)}); await render() }
        catch (caught) { overlay.querySelector('.participant-form-error').textContent = caught.message }
      }
      overlay.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => openEditor(participants.find(item => item.id === button.dataset.edit), render))
    }
    await render()
  } catch (caught) { overlay.querySelector('.participant-panel').innerHTML = `<button class="participant-close">×</button><h2>Unable to open participants</h2><p class="participant-form-error">${escapeHtml(caught.message)}</p>`; overlay.querySelector('.participant-close').onclick = close }
}

const linkCompanyNames = () => document.querySelectorAll('.company-table .client-cell').forEach(cell => {
  if (cell.dataset.participantLink) return
  const name = cell.textContent.trim()
  cell.dataset.participantLink = 'true'; cell.innerHTML = ''
  const link = document.createElement('a')
  link.href = '#participants'; link.className = 'company-link'; link.textContent = name
  link.onclick = event => { event.preventDefault(); openParticipants(name) }
  cell.appendChild(link)
})

new MutationObserver(linkCompanyNames).observe(document.body, {childList: true, subtree: true})
linkCompanyNames()
