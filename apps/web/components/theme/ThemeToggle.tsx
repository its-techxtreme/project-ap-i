'use client'

import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme/ThemeProvider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'day' : 'night'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn('cursor-pointer', className)}
      aria-label={`Switch to ${next}`}
      title={theme === 'dark' ? 'Day voyage' : 'Night watch'}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-300" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-slate-600" aria-hidden="true" />
      )}
    </Button>
  )
}
