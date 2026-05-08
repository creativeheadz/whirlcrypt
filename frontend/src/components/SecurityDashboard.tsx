import React, { useState, useEffect } from 'react'
import { Shield, Eye, Globe, Trophy, Zap, AlertTriangle, Activity, RefreshCw, Clock } from 'lucide-react'

interface SecurityStats {
  totalAttacks: number
  attacksToday: number
  uniqueIPs: number
  topCountries: Array<{ country: string; count: number }>
  topCategories: Array<{ category: string; count: number }>
  lastUpdated: string
}

interface WallOfShameEntry {
  maskedIP: string
  country?: string
  countryFlag?: string
  reason: string
  category: string
  offendingRequest: string
  bannedAt: string
  expiresAt?: string
  timeLeft?: string
  sarcasticComment: string
}

interface WallOfShameData {
  permanentBans: WallOfShameEntry[]
  temporaryBans: WallOfShameEntry[]
  statistics: {
    totalPermanentBans: number
    totalTemporaryBans: number
    totalBans: number
  }
}

interface Achievement {
  title: string
  description: string
  winner: string
  count?: number
  uniquePaths?: number
  attacksPerSecond?: string
  icon: string
}

const SecurityDashboard: React.FC = () => {
  const [stats, setStats] = useState<SecurityStats | null>(null)
  const [wallOfShame, setWallOfShame] = useState<WallOfShameData | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSecurityData = async () => {
    try {
      const [statsRes, wallRes, achievementsRes] = await Promise.all([
        fetch('/api/security/stats'),
        fetch('/api/security/wall-of-shame'),
        fetch('/api/security/achievements'),
      ])
      if (statsRes.ok) setStats((await statsRes.json()).data)
      if (wallRes.ok) setWallOfShame((await wallRes.json()).data)
      if (achievementsRes.ok) setAchievements((await achievementsRes.json()).data.achievements)
      setLoading(false)
    } catch {
      setError('Failed to load security data.')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSecurityData()
    const interval = setInterval(fetchSecurityData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 folio">
        <RefreshCw className="h-4 w-4 animate-spin" /> Reading the wall
      </div>
    )
  }

  if (error) {
    return (
      <div className="strip strip-error">
        <AlertTriangle className="h-4 w-4 text-led-red flex-shrink-0 mt-0.5" />
        <span className="text-ink" style={{ fontSize: 13 }}>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* Masthead */}
      <header className="space-y-3">
        <div className="folio flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> § 03 · The wall
        </div>
        <h1 className="display">Names, scribbled in chalk by the hopeful.</h1>
        <p className="max-w-2xl text-ink-soft" style={{ fontSize: 13, lineHeight: 1.65 }}>
          Every bot that knocks at the wrong door gets a mark here. We mask the IPs, keep the
          punchline. Updated every 30 seconds.
        </p>
        {stats?.lastUpdated && (
          <div className="folio flex items-center gap-2">
            <Activity className="h-3 w-3" /> Last reading · {new Date(stats.lastUpdated).toLocaleTimeString()}
          </div>
        )}
      </header>

      {/* Stat plates */}
      {stats && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatPlate icon={<Eye className="h-4 w-4" />}    label="Total knocks"   value={String(stats.totalAttacks)} />
          <StatPlate icon={<Zap className="h-4 w-4" />}    label="Today"          value={String(stats.attacksToday)} />
          <StatPlate icon={<Globe className="h-4 w-4" />}  label="Unique IPs"     value={String(stats.uniqueIPs)} />
          <StatPlate icon={<Shield className="h-4 w-4" />} label="Banned"         value={String(wallOfShame?.statistics.totalBans || 0)} />
        </section>
      )}

      {/* Categories */}
      {stats && stats.topCategories.length > 0 && (
        <section className="plate">
          <div className="folio mb-4 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" /> § 03.a · Categories
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.topCategories.map(category => (
              <div
                key={category.category}
                className="flex items-center justify-between gap-3 border border-rule p-3"
              >
                <div>
                  <div className="font-display italic capitalize" style={{ fontSize: 16 }}>
                    {category.category}
                  </div>
                  <div className="folio">{category.count} attempts</div>
                </div>
                <span className="led led-ember" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wall of Shame */}
      {wallOfShame && (
        <section className="plate">
          <div className="folio mb-4">§ 03.b · The wall itself</div>

          {/* Permanent */}
          {wallOfShame.permanentBans.length > 0 && (
            <div className="mb-8">
              <div className="folio mb-3 flex items-center gap-2">
                <span className="led led-error" /> Permanent · hall of regret
              </div>
              <div className="space-y-2">
                {wallOfShame.permanentBans.slice(0, 10).map((entry, i) => (
                  <BanEntry key={i} entry={entry} tone="permanent" />
                ))}
              </div>
            </div>
          )}

          {/* Temporary */}
          {wallOfShame.temporaryBans.length > 0 && (
            <div>
              <div className="folio mb-3 flex items-center gap-2">
                <span className="led led-warn" /> Temporary · 404 hunters
              </div>
              <div className="space-y-2">
                {wallOfShame.temporaryBans.map((entry, i) => (
                  <BanEntry key={i} entry={entry} tone="temporary" />
                ))}
              </div>
            </div>
          )}

          {wallOfShame.permanentBans.length === 0 && wallOfShame.temporaryBans.length === 0 && (
            <div className="text-center py-12">
              <div className="font-display italic text-2xl mb-2">The wall is clean.</div>
              <div className="folio">No script kiddies have wandered in yet.</div>
            </div>
          )}
        </section>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <section className="plate">
          <div className="folio mb-4 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" /> § 03.c · Achievements unlocked
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map((a, i) => (
              <div key={i} className="border border-rule p-5 space-y-2">
                <div className="font-display italic" style={{ fontSize: 18, color: 'var(--ember)' }}>
                  {a.title}
                </div>
                <div className="text-ink-soft" style={{ fontSize: 12, lineHeight: 1.55 }}>{a.description}</div>
                <div className="folio pt-1" style={{ color: 'var(--ember)' }}>{a.winner}</div>
                {a.count !== undefined && <div className="folio">{a.count} attempts</div>}
                {a.attacksPerSecond && <div className="folio">{a.attacksPerSecond} att/s</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

interface StatPlateProps {
  icon: React.ReactNode
  label: string
  value: string
}

const StatPlate: React.FC<StatPlateProps> = ({ icon, label, value }) => (
  <div className="plate">
    <div className="flex items-start justify-between">
      <div>
        <div className="folio mb-2">{label}</div>
        <div className="font-display italic" style={{ fontSize: 32 }}>{value}</div>
      </div>
      <div className="text-ink-faint">{icon}</div>
    </div>
  </div>
)

interface BanEntryProps {
  entry: WallOfShameEntry
  tone: 'permanent' | 'temporary'
}

const BanEntry: React.FC<BanEntryProps> = ({ entry, tone }) => (
  <div
    className={`strip ${tone === 'permanent' ? 'strip-error' : 'strip-warn'} flex-col items-stretch`}
  >
    <div className="flex items-start justify-between gap-4 w-full">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-xl flex-shrink-0 leading-none" style={{ marginTop: 2 }}>
          {entry.countryFlag || '🏴'}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="folio">{entry.maskedIP}</div>
          <div className="font-display italic text-ink truncate" style={{ fontSize: 14 }}>
            "{entry.offendingRequest}"
          </div>
          <div className="text-ink-soft" style={{ fontSize: 12 }}>{entry.sarcasticComment}</div>
        </div>
      </div>
      <div className="flex-shrink-0 text-right space-y-1">
        <div className="folio capitalize">{entry.category}</div>
        {tone === 'temporary' && entry.timeLeft && (
          <div className="folio flex items-center gap-1 justify-end" style={{ color: 'var(--amber)' }}>
            <Clock className="h-3 w-3" /> {entry.timeLeft}
          </div>
        )}
        <div className="folio">{new Date(entry.bannedAt).toLocaleDateString()}</div>
      </div>
    </div>
  </div>
)

export default SecurityDashboard
