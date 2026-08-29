import { useCallback, useEffect, useRef, useState } from 'react'

const OPEN_DELAY_MS = 80
const CLOSE_DELAY_MS = 180

export function useAutoExpandSidebar() {
  const [isExpanded, setIsExpanded] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerInside = useRef(false)
  const dismissedUntilPointerLeaves = useRef(false)

  const clearTimer = useCallback((timer: typeof openTimer) => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const expandSoon = useCallback(() => {
    if (dismissedUntilPointerLeaves.current) return
    clearTimer(closeTimer)
    clearTimer(openTimer)
    openTimer.current = setTimeout(() => setIsExpanded(true), OPEN_DELAY_MS)
  }, [clearTimer])

  const collapseSoon = useCallback(() => {
    clearTimer(openTimer)
    clearTimer(closeTimer)
    closeTimer.current = setTimeout(() => {
      if (!pointerInside.current) setIsExpanded(false)
    }, CLOSE_DELAY_MS)
  }, [clearTimer])

  useEffect(
    () => () => {
      clearTimer(openTimer)
      clearTimer(closeTimer)
    },
    [clearTimer],
  )

  return {
    isExpanded,
    onPointerEnter: () => {
      pointerInside.current = true
      expandSoon()
    },
    onPointerLeave: () => {
      pointerInside.current = false
      dismissedUntilPointerLeaves.current = false
      collapseSoon()
    },
    onNavigate: () => {
      dismissedUntilPointerLeaves.current = pointerInside.current
      clearTimer(openTimer)
      clearTimer(closeTimer)
      setIsExpanded(false)
    },
  }
}
