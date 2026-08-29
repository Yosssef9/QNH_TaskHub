import { useEffect, useEffectEvent } from 'react'

export function useEscapeKey(callback: (event: KeyboardEvent) => void, enabled = true): void {
  const onEscape = useEffectEvent(callback)

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onEscape(event)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
