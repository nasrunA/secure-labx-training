import {afterEach, beforeEach, vi} from 'vitest'
import {cleanup} from '@testing-library/react'
afterEach(() => {cleanup();vi.restoreAllMocks();localStorage.clear();window.history.replaceState(null,'','#dashboard')})
beforeEach(() => {
window.matchMedia = vi.fn().mockImplementation(query => ({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}))
URL.createObjectURL = vi.fn(() => 'blob:test')
URL.revokeObjectURL = vi.fn()
})
window.scrollTo = () => {}
