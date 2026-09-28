const filterOptions = [
  ['oldest', 'Oldest to latest'],
  ['latest', 'Latest to oldest'],
  ['sequence', 'Session number: low to high'],
  ['sequenceReverse', 'Session number: high to low'],
  ['companies', 'Most companies'],
  ['companiesReverse', 'Fewest companies'],
]

const getDate = card => {
  const text = card.querySelector('.session-toggle small')?.textContent || ''
  const value = text.split(/[–·]/)[0].trim()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}
const getSequence = card => Number(card.querySelector('.session-number')?.textContent || 0)
const getCompanies = card => Number((card.querySelector('.company-count')?.textContent || '0').match(/\d+/)?.[0] || 0)

const sortSessions = mode => {
  const list = document.querySelector('.session-list')
  if (!list) return
  const cards = [...list.querySelectorAll(':scope > .session-card')]
  cards.sort((a, b) => {
    if (mode === 'latest') return getDate(b) - getDate(a)
    if (mode === 'sequence') return getSequence(a) - getSequence(b)
    if (mode === 'sequenceReverse') return getSequence(b) - getSequence(a)
    if (mode === 'companies') return getCompanies(b) - getCompanies(a)
    if (mode === 'companiesReverse') return getCompanies(a) - getCompanies(b)
    return getDate(a) - getDate(b)
  }).forEach(card => list.appendChild(card))
}

const addFilter = () => {
  const toolbar = document.querySelector('.training-page .session-toolbar')
  if (!toolbar || toolbar.querySelector('.session-filter-wrap')) return
  const wrap = document.createElement('div')
  wrap.className = 'session-filter-wrap'
  wrap.innerHTML = `<button type="button" class="session-filter-button">Filter sessions <span>⌄</span></button><div class="session-filter-menu">${filterOptions.map(([value, label]) => `<button type="button" data-sort="${value}">${label}</button>`).join('')}</div>`
  toolbar.insertBefore(wrap, toolbar.querySelector('span'))
  const trigger = wrap.querySelector('.session-filter-button')
  trigger.onclick = () => wrap.classList.toggle('open')
  wrap.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => {
    sortSessions(button.dataset.sort)
    trigger.innerHTML = `${button.textContent} <span>⌄</span>`
    wrap.classList.remove('open')
  })
  document.addEventListener('click', event => { if (!wrap.contains(event.target)) wrap.classList.remove('open') })
}

new MutationObserver(addFilter).observe(document.body, {childList: true, subtree: true})
addFilter()
