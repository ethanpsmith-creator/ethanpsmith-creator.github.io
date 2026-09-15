import { analyzeImageGrid } from './gridAnalysis'
import {
  canvasToDataUrl,
  createExportFilename,
  estimateDataUrlBytes,
  type ExportFormat,
} from './export'
import { generateMosaic, type CropPosition, type MosaicRenderOptions, type RotationMode } from './mosaicRendering'
import type { MatchingMethod, RgbWeights } from './colorMatching'
import type { SourceImage } from './projectSettings'

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
  brightnessWeight: number
  saturationWeight: number
  hueWeight: number
  matchingMethod: MatchingMethod
  cropPosition: CropPosition
  rotationMode: RotationMode
  outputSize: { width: number; height: number }
  renderOptions: MosaicRenderOptions
  useEverySourceImage: boolean
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
}

export async function generateApplicationMosaic(
  request: MosaicGenerationRequest,
): Promise<MosaicGenerationResult> {
  const mainImageGrid = await analyzeImageGrid(request.mainImageFile, request.grid)
  const canvas = await generateMosaic({
    mainImageGrid,
    sourceImages: request.sourceImages.map((sourceImage) => ({
      image: sourceImage.url,
      averageRgb: sourceImage.averageRgb,
      brightness: sourceImage.brightness,
      saturation: sourceImage.saturation,
      hue: sourceImage.hue,
    })),
    rgbWeights: request.rgbWeights,
    outputSize: request.outputSize,
    maxRepetitions: request.maxRepetitions,
    preferVariety: request.preferVariety,
    randomness: request.randomness,
    randomSource: request.randomSource,
    brightnessWeight: request.brightnessWeight,
    saturationWeight: request.saturationWeight,
    hueWeight: request.hueWeight,
    matchingMethod: request.matchingMethod,
    cropPosition: request.cropPosition,
    rotationMode: request.rotationMode,
    renderOptions: request.renderOptions,
    useEverySourceImage: request.useEverySourceImage,
  })

  const dataUrl = canvasToDataUrl(
    canvas,
    request.export.format,
    request.export.quality,
    request.renderOptions.borderColor,
  )

  return {
    canvas,
    dataUrl,
    filename: createExportFilename(request.export.projectName, request.export.format),
    estimatedBytes: estimateDataUrlBytes(dataUrl),
    width: canvas.width,
    height: canvas.height,
  }
}
