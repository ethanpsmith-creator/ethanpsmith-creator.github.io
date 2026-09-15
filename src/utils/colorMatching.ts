import { circularHueDistance, rgbToHsl, rgbToLab } from './colorConversion'
import type { AverageRgb } from './imageAnalysis'

export type RgbWeights = {
  red: number
  green: number
  blue: number
}

export type SourceImageColor<T> = {
  image: T
  averageRgb: AverageRgb
  brightness?: number
  saturation?: number
  hue?: number
}

export type ColorDistanceMethod = (
  targetRgb: AverageRgb,
  sourceRgb: AverageRgb,
  weights: RgbWeights,
) => number

export type SourceImageMatch<T> = {
  sourceImage: SourceImageColor<T>
  distance: number
}

export type SourceImageWithUsage<T> = SourceImageColor<T> & {
  usageCount: number
}

export type RandomSource = () => number
export type MatchingMethod = 'rgb' | 'hsl' | 'lab'

export const DEFAULT_RGB_WEIGHTS: RgbWeights = {
  red: 1,
  green: 1,
  blue: 1,
}

export const weightedEuclideanRgbDistance: ColorDistanceMethod = (
  targetRgb,
  sourceRgb,
  weights,
) => {
  const redDifference = targetRgb.red - sourceRgb.red
  const greenDifference = targetRgb.green - sourceRgb.green
  const blueDifference = targetRgb.blue - sourceRgb.blue

  return Math.sqrt(
    weights.red * redDifference ** 2
      + weights.green * greenDifference ** 2
      + weights.blue * blueDifference ** 2,
  )
}

export function findClosestSourceImage<T>(
  targetRgb: AverageRgb & { brightness?: number; saturation?: number; hue?: number },
  sourceImages: SourceImageColor<T>[],
  weights: RgbWeights = DEFAULT_RGB_WEIGHTS,
  distanceMethod: ColorDistanceMethod = weightedEuclideanRgbDistance,
  brightnessWeight = 0,
  saturationWeight = 0,
  hueWeight = 0,
  matchingMethod: MatchingMethod = 'rgb',
): SourceImageMatch<T> | undefined {
  if (sourceImages.length === 0) return undefined

  let closestSource = sourceImages[0]
  let smallestDistance = matchingDistance(targetRgb, closestSource, weights, distanceMethod, brightnessWeight, saturationWeight, hueWeight, matchingMethod)

  for (const sourceImage of sourceImages.slice(1)) {
    const distance = matchingDistance(targetRgb, sourceImage, weights, distanceMethod, brightnessWeight, saturationWeight, hueWeight, matchingMethod)
    if (distance < smallestDistance) {
      closestSource = sourceImage
      smallestDistance = distance
    }
  }

  return { sourceImage: closestSource, distance: smallestDistance }
}

export function matchingDistance<T>(
  targetRgb: AverageRgb & { brightness?: number; saturation?: number; hue?: number },
  sourceImage: SourceImageColor<T>,
  weights: RgbWeights,
  distanceMethod: ColorDistanceMethod = weightedEuclideanRgbDistance,
  brightnessWeight = 0,
  saturationWeight = 0,
  hueWeight = 0,
  matchingMethod: MatchingMethod = 'rgb',
): number {
  const methodDistance = matchingMethod === 'hsl'
    ? hslDistance(targetRgb, sourceImage.averageRgb)
    : matchingMethod === 'lab'
      ? labDeltaE76Distance(targetRgb, sourceImage.averageRgb)
      : distanceMethod(targetRgb, sourceImage.averageRgb, weights) / Math.sqrt(3 * 255 ** 2)
  const brightnessDifference = Math.abs((targetRgb.brightness ?? 0) - (sourceImage.brightness ?? 0))
  const saturationDifference = Math.abs((targetRgb.saturation ?? 0) - (sourceImage.saturation ?? 0))
  const hueDifference = circularHueDistance(targetRgb.hue ?? 0, sourceImage.hue ?? 0)

  return methodDistance
    + brightnessWeight * brightnessDifference
    + saturationWeight * saturationDifference
    + hueWeight * hueDifference
}

function hslDistance(targetRgb: AverageRgb, sourceRgb: AverageRgb): number {
  const target = rgbToHsl(targetRgb)
  const source = rgbToHsl(sourceRgb)
  const hueDifference = circularHueDistance(target.hue, source.hue)
  return Math.sqrt(
    hueDifference ** 2
      + (target.saturation - source.saturation) ** 2
      + (target.lightness - source.lightness) ** 2,
  ) / Math.sqrt(3)
}

function labDeltaE76Distance(targetRgb: AverageRgb, sourceRgb: AverageRgb): number {
  const target = rgbToLab(targetRgb)
  const source = rgbToLab(sourceRgb)
  return Math.sqrt(
    (target.lightness - source.lightness) ** 2
      + (target.a - source.a) ** 2
      + (target.b - source.b) ** 2,
  ) / 100
}
