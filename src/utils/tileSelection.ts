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
): SourceImageMatch<T> | undefined {
  if (sourceImages.length === 0) return undefined

  const matches: Array<SourceImageMatch<T> & { score: number }> = []
  let bestScore = Number.POSITIVE_INFINITY

  for (const sourceImage of sourceImages) {
    const distance = matchingDistance(targetRgb, sourceImage, weights, undefined, brightnessWeight, saturationWeight, hueWeight, matchingMethod)
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
