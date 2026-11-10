'use client'

import * as React from 'react'
import qrcode from 'qrcode-generator'

import { cn } from '@/lib/utils'

// Four modules of white around the code, as the QR standard asks.
const QUIET = 4

function qrMatrix(value: string) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  return { size: qr.getModuleCount(), isDark: (row: number, col: number) => qr.isDark(row, col) }
}

// Always dark on white, in both themes: phone cameras read that best.
export function QrCode({ value, label, className }: { value: string, label: string, className?: string }) {
  const { size, path } = React.useMemo(() => {
    const { size, isDark } = qrMatrix(value)
    let d = ''
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { size, path: d }
  }, [value])

  return (
    <svg
      viewBox={`-${QUIET} -${QUIET} ${size + QUIET * 2} ${size + QUIET * 2}`}
      className={cn('size-44 rounded-lg bg-white sm:size-48', className)}
      role='img'
      aria-label={label}
      shapeRendering='crispEdges'
    >
      <path d={path} fill='#000' />
    </svg>
  )
}

// Saves the code as a PNG, black on a white background, about 1000px wide for print.
export function downloadQrPng(value: string, filename: string) {
  const { size, isDark } = qrMatrix(value)
  const scale = Math.max(1, Math.round(1000 / (size + QUIET * 2)))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = (size + QUIET * 2) * scale
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000'
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col)) context.fillRect((col + QUIET) * scale, (row + QUIET) * scale, scale, scale)
    }
  }
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}
