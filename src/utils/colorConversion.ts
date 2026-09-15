import type { AverageRgb } from './imageAnalysis'

export type HsvColor = { hue: number; saturation: number; value: number }
export type HslColor = { hue: number; saturation: number; lightness: number }
export type LabColor = { lightness: number; a: number; b: number }

export function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const normalizedRed = red / 255
  const normalizedGreen = green / 255
  const normalizedBlue = blue / 255
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue)
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue)
  const chroma = maximum - minimum
  let hue = 0

  if (chroma > 0) {
    if (maximum === normalizedRed) hue = ((normalizedGreen - normalizedBlue) / chroma) % 6
    else if (maximum === normalizedGreen) hue = (normalizedBlue - normalizedRed) / chroma + 2
    else hue = (normalizedRed - normalizedGreen) / chroma + 4
    hue /= 6
    if (hue < 0) hue += 1
  }

  return { hue, saturation: maximum === 0 ? 0 : chroma / maximum, value: maximum }
}

export function rgbToHsl(rgb: AverageRgb): HslColor {
  const red = rgb.red / 255
  const green = rgb.green / 255
  const blue = rgb.blue / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const chroma = maximum - minimum
  const lightness = (maximum + minimum) / 2

  if (chroma === 0) return { hue: 0, saturation: 0, lightness }

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1))
  let hue = maximum === red
    ? ((green - blue) / chroma) % 6
    : maximum === green
      ? (blue - red) / chroma + 2
      : (red - green) / chroma + 4
  hue /= 6
  if (hue < 0) hue += 1

  return { hue, saturation, lightness }
}

export function rgbToLab(rgb: AverageRgb): LabColor {
  const linearize = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }

  const red = linearize(rgb.red)
  const green = linearize(rgb.green)
  const blue = linearize(rgb.blue)
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883
  const convert = (value: number) => value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116

  const fx = convert(x)
  const fy = convert(y)
  const fz = convert(z)
  return { lightness: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function circularHueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second)
  return Math.min(difference, 1 - difference)
}
