import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import axios from 'axios'

// Attach admin token to all API requests and handle token refresh
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken')
  if (token) {
    config.headers = config.headers || {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

axios.interceptors.response.use((response) => {
  const newToken = response.headers?.['x-new-token']
  if (newToken) {
    localStorage.setItem('adminToken', newToken)
  }
  return response
}, (error) => {
  // Optionally handle 401s globally. For now, just pass through
  return Promise.reject(error)
})



ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)