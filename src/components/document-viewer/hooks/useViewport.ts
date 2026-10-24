import { useLayoutEffect, useState, type RefObject } from 'react'

export function useViewport(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({width: 800, height: 600, top: 0})
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    let frame = 0
    const measure = () => {cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setSize({width: node.clientWidth, height: node.clientHeight, top: node.scrollTop}))}
    const observer = new ResizeObserver(measure)
    observer.observe(node); node.addEventListener('scroll', measure, {passive: true}); measure()
    return () => {cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('scroll', measure)}
  }, [ref])
  return size
}
