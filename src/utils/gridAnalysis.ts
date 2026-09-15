import { rgbToHsv } from './colorConversion'
import type { AverageRgb } from './imageAnalysis'

export const DEFAULT_GRID_ROWS = 50
export const DEFAULT_GRID_COLUMNS = 50
export const GRID_RESOLUTION_PRESETS = [10, 25, 50, 75, 100] as const

export type GridCell = {
  row: number
  column: number
  averageRgb: AverageRgb
  brightness: number
  saturation: number
  hue: number
}

export type GridAnalysisOptions = {
  rows?: number
  columns?: number
}

export type ImageDimensions = {
  width: number
  height: number
}

export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(imageUrl)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('The selected file dimensions could not be read'))
    }

    image.src = imageUrl
  })
}

/**
 * Divides a local image into rectangular cells and averages each cell's color.
 */
export function analyzeImageGrid(
  file: File,
  options: GridAnalysisOptions = {},
): Promise<GridCell[]> {
  const rows = options.rows ?? DEFAULT_GRID_ROWS
  const columns = options.columns ?? DEFAULT_GRID_COLUMNS

  if (!Number.isInteger(rows) || rows < 1) {
    return Promise.reject(new Error('Grid rows must be a positive integer'))
  }

  if (!Number.isInteger(columns) || columns < 1) {
    return Promise.reject(new Error('Grid columns must be a positive integer'))
  }

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight

        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context is unavailable')

        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const cells: GridCell[] = []

        for (let row = 0; row < rows; row += 1) {
          const startY = Math.floor((row * canvas.height) / rows)
          const endY = Math.floor(((row + 1) * canvas.height) / rows)

          for (let column = 0; column < columns; column += 1) {
            const startX = Math.floor((column * canvas.width) / columns)
            const endX = Math.floor(((column + 1) * canvas.width) / columns)
            let redTotal = 0
            let greenTotal = 0
            let blueTotal = 0
            let brightnessTotal = 0
            let saturationTotal = 0
            let hueSinTotal = 0
            let hueCosTotal = 0
            let huePixelCount = 0
            let visiblePixelCount = 0

            for (let y = startY; y < endY; y += 1) {
              for (let x = startX; x < endX; x += 1) {
                const pixelIndex = (y * canvas.width + x) * 4
                const alpha = pixels[pixelIndex + 3]
                if (alpha === 0) continue

                redTotal += pixels[pixelIndex]
                greenTotal += pixels[pixelIndex + 1]
                blueTotal += pixels[pixelIndex + 2]
                brightnessTotal += (
                  0.2126 * pixels[pixelIndex]
                  + 0.7152 * pixels[pixelIndex + 1]
                  + 0.0722 * pixels[pixelIndex + 2]
                )
                const hsv = rgbToHsv(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2])
                saturationTotal += hsv.saturation
                if (hsv.saturation >= 0.05) {
                  const angle = hsv.hue * Math.PI * 2
                  hueSinTotal += Math.sin(angle)
                  hueCosTotal += Math.cos(angle)
                  huePixelCount += 1
                }
                visiblePixelCount += 1
              }
            }

            cells.push({
              row,
              column,
              averageRgb: visiblePixelCount === 0
                ? { red: 0, green: 0, blue: 0 }
                : {
                    red: Math.round(redTotal / visiblePixelCount),
                    green: Math.round(greenTotal / visiblePixelCount),
                    blue: Math.round(blueTotal / visiblePixelCount),
                  },
              brightness: visiblePixelCount === 0
                ? 0
                : brightnessTotal / visiblePixelCount / 255,
              saturation: visiblePixelCount === 0
                ? 0
                : saturationTotal / visiblePixelCount,
              hue: huePixelCount === 0
                ? 0
                : (Math.atan2(hueSinTotal, hueCosTotal) / (Math.PI * 2) + 1) % 1,
            })
          }
        }

        resolve(cells)
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('The selected file could not be read as an image'))
    }

    image.src = imageUrl
  })
}