import React, { useState } from 'react'
import axios from 'axios'

interface Props {
  onSuccess: () => void
}

const AdminLogin: React.FC<Props> = ({ onSuccess }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [requiresMFA, setRequiresMFA] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await axios.post('/api/admin/auth/login', { username, password })

      if (res.data?.requiresMFA && res.data?.challengeToken) {
        setRequiresMFA(true)
        setChallengeToken(res.data.challengeToken)
      } else if (res.data?.token) {
        localStorage.setItem('adminToken', res.data.token)
        onSuccess()
      } else {
        setError('Unexpected response from server')
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.response?.data?.error || 'Login failed'
        : 'Login failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!challengeToken) return
    setLoading(true)
    setError(null)

    try {
      const res = await axios.post('/api/admin/auth/verify-mfa', {
        challengeToken,
        mfaToken: mfaCode.trim()
      })

      if (res.data?.token) {
        localStorage.setItem('adminToken', res.data.token)
        onSuccess()
      } else {
        setError('Unexpected response from server')
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.response?.data?.error || 'MFA verification failed'
        : 'MFA verification failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto w-full">
      <div className="card p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Admin Login</h1>
        <p className="text-gray-600 text-sm mb-6 text-center">Authenticate to access the admin panel</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
        )}

        {!requiresMFA ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input w-full"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MFA Code</label>
              <input
                type="text"
                inputMode="numeric"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="input w-full"
                placeholder="123456"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code from your authenticator app.</p>
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default AdminLogin

