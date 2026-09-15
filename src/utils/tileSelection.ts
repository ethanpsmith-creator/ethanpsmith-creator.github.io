import {
  DEFAULT_RGB_WEIGHTS,
  matchingDistance,
  type MatchingMethod,
  type RandomSource,
  type RgbWeights,
  type SourceImageMatch,
  type SourceImageWithUsage,
} from './colorMatching'
import type { AverageRgb } from './imageAnalysis'
import { circularHueDistance, hsvToRgb, rgbToHsv } from './colorConversion'

export function findBestSourceImage<T>(
  targetRgb: AverageRgb & { brightness?: number; saturation?: number; hue?: number },
  sourceImages: SourceImageWithUsage<T>[],
  weights: RgbWeights = DEFAULT_RGB_WEIGHTS,
  preferVariety = false,
  randomness = 0,
  random: RandomSource = Math.random,
  brightnessWeight = 0,
  saturationWeight = 0,
  hueWeight = 0,
  matchingMethod: MatchingMethod = 'rgb',
  useEverySourceImage = false,
  paletteHues: number[] = [],
  paletteColors: AverageRgb[] = [],
): SourceImageMatch<T> | undefined {
  if (sourceImages.length === 0) return undefined

  const paletteSources = paletteHues.length > 0
    ? sourceImages.filter((source) => paletteHues.some((hue) => circularHueDistance(source.hue ?? 0, hue) <= 0.18))
    : sourceImages
  const matchingSources = paletteSources.length > 0 ? paletteSources : sourceImages

  const matches: Array<SourceImageMatch<T> & { score: number }> = []
  let bestScore = Number.POSITIVE_INFINITY

  for (const sourceImage of matchingSources) {
    const adjustedTarget = paletteColors.length > 0 ? remapTargetToPalette(targetRgb, paletteColors) : targetRgb
    const distance = matchingDistance(adjustedTarget, sourceImage, weights, undefined, brightnessWeight, saturationWeight, hueWeight, matchingMethod)
    const varietyPenalty = preferVariety
      ? 1 + 0.08 * (sourceImage.usageCount / (sourceImage.usageCount + 1))
      : 1
    const score = distance * varietyPenalty
    matches.push({ sourceImage, distance, score })
    bestScore = Math.min(bestScore, score)
  }

  const unusedMatches = matches.filter((match) => (
    match.sourceImage as SourceImageWithUsage<T>
  ).usageCount === 0)
  const reasonableUnusedMatches = useEverySourceImage && unusedMatches.length > 0
    ? unusedMatches.filter((match) => match.score <= bestScore * 1.35 + 0.05)
    : []
  const selectionPool = reasonableUnusedMatches.length > 0 ? reasonableUnusedMatches : matches
  const selectionBestScore = Math.min(...selectionPool.map((match) => match.score))

  if (randomness <= 0) return selectionPool.find((match) => match.score === selectionBestScore)

  const nearBestLimit = selectionBestScore + Math.max(selectionBestScore * randomness * 0.5, randomness * 12)
  const nearBestMatches = selectionPool.filter((match) => match.score <= nearBestLimit)
  const spread = Math.max(selectionBestScore * 0.2, 12) * randomness
  const weightedMatches = nearBestMatches.map((match) => ({
    match,
    weight: Math.exp(-(match.score - bestScore) / spread),
  }))
  const totalWeight = weightedMatches.reduce((total, item) => total + item.weight, 0)
  let pick = random() * totalWeight

  for (const weightedMatch of weightedMatches) {
    pick -= weightedMatch.weight
    if (pick <= 0) return weightedMatch.match
  }

  return weightedMatches[weightedMatches.length - 1]?.match
}

function remapTargetToPalette(
  target: AverageRgb & { brightness?: number; saturation?: number; hue?: number },
  paletteColors: AverageRgb[],
) {
  const targetHsv = rgbToHsv(target.red, target.green, target.blue)
  const nearest = paletteColors.reduce((best, color) => {
    const colorHue = rgbToHsv(color.red, color.green, color.blue).hue
    const distance = circularHueDistance(targetHsv.hue, colorHue)
    return distance < best.distance ? { color, distance } : best
  }, { color: paletteColors[0], distance: Number.POSITIVE_INFINITY })
  const paletteHsv = rgbToHsv(nearest.color.red, nearest.color.green, nearest.color.blue)
  return {
    ...hsvToRgb(paletteHsv.hue, targetHsv.saturation, targetHsv.value),
    brightness: target.brightness,
    saturation: target.saturation,
    hue: paletteHsv.hue,
  }
}
