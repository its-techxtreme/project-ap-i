'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  markAccountLoginRecovered,
  pausePlatformAccount,
  resumePlatformAccount,
} from '@/app/actions/adminActions'
import { useAdminCapabilities } from '@/components/admin/AdminCapabilities'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { PlatformAccountRow } from '@/lib/data/adminQueries'
import { truncateText } from '@/lib/format/relativeTime'

export function AccountsTable({ accounts }: { accounts: PlatformAccountRow[] }) {
  const router = useRouter()
  const { canWrite } = useAdminCapabilities()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const hasLoginRequired = accounts.some(
    (account) => account.login_required || account.status === 'login_required',
  )

  async function runAccountAction(
    accountId: string,
    action: 'recovered' | 'pause' | 'resume',
  ) {
    setBusyId(accountId)
    try {
      const result =
        action === 'recovered'
          ? await markAccountLoginRecovered(accountId)
          : action === 'pause'
            ? await pausePlatformAccount(accountId)
            : await resumePlatformAccount(accountId)

      if (!result.success) {
        setActionMessage(result.error ?? 'Action failed.')
        return
      }
      setActionMessage(result.message)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {hasLoginRequired ? (
        <Alert variant="destructive">
          <AlertTitle>Action required</AlertTitle>
          <AlertDescription>One or more accounts require manual login.</AlertDescription>
        </Alert>
      ) : null}

      {actionMessage ? (
        <p className="notice-warn rounded-md border px-3 py-2 text-sm">{actionMessage}</p>
      ) : null}

      <div className="panel-surface overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2.5 font-medium">Niche</th>
                <th className="px-2.5 py-2.5 font-medium">Platform</th>
                <th className="px-2.5 py-2.5 font-medium">Account</th>
                <th className="px-2.5 py-2.5 font-medium">Status</th>
                <th className="px-2.5 py-2.5 font-medium">Login</th>
                <th className="px-2.5 py-2.5 font-medium">Last upload</th>
                <th className="px-2.5 py-2.5 font-medium">Failures</th>
                <th className="px-2.5 py-2.5 font-medium">Profile</th>
                <th className="px-2.5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const busy = busyId === account.id
                return (
                  <tr
                    key={account.id}
                    className="bg-row-hover border-b border-border/60 last:border-b-0 transition-colors"
                  >
                    <td className="px-2.5 py-2 text-xs">{account.niche_name}</td>
                    <td className="px-2.5 py-2 text-xs capitalize">{account.platform}</td>
                    <td className="px-2.5 py-2 text-xs">{account.account_label}</td>
                    <td className="px-2.5 py-2">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-2.5 py-2">
                      {account.login_required ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400"
                          aria-label="Login required"
                        >
                          <AlertTriangle className="size-3.5" aria-hidden />
                          Required
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-xs text-muted-foreground">
                      {account.last_successful_upload_label ?? 'Never'}
                    </td>
                    <td className="px-2.5 py-2 text-xs tabular-nums">{account.failure_count}</td>
                    <td
                      className="px-2.5 py-2 text-xs text-muted-foreground"
                      title={account.browser_profile_path ?? undefined}
                    >
                      {account.browser_profile_path
                        ? truncateText(account.browser_profile_path, 24)
                        : '—'}
                    </td>
                    <td className="px-2.5 py-2">
                      {canWrite ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={busy || busyId !== null}
                            onClick={() => void runAccountAction(account.id, 'recovered')}
                          >
                            Mark Login Recovered
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={busy || busyId !== null || account.status === 'paused'}
                            onClick={() => void runAccountAction(account.id, 'pause')}
                          >
                            Pause
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={busy || busyId !== null || account.status === 'active'}
                            onClick={() => void runAccountAction(account.id, 'resume')}
                          >
                            Resume
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
