export type ExportFormat = 'png' | 'jpeg' | 'webp'

export function createExportFilename(projectName: string, format: ExportFormat = 'png', date = new Date()): string {
  const safeName = projectName.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mosaic-gallery'
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${safeName}-${timestamp}.${format}`
}

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality = 0.9,
  backgroundColor = '#ffffff',
): string {
  if (format === 'png') return canvas.toDataURL('image/png')

  if (format === 'webp') return canvas.toDataURL('image/webp', Math.max(0.1, Math.min(1, quality)))

  const jpegCanvas = document.createElement('canvas')
  jpegCanvas.width = canvas.width
  jpegCanvas.height = canvas.height
  const context = jpegCanvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height)
  context.drawImage(canvas, 0, 0)
  return jpegCanvas.toDataURL('image/jpeg', Math.max(0.1, Math.min(1, quality)))
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.max(0, Math.floor(base64.length * 0.75) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function downloadImage(dataUrl: string, filename: string): void {
  const downloadLink = document.createElement('a')
  downloadLink.href = dataUrl
  downloadLink.download = filename
  downloadLink.click()
}

export const downloadPng = downloadImage
