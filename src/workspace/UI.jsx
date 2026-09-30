import React from 'react'
import {CModal, CModalHeader, CModalTitle, CModalBody} from '@coreui/react'
import {labels} from './api'

const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  training: 'M4 5h16v16H4z M7 3v4 M17 3v4 M4 10h16 M8 14h3 M8 17h7',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M18 8a3 3 0 0 1 0 6 M22 21v-2a4 4 0 0 0-3-4',
  credit: 'M3 5h18v14H3z M3 10h18 M7 15h3',
  report: 'M5 3h10l4 4v14H5z M14 3v5h5 M9 12h6 M9 16h6',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  arrow: 'M14 3h7v7 M10 14 21 3 M21 14v7H3V3h7',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  plus: 'M12 5v14 M5 12h14',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  chevron: 'M9 5l7 7-7 7',
  refresh: 'M20 7a9 9 0 1 0 1 8 M20 2v6h-6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',
}
export function Icon({name, ...props}) {return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.report}/></svg>}
export function Button({children, icon, variant = '', className = '', ...props}) {return <button type="button" className={`slx-button ${variant} ${className}`} {...props}>{icon && <Icon name={icon}/>} {children}</button>}
export function Action({onClick, label}) {return <button type="button" className="row-action" aria-label={label} title={label} onClick={onClick}><Icon name="arrow"/></button>}
export function Badge({value}) {return <span className={`slx-badge ${value}`}>{labels[value] || value}</span>}
export function ErrorMessage({message, retry}) {return message ? <div className="slx-error" role="alert">{message}{retry && <Button onClick={retry}>Try again</Button>}</div> : null}
export function Empty({title = 'No records found', children}) {return <div className="slx-empty"><Icon name="report"/><strong>{title}</strong>{children && <p>{children}</p>}</div>}
export function PageTitle({kicker, title, children, actions}) {return <div className="slx-page-title"><div><div className="slx-kicker">{kicker}</div><h1>{title}</h1>{children && <p>{children}</p>}</div><div className="page-actions">{actions}</div></div>}
export function Panel({title, subtitle, action, children, className = ''}) {return <section className={`slx-panel ${className}`}>{title && <header className="slx-panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}{children}</section>}
export function Modal({title, close, busy, children, size}) {return <CModal visible alignment="center" onClose={() => !busy && close()} backdrop={busy ? 'static' : true} keyboard={!busy} size={size} className="slx-modal"><CModalHeader closeButton={!busy}><CModalTitle>{title}</CModalTitle></CModalHeader><CModalBody>{children}</CModalBody></CModal>}
export function Field({label, children}) {return <label className="slx-field"><span>{label}</span>{children}</label>}
export function DateInput({value = '', placeholder = 'Select date', className = '', ...props}) {return <span className={`slx-date-input ${value ? 'has-value' : 'is-empty'} ${className}`} data-placeholder={placeholder}><input {...props} type="date" value={value}/></span>}
