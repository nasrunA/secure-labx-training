import React from 'react'
import {createRoot} from 'react-dom/client'
import '@coreui/coreui/dist/css/coreui.min.css'
import Workspace from './workspace/Workspace'
import './workspace/workspace.css'

createRoot(document.getElementById('root')).render(<React.StrictMode><Workspace/></React.StrictMode>)
