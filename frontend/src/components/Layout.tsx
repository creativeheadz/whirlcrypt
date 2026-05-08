import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Github } from 'lucide-react'
import Logo from './Logo'
import { useTheme } from '../hooks/useTheme'

interface NavLinkProps {
  to: string
  label: string
  kicker?: string
  active: boolean
}

const NavLink: React.FC<NavLinkProps> = ({ to, label, kicker, active }) => (
  <Link to={to} className="group relative px-3 py-2 block">
    {kicker && (
      <span
        className={`block text-[9px] mb-0.5 transition-colors ${active ? 'text-ember' : 'text-ink-faint group-hover:text-ember'}`}
        style={{
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        {kicker}
      </span>
    )}
    <span
      className={`block transition-colors ${active ? 'text-ember' : 'text-ink group-hover:text-ember'}`}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}
    >
      {label}
    </span>
    {active && (
      <span
        className="absolute left-3 right-3 -bottom-px h-px"
        style={{ background: 'var(--ember)' }}
        aria-hidden
      />
    )}
  </Link>
)

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation()
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen flex flex-col stage">
      {/* Masthead */}
      <header className="border-b border-rule">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between py-5 gap-4">
            <Link to="/" className="block">
              <Logo />
            </Link>
            <nav className="flex items-center">
              <NavLink to="/"        label="Upload" kicker="§ I"   active={location.pathname === '/'} />
              <NavLink to="/admin"   label="Admin"  kicker="§ II"  active={location.pathname === '/admin'} />
              <NavLink to="/security" label="Wall"  kicker="§ III" active={location.pathname === '/security'} />
              <span
                className="mx-2 w-px h-7"
                style={{ background: 'var(--rule)' }}
                aria-hidden
              />
              <button
                type="button"
                onClick={toggle}
                aria-label={theme === 'night' ? 'Switch to day theme' : 'Switch to night theme'}
                title={theme === 'night' ? 'Day' : 'Night'}
                className="p-2 text-ink-faint hover:text-ember transition-colors"
              >
                {theme === 'night' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <a
                href="https://github.com/creativeheadz/whirlcrypt"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Source on GitHub"
                className="p-2 text-ink-faint hover:text-ember transition-colors"
              >
                <Github className="h-4 w-4" />
              </a>
            </nav>
          </div>
          {/* ember capsule rule under the masthead */}
          <div
            className="h-px"
            style={{ background: 'var(--ember)', opacity: 0.7 }}
            aria-hidden
          />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 lg:px-8 py-12">
        {children}
      </main>

      {/* Colophon */}
      <footer className="border-t border-rule mt-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div
            className="flex items-center gap-3 text-ink-faint"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            <span>© {new Date().getFullYear()} Whirlcrypt</span>
            <span aria-hidden>·</span>
            <span>RFC 8188 record stream</span>
            <span aria-hidden>·</span>
            <span>Zero server decryption</span>
          </div>
          <Link
            to="/security"
            className="text-ink-faint hover:text-ember transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            Forged in the Old Forge
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default Layout
