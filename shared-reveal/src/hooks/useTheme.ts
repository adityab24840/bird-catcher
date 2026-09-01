import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme_pref'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

function getStoredTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
  }

  function toggleTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const effectiveDark =
      theme === 'dark' || (theme === 'system' && prefersDark)
    setThemeState(effectiveDark ? 'light' : 'dark')
  }

  const prefersDark = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)

  return { theme, setTheme, toggleTheme, isDark }
}
