'use client'

import { createContext, useContext, type ReactNode } from 'react'

type AdminCapabilities = {
  canWrite: boolean
  role: 'admin' | 'demo'
}

const AdminCapabilitiesContext = createContext<AdminCapabilities>({
  canWrite: true,
  role: 'admin',
})

export function AdminCapabilitiesProvider({
  canWrite,
  role,
  children,
}: AdminCapabilities & { children: ReactNode }) {
  return (
    <AdminCapabilitiesContext.Provider value={{ canWrite, role }}>
      {children}
    </AdminCapabilitiesContext.Provider>
  )
}

export function useAdminCapabilities(): AdminCapabilities {
  return useContext(AdminCapabilitiesContext)
}
