"use client"

import { useEffect, useState, type ReactNode } from "react"

interface ClientWrapperProps {
  children: ReactNode
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[400px] w-full items-center justify-center text-base uppercase tracking-body text-ink-dim"
      >
        Initialising
        <span className="blink" aria-hidden="true">
          █
        </span>
      </div>
    )
  }

  return <>{children}</>
}

