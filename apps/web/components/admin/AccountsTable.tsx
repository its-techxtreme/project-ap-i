'use client'

import { useState } from 'react'

import { StatusBadge } from '@/components/app/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { PlatformAccountRow } from '@/lib/data/adminQueries'
import { truncateText } from '@/lib/format/relativeTime'

export function AccountsTable({ accounts }: { accounts: PlatformAccountRow[] }) {
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const hasLoginRequired = accounts.some(
    (account) => account.login_required || account.status === 'login_required',
  )

  function stubAction(label: string) {
    setActionMessage(`${label} not yet implemented. Coming in Phase 11.`)
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
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionMessage}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 font-medium">Niche</th>
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Account label</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Login required</th>
              <th className="px-3 py-2 font-medium">Last successful upload</th>
              <th className="px-3 py-2 font-medium">Failure count</th>
              <th className="px-3 py-2 font-medium">Browser profile path</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">{account.niche_name}</td>
                <td className="px-3 py-2 capitalize">{account.platform}</td>
                <td className="px-3 py-2">{account.account_label}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={account.status} />
                </td>
                <td className="px-3 py-2">
                  {account.login_required ? <span aria-label="Login required">⚠️</span> : '—'}
                </td>
                <td className="px-3 py-2">
                    {account.last_successful_upload_label ?? 'Never'}
                </td>
                <td className="px-3 py-2">{account.failure_count}</td>
                <td className="px-3 py-2" title={account.browser_profile_path ?? undefined}>
                  {account.browser_profile_path
                    ? truncateText(account.browser_profile_path, 24)
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => stubAction('Mark Login Recovered')}
                    >
                      Mark Login Recovered (stub)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => stubAction('Pause')}>
                      Pause (stub)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => stubAction('Resume')}>
                      Resume (stub)
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
