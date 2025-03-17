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
    return <div className="min-h-[400px] w-full bg-card/50 animate-pulse rounded-lg" />
  }

  return <>{children}</>
}

