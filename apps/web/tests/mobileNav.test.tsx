import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/settings',
}))

vi.mock('@/lib/demo/tutorial-bus', () => ({
  emitTutorialAction: vi.fn(),
}))

describe('MobileNav', () => {
  afterEach(() => cleanup())

  it('opens a full deck menu that includes Book and Charts', async () => {
    const { MobileNav } = await import('@/components/desk/MobileNav')
    render(<MobileNav />)

    expect(screen.queryByRole('link', { name: /chart room/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /deck menu/i }))

    expect(screen.getByRole('link', { name: /logbook/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /chart room/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /crow's nest/i })).toBeTruthy()
  })
})
