import React from 'react'
import {createRoot} from 'react-dom/client'
import '@coreui/coreui/dist/css/coreui.min.css'
import AuthGate from './workspace/AuthGate'
import Workspace from './workspace/Workspace'
import './workspace/workspace.css'
import './workspace/DashboardLive.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><AuthGate><Workspace/></AuthGate></React.StrictMode>)
