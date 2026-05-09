import React, { useState, useEffect } from 'react'
import { Trash2, RefreshCw, HardDrive, Clock, FileText, AlertTriangle, LogOut, Save, Shield } from 'lucide-react'
import axios from 'axios'
import AdminLogin from './AdminLogin'

interface Stats {
  totalFiles: number
  totalSize: number
  expiredFiles: number
  config: {
    maxFileSize: number
    defaultRetentionHours: number
    maxRetentionHours: number
    allowedExtensions?: string[]
  }
}

interface Config {
  retention: {
    defaultRetentionHours: number
    maxRetentionHours: number
    cleanupIntervalMinutes: number
    maxFileSize: number
    allowedExtensions?: string[]
  }
  rateLimiting: {
    windowMs: number
    maxRequests: number
  }
  maxFileSize: number
}

interface SecuritySummary {
  attacksLast24h: number
  totalAttacks: number
  uniqueIPs: number
  topCategory: { name: string; count: number } | null
  bans: { permanent: number; temporary: number; total: number }
}

const Admin: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [security, setSecurity] = useState<SecuritySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [configForm, setConfigForm] = useState({
    defaultRetentionHours: 24,
    maxRetentionHours: 168,
    maxFileSize: 4294967296,
  })
  const [configSaving, setConfigSaving] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await axios.get('/api/admin/auth/me')
        setIsAuthenticated(true)
      } catch {
        setIsAuthenticated(false)
      } finally {
        setAuthChecked(true)
      }
    }
    checkAuth()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsResponse, configResponse, securityResponse] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/admin/config'),
        axios.get('/api/admin/security-summary').catch(() => null),
      ])
      setStats(statsResponse.data)
      setConfig(configResponse.data)
      if (securityResponse?.data) setSecurity(securityResponse.data)
      setConfigForm({
        defaultRetentionHours: configResponse.data.retention.defaultRetentionHours,
        maxRetentionHours: configResponse.data.retention.maxRetentionHours,
        maxFileSize: configResponse.data.retention.maxFileSize,
      })
    } catch (err) {
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to load data' : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) fetchData()
  }, [isAuthenticated])

  const handleCleanup = async () => {
    setCleanupLoading(true)
    setCleanupResult(null)
    try {
      const response = await axios.post('/api/admin/cleanup')
      setCleanupResult(response.data.message)
      await fetchData()
    } catch (err) {
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || 'Cleanup failed' : 'Cleanup failed'
      setError(errorMessage)
    } finally {
      setCleanupLoading(false)
    }
  }

  const handleConfigSave = async () => {
    setConfigSaving(true)
    setConfigSaved(false)
    try {
      await axios.put('/api/admin/config', configForm)
      setConfigSaved(true)
      await fetchData()
      setTimeout(() => setConfigSaved(false), 3000)
    } catch (err) {
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to save configuration' : 'Failed to save configuration'
      setError(errorMessage)
    } finally {
      setConfigSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await axios.post('/api/admin/auth/logout')
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('adminToken')
      setIsAuthenticated(false)
      setStats(null)
      setConfig(null)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatSizeInput = (bytes: number): number => Math.round(bytes / (1024 * 1024))

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 folio">
        <RefreshCw className="h-4 w-4 animate-spin" /> Checking credentials
      </div>
    )
  }
  if (authChecked && !isAuthenticated) {
    return (
      <AdminLogin
        onSuccess={async () => {
          setIsAuthenticated(true)
          setError(null)
          await fetchData()
        }}
      />
    )
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 folio">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* Masthead */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="folio">§ 02 · Admin</div>
          <h1 className="display">The keeper's bench.</h1>
          <p className="text-ink-soft" style={{ fontSize: 13, lineHeight: 1.65 }}>
            Files in flight, storage on disk, retention rules — all set from here.
          </p>
        </div>
        <button onClick={handleLogout} className="btn btn-ghost">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>

      {error && (
        <div className="strip strip-error">
          <AlertTriangle className="h-4 w-4 text-led-red flex-shrink-0 mt-0.5" />
          <span className="text-ink" style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Telemetry plates */}
      {stats && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatPlate icon={<FileText className="h-4 w-4" />} label="Files in flight" value={String(stats.totalFiles)} />
          <StatPlate icon={<HardDrive className="h-4 w-4" />} label="Storage used"   value={formatFileSize(stats.totalSize)} />
          <StatPlate
            icon={<Clock className="h-4 w-4" />}
            label="Expired"
            value={String(stats.expiredFiles)}
            tone={stats.expiredFiles > 0 ? 'amber' : 'default'}
            sub={stats.expiredFiles > 0 ? 'ready to sweep' : undefined}
          />
        </section>
      )}

      {/* Defenses (security telemetry — counts only, no IPs or paths) */}
      {security && (
        <section className="plate">
          <div className="folio mb-4 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" /> § 02.0 · Defenses (last 24h)
          </div>
          <dl className="telem">
            <dt>Attacks blocked (24h)</dt>
            <dd>{security.attacksLast24h.toLocaleString()}</dd>
            <dt>Total ever</dt>
            <dd>{security.totalAttacks.toLocaleString()}</dd>
            <dt>Unique IPs</dt>
            <dd>{security.uniqueIPs.toLocaleString()}</dd>
            <dt>Top category</dt>
            <dd>
              {security.topCategory
                ? <>{security.topCategory.name} <span className="text-ink-faint">· {security.topCategory.count.toLocaleString()}</span></>
                : <span className="text-ink-faint">none</span>}
            </dd>
            <dt>Bans</dt>
            <dd>
              {security.bans.permanent.toLocaleString()} permanent
              <span className="text-ink-faint"> · </span>
              {security.bans.temporary.toLocaleString()} temporary
            </dd>
          </dl>
        </section>
      )}

      {/* Cleanup */}
      <section className="plate">
        <div className="folio mb-3 flex items-center gap-2">
          <Trash2 className="h-3.5 w-3.5" /> Sweep
        </div>
        <p className="text-ink-soft mb-4" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Cleanup runs automatically. This button forces it now — useful after a retention change.
        </p>
        <button onClick={handleCleanup} disabled={cleanupLoading} className="btn btn-primary">
          {cleanupLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {cleanupLoading ? 'Sweeping…' : 'Run sweep now'}
        </button>
        {cleanupResult && (
          <div className="strip strip-success mt-4">
            <span className="text-ink" style={{ fontSize: 13 }}>{cleanupResult}</span>
          </div>
        )}
      </section>

      {/* Config */}
      {config && (
        <section className="plate">
          <div className="folio mb-4">§ 02.a · Retention dials</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            <div className="space-y-4">
              <div>
                <label className="folio block mb-1.5">Default retention (hours)</label>
                <input
                  type="number" min={1} max={configForm.maxRetentionHours}
                  value={configForm.defaultRetentionHours}
                  onChange={e => setConfigForm(p => ({ ...p, defaultRetentionHours: parseInt(e.target.value) || 1 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="folio block mb-1.5">Maximum retention (hours)</label>
                <input
                  type="number" min={1}
                  value={configForm.maxRetentionHours}
                  onChange={e => setConfigForm(p => ({ ...p, maxRetentionHours: parseInt(e.target.value) || 1 }))}
                  className="input"
                />
              </div>
              <div>
                <label className="folio block mb-1.5">Maximum file size (MB)</label>
                <input
                  type="number" min={1}
                  value={formatSizeInput(configForm.maxFileSize)}
                  onChange={e => setConfigForm(p => ({ ...p, maxFileSize: (parseInt(e.target.value) || 1) * 1024 * 1024 }))}
                  className="input"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="folio">Live settings</div>
              <dl className="telem">
                <dt>Cleanup cadence</dt>   <dd>{config.retention.cleanupIntervalMinutes} min</dd>
                <dt>Rate window</dt>       <dd>{config.rateLimiting.windowMs / 60000} min</dd>
                <dt>Rate ceiling</dt>      <dd>{config.rateLimiting.maxRequests} req</dd>
                {config.retention.allowedExtensions && (
                  <>
                    <dt>Allowed types</dt>
                    <dd>
                      {config.retention.allowedExtensions.length > 0 ? (
                        <span className="chip">{config.retention.allowedExtensions.join(' · ')}</span>
                      ) : (
                        <span className="chip">all</span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
          <div className="mt-6 pt-5 border-t border-rule flex items-center gap-3">
            <button onClick={handleConfigSave} disabled={configSaving} className="btn btn-primary">
              {configSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {configSaving ? 'Saving…' : 'Save configuration'}
            </button>
            {configSaved && (
              <span className="folio flex items-center gap-2" style={{ color: 'var(--green)' }}>
                <span className="led led-on" /> Saved
              </span>
            )}
          </div>
        </section>
      )}

      {/* System */}
      <section className="plate">
        <div className="folio mb-4">§ 02.b · House rules</div>
        <ul className="text-ink-soft space-y-1" style={{ fontSize: 13, listStyle: 'none', paddingLeft: 0 }}>
          <li>· Files are auto-purged on the retention schedule.</li>
          <li>· Uploads are rate-limited to discourage abuse.</li>
          <li>· The server never holds decryption keys.</li>
          <li>· Configuration changes apply immediately.</li>
        </ul>
      </section>
    </div>
  )
}

interface StatPlateProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'amber'
}

const StatPlate: React.FC<StatPlateProps> = ({ icon, label, value, sub, tone }) => (
  <div className="plate">
    <div className="flex items-start justify-between">
      <div>
        <div className="folio mb-2">{label}</div>
        <div className="font-display italic" style={{ fontSize: 32, color: tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>
          {value}
        </div>
        {sub && <div className="folio mt-2" style={{ color: tone === 'amber' ? 'var(--amber)' : 'var(--ink-faint)' }}>{sub}</div>}
      </div>
      <div className="text-ink-faint">{icon}</div>
    </div>
  </div>
)

export default Admin
