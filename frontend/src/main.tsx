import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import axios, { AxiosHeaders } from 'axios'
import { ToastProvider } from './contexts/ToastContext'
import { getAdminToken, setAdminToken, clearAdminToken, migrateAdminTokenToSession } from './utils/adminToken'

// One-time upgrade from the pre-sessionStorage era; no-op afterwards.
migrateAdminTokenToSession()

// Attach admin token to all API requests and handle token refresh
axios.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) {
    config.headers = new AxiosHeaders(config.headers).set('Authorization', `Bearer ${token}`)
  }
  return config
})

axios.interceptors.response.use((response) => {
  const newToken = response.headers?.['x-new-token']
  if (newToken) {
    setAdminToken(newToken)
  }
  return response
}, (error) => {
  // A 401 from the admin API means the stored token is dead (expired,
  // revoked, or rotated server-side). Drop it so the app stops replaying
  // a useless credential and the admin gets a clean login prompt.
  if (error?.response?.status === 401 && error?.config?.url?.startsWith('/api/admin')) {
    clearAdminToken()
  }
  return Promise.reject(error)
})



ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)