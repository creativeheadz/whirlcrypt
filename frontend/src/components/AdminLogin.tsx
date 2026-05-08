import React, { useState } from 'react'
import axios from 'axios'
import { ShieldCheck } from 'lucide-react'

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
        setError('Unexpected response from server.')
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
        mfaToken: mfaCode.trim(),
      })
      if (res.data?.token) {
        localStorage.setItem('adminToken', res.data.token)
        onSuccess()
      } else {
        setError('Unexpected response from server.')
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
    <div className="max-w-md mx-auto w-full space-y-8">
      <header className="space-y-2 text-center">
        <div className="folio justify-center flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" /> Restricted entrance
        </div>
        <h1 className="display">The keeper's door.</h1>
      </header>

      <section className="plate">
        {error && (
          <div className="strip strip-error mb-4">
            <span className="text-ink" style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {!requiresMFA ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="folio block mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="folio block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div>
              <label className="folio block mb-1.5">MFA code</label>
              <input
                type="text"
                inputMode="numeric"
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value)}
                className="input"
                placeholder="123456"
                required
              />
              <p className="folio mt-1.5">Enter the 6-digit code from your authenticator.</p>
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default AdminLogin
