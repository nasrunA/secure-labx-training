document.addEventListener('click', (event) => {
  const isMobile = window.matchMedia('(max-width: 760px)').matches
  if (event.target.closest('.menu')) {
    document.body.classList.toggle(isMobile ? 'sidebar-open' : 'sidebar-collapsed')
    return
  }
  if (isMobile && document.body.classList.contains('sidebar-open') && !event.target.closest('.sidebar')) {
    document.body.classList.remove('sidebar-open')
  }
})

window.addEventListener('resize', () => {
  document.body.classList.remove('sidebar-open', 'sidebar-collapsed')
})
