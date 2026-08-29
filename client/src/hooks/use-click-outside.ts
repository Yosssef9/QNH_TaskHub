import type { RefObject } from 'react'
import { useEffect, useEffectEvent } from 'react'

export function useClickOutside<TElement extends HTMLElement>(
  ref: RefObject<TElement | null>,
  handler: (event: PointerEvent) => void,
  enabled = true,
): void {
  const onPointerDownOutside = useEffectEvent(handler)

  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(event: PointerEvent) {
      const element = ref.current
      if (!element || event.composedPath().includes(element)) return

      onPointerDownOutside(event)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [enabled, ref])
}
