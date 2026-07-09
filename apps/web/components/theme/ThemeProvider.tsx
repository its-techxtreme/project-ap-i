'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  THEME_STORAGE_KEYS,
  defaultThemeForSurface,
  type ThemeMode,
  type ThemeSurface,
} from '@/lib/theme/themeInit'

type ThemeContextValue = {
  surface: ThemeSurface
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyHtmlClass(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.theme = mode
}

function readStored(surface: ThemeSurface): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEYS[surface])
    if (value === 'light' || value === 'dark') return value
  } catch {
    // ignore
  }
  return null
}

export function ThemeProvider({
  surface,
  children,
}: {
  surface: ThemeSurface
  children: ReactNode
}) {
  const [theme, setThemeState] = useState<ThemeMode>(() => defaultThemeForSurface(surface))

  useEffect(() => {
    const stored = readStored(surface)
    const next = stored ?? defaultThemeForSurface(surface)
    setThemeState(next)
    applyHtmlClass(next)
  }, [surface])

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode)
      applyHtmlClass(mode)
      try {
        localStorage.setItem(THEME_STORAGE_KEYS[surface], mode)
      } catch {
        // ignore
      }
    },
    [surface],
  )

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const value = useMemo(
    () => ({ surface, theme, setTheme, toggleTheme }),
    [surface, theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
