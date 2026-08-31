import { useEffect, useRef, useState } from 'react'

export function usePullToRefresh(onRefresh: () => void, threshold = 64) {
  const startY = useRef(0)
  const [pulling, setPulling] = useState(false)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const el = document.documentElement

    function onTouchStart(e: TouchEvent) {
      if (el.scrollTop > 0) return
      startY.current = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      if (el.scrollTop > 0) { startY.current = 0; return }
      if (!startY.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        setPulling(true)
        setDistance(Math.min(dy, threshold * 1.5))
      }
    }

    function onTouchEnd() {
      if (pulling && distance >= threshold) {
        onRefresh()
        try { navigator.vibrate?.(10) } catch {}
      }
      setPulling(false)
      setDistance(0)
      startY.current = 0
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh, pulling, distance, threshold])

  return { pulling, distance }
}
