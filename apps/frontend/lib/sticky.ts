'use client'

import * as React from 'react'

// The bars that stick under the header (search, filters, day and week arrows) publish their
// height in --page-bar-height, so whatever sticks below them (table headers, day titles,
// group names) sits right under them: var(--sticky-top). A bar that is not sticky at this
// width (StickyBar on a computer) counts as zero.
const bars = new Map<Element, number>()

function publish() {
  const height = Math.max(0, ...bars.values())
  document.documentElement.style.setProperty('--page-bar-height', `${height}px`)
}

export function usePageBar<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      bars.set(element, getComputedStyle(element).position === 'sticky' ? element.offsetHeight : 0)
      publish()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      bars.delete(element)
      publish()
    }
  }, [ref])
}
