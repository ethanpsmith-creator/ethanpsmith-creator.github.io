import { analyzeImageGrid } from './gridAnalysis'
import {
  canvasToDataUrl,
  createExportFilename,
  estimateDataUrlBytes,
  type ExportFormat,
} from './export'
import { generateMosaicWithMetadata, type CropPosition, type MosaicGenerationMetadata, type MosaicRenderOptions, type RotationMode, type MosaicTileSelection } from './mosaicRendering'
import type { MatchingMethod, RgbWeights } from './colorMatching'
import type { SourceImage } from './projectSettings'
import type { AverageRgb } from './imageAnalysis'
import type { MosaicWorkerRequest, MosaicWorkerResponse } from './mosaicWorker'

export type MosaicGenerationRequest = {
  mainImageFile: File
  sourceImages: SourceImage[]
  grid: {
    rows: number
    columns: number
  }
  rgbWeights: RgbWeights
  maxRepetitions: number
  preferVariety: boolean
  randomness: number
  randomSource: () => number
  randomSeed: string
  brightnessWeight: number
  saturationWeight: number
  hueWeight: number
  matchingMethod: MatchingMethod
  cropPosition: CropPosition
  rotationMode: RotationMode
  outputSize: { width: number; height: number }
  renderOptions: MosaicRenderOptions
  useEverySourceImage: boolean
  paletteHues: number[]
  paletteColors: AverageRgb[]
  export: {
    format: ExportFormat
    quality: number
    projectName: string
  }
}

export type MosaicGenerationResult = {
  canvas: HTMLCanvasElement
  dataUrl: string
  filename: string
  estimatedBytes: number
  width: number
  height: number
  metadata: MosaicGenerationMetadata
}

export type MosaicGenerationStage = 'analyzing' | 'matching' | 'rendering' | 'encoding'
export type MosaicProgressHandler = (percentage: number, stage: MosaicGenerationStage) => void

export class MosaicGenerationError extends Error {
  readonly stage: MosaicGenerationStage
  readonly cause?: unknown

  constructor(
    message: string,
    stage: MosaicGenerationStage,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'MosaicGenerationError'
    this.stage = stage
    this.cause = cause
  }
}

export async function generateApplicationMosaic(
  request: MosaicGenerationRequest,
  onProgress?: MosaicProgressHandler,
  signal?: AbortSignal,
): Promise<MosaicGenerationResult> {
  validateGenerationRequest(request)
  throwIfAborted(signal)
  let mainImageGrid
  try {
    onProgress?.(0, 'analyzing')
    mainImageGrid = await analyzeImageGrid(request.mainImageFile, request.grid)
  } catch (error) {
    throw new MosaicGenerationError('Main image analysis failed', 'analyzing', error)
  }
  throwIfAborted(signal)
  let selections
  try {
    const workerRequest: MosaicWorkerRequest = {
    grid: mainImageGrid,
    sources: request.sourceImages.map((sourceImage) => ({
      image: sourceImage.url,
      averageRgb: sourceImage.averageRgb,
      brightness: sourceImage.brightness,
      saturation: sourceImage.saturation,
      hue: sourceImage.hue,
      usageCount: 0,
    })),
    weights: request.rgbWeights,
    maxRepetitions: request.maxRepetitions,
    preferVariety: request.preferVariety,
    randomness: request.randomness,
    randomSeed: request.randomSeed,
    brightnessWeight: request.brightnessWeight,
    saturationWeight: request.saturationWeight,
    hueWeight: request.hueWeight,
    matchingMethod: request.matchingMethod,
    useEverySourceImage: request.useEverySourceImage,
    paletteHues: request.paletteHues,
    paletteColors: request.paletteColors,
    }
    selections = await selectTilesInWorker(workerRequest, (percentage) => onProgress?.(percentage, 'matching'), signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new MosaicGenerationError('Tile matching failed', 'matching', error)
  }

  throwIfAborted(signal)
  onProgress?.(100, 'rendering')
  const renderResult = await generateMosaicWithMetadata(
    mainImageGrid,
    request.sourceImages.map((sourceImage) => ({
      image: sourceImage.url,
      averageRgb: sourceImage.averageRgb,
      brightness: sourceImage.brightness,
      saturation: sourceImage.saturation,
      hue: sourceImage.hue,
    })),
    request.rgbWeights,
    request.outputSize,
    request.maxRepetitions,
    request.preferVariety,
    request.randomness,
    request.randomSource,
    request.brightnessWeight,
    request.saturationWeight,
    request.hueWeight,
    request.matchingMethod,
    request.cropPosition,
    request.rotationMode,
    request.renderOptions,
    request.useEverySourceImage,
    selections,
  )

  throwIfAborted(signal)
  onProgress?.(100, 'encoding')
  let dataUrl: string
  try {
    dataUrl = canvasToDataUrl(renderResult.canvas, request.export.format, request.export.quality, request.renderOptions.borderColor)
  } catch (error) {
    throw new MosaicGenerationError('Output encoding failed', 'encoding', error)
  }

  return {
    canvas: renderResult.canvas,
    dataUrl,
    filename: createExportFilename(request.export.projectName, request.export.format),
    estimatedBytes: estimateDataUrlBytes(dataUrl),
    width: renderResult.canvas.width,
    height: renderResult.canvas.height,
    metadata: renderResult.metadata,
  }
}

function selectTilesInWorker(
  request: MosaicWorkerRequest,
  onProgress?: (percentage: number) => void,
  signal?: AbortSignal,
): Promise<MosaicTileSelection[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mosaicWorker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => worker.terminate()
    const abort = () => {
      cleanup()
      reject(new DOMException('Mosaic generation cancelled', 'AbortError'))
    }

    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<MosaicWorkerResponse>) => {
      if (event.data.type === 'progress') {
        onProgress?.(Math.round((event.data.completed / event.data.total) * 100))
      } else if (event.data.type === 'complete') {
        signal?.removeEventListener('abort', abort)
        cleanup()
        resolve(event.data.selections)
      } else {
        signal?.removeEventListener('abort', abort)
        cleanup()
        reject(new Error(event.data.message))
      }
    }
    worker.onerror = (error) => {
      signal?.removeEventListener('abort', abort)
      cleanup()
      reject(error.error ?? new Error(error.message))
    }
    worker.postMessage(request)
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Mosaic generation cancelled', 'AbortError')
}

function validateGenerationRequest(request: MosaicGenerationRequest): void {
  if (!request.mainImageFile) throw new MosaicGenerationError('A main image is required', 'analyzing')
  if (request.sourceImages.length === 0) throw new MosaicGenerationError('At least one source image is required', 'matching')
  if (!Number.isInteger(request.grid.rows) || request.grid.rows < 1 || !Number.isInteger(request.grid.columns) || request.grid.columns < 1) {
    throw new MosaicGenerationError('Grid rows and columns must be positive integers', 'analyzing')
  }
  if (!Number.isFinite(request.outputSize.width) || !Number.isFinite(request.outputSize.height) || request.outputSize.width < 1 || request.outputSize.height < 1) {
    throw new MosaicGenerationError('Output dimensions must be positive numbers', 'rendering')
  }
}
