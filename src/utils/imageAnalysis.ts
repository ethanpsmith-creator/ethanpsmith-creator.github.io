import { rgbToHsv } from './colorConversion'
export type AverageRgb = {
  red: number
  green: number
  blue: number
}

export type ImageAnalysis = {
  averageRgb: AverageRgb
  brightness: number
  saturation: number
  hue: number
  prominentColors: AverageRgb[]
}

/**
 * Calculates the average visible pixel color of a locally selected image.
 */
export function analyzeImage(file: File): Promise<AverageRgb> {
  return analyzeImageDetails(file).then((analysis) => analysis.averageRgb)
}

/**
 * Calculates average RGB and normalized perceived brightness for a local image.
 */
export function analyzeImageDetails(file: File): Promise<ImageAnalysis> {
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
        let redTotal = 0
        let greenTotal = 0
        let blueTotal = 0
          let brightnessTotal = 0
        let saturationTotal = 0
        let hueSinTotal = 0
        let hueCosTotal = 0
        let huePixelCount = 0
        let visiblePixelCount = 0
        const colorBins = new Map<string, { count: number; red: number; green: number; blue: number }>()

        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3]
          if (alpha === 0) continue

          redTotal += pixels[index]
          greenTotal += pixels[index + 1]
          blueTotal += pixels[index + 2]
          brightnessTotal += (
            0.2126 * pixels[index]
            + 0.7152 * pixels[index + 1]
            + 0.0722 * pixels[index + 2]
          )
          const hsv = rgbToHsv(pixels[index], pixels[index + 1], pixels[index + 2])
          saturationTotal += hsv.saturation
          if (hsv.saturation >= 0.05) {
            const angle = hsv.hue * Math.PI * 2
            hueSinTotal += Math.sin(angle)
            hueCosTotal += Math.cos(angle)
            huePixelCount += 1
          }
          visiblePixelCount += 1
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]
          const key = `${red >> 4}-${green >> 4}-${blue >> 4}`
          const bin = colorBins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
          bin.count += 1
          bin.red += red
          bin.green += green
          bin.blue += blue
          colorBins.set(key, bin)
        }

        if (visiblePixelCount === 0) {
          resolve({ averageRgb: { red: 0, green: 0, blue: 0 }, brightness: 0, saturation: 0, hue: 0, prominentColors: [] })
          return
        }

        const prominentColors = Array.from(colorBins.values())
          .sort((first, second) => second.count - first.count)
          .slice(0, 3)
          .map((bin) => ({
            red: Math.round(bin.red / bin.count),
            green: Math.round(bin.green / bin.count),
            blue: Math.round(bin.blue / bin.count),
          }))

        resolve({
          averageRgb: {
            red: Math.round(redTotal / visiblePixelCount),
            green: Math.round(greenTotal / visiblePixelCount),
            blue: Math.round(blueTotal / visiblePixelCount),
          },
          brightness: brightnessTotal / visiblePixelCount / 255,
          saturation: saturationTotal / visiblePixelCount,
          hue: huePixelCount === 0
            ? 0
            : (Math.atan2(hueSinTotal, hueCosTotal) / (Math.PI * 2) + 1) % 1,
          prominentColors,
        })
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