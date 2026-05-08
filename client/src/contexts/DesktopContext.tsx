import { createContext, useContext, useState } from 'react'
import { getActiveDesktop, setActiveDesktop } from '@/api/client'

interface DesktopContextValue {
  desktop: 1 | 2
  switchDesktop: (d: 1 | 2) => void
}

const DesktopContext = createContext<DesktopContextValue>({ desktop: 1, switchDesktop: () => {} })

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const [desktop, setDesktop] = useState<1 | 2>(getActiveDesktop)

  function switchDesktop(d: 1 | 2) {
    setActiveDesktop(d)
    setDesktop(d)
  }

  return (
    <DesktopContext.Provider value={{ desktop, switchDesktop }}>
      {children}
    </DesktopContext.Provider>
  )
}

export const useDesktop = () => useContext(DesktopContext)
