import { type MatchingMethod, type RgbWeights, type SourceImageWithUsage } from './colorMatching'
import { findBestSourceImage } from './tileSelection'
import { createSeededRandom } from './projectSettings'
import type { GridCell } from './gridAnalysis'
import type { MosaicTileSelection } from './mosaicGeneration'
import type { AverageRgb } from './imageAnalysis'

export type MosaicWorkerRequest = {
  grid: GridCell[]
  sources: SourceImageWithUsage<string>[]
  weights: RgbWeights
  maxRepetitions: number
  preferVariety: boolean
  randomness: number
  randomSeed: string
  brightnessWeight: number
  saturationWeight: number
  hueWeight: number
  matchingMethod: MatchingMethod
  useEverySourceImage: boolean
  paletteHues: number[]
  paletteColors: AverageRgb[]
}

export type MosaicWorkerResponse =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'complete'; selections: MosaicTileSelection[] }
  | { type: 'error'; message: string }

const workerContext = self as unknown as {
  onmessage: ((event: MessageEvent<MosaicWorkerRequest>) => void) | null
  postMessage: (message: MosaicWorkerResponse) => void
}

workerContext.onmessage = (event) => {
  try {
    const request = event.data
    const sources = request.sources.map((source) => ({ ...source }))
    const random = createSeededRandom(request.randomSeed)
    const selections: MosaicTileSelection[] = []
    const total = request.grid.length
    const progressStep = Math.max(1, Math.floor(total / 100))

    request.grid.forEach((cell, index) => {
      const availableSources = sources.filter((source) => source.usageCount < request.maxRepetitions)
      const candidates = availableSources.length > 0 ? availableSources : sources
      const match = findBestSourceImage(
        {
          ...cell.averageRgb,
          brightness: cell.brightness,
          saturation: cell.saturation,
          hue: cell.hue,
        },
        candidates,
        request.weights,
        request.preferVariety,
        request.randomness,
        random,
        request.brightnessWeight,
        request.saturationWeight,
        request.hueWeight,
        request.matchingMethod,
        request.useEverySourceImage,
        request.paletteHues,
        request.paletteColors,
      )

      if (match) {
        const source = match.sourceImage
        ;(source as SourceImageWithUsage<string>).usageCount += 1
        selections.push({ row: cell.row, column: cell.column, sourceUrl: source.image, distance: match.distance })
      }

      if ((index + 1) % progressStep === 0 || index === total - 1) {
        workerContext.postMessage({ type: 'progress', completed: index + 1, total })
      }
    })

    workerContext.postMessage({ type: 'complete', selections })
  } catch (error) {
    workerContext.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Mosaic worker failed',
    })
  }
}
