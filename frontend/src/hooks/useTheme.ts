import { useEffect, useState, useCallback } from 'react'

export type Theme = 'day' | 'night'

const STORAGE_KEY = 'whirlcryptTheme'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'day'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'day' || stored === 'night') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
}

/**
 * Theme state for the Old Forge ink/paper palette.
 * Applies the `theme-night` class to <html> so component CSS can react via CSS variables.
 * Persists explicit choices to localStorage; otherwise tracks `prefers-color-scheme`.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.classList.toggle('theme-night', theme === 'night')
  }, [theme])

  // when user has not made an explicit choice, follow system changes
  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY)) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY)) return
      setThemeState(e.matches ? 'night' : 'day')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }, [])

  const toggle = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'day' ? 'night' : 'day'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { theme, setTheme, toggle }
}
