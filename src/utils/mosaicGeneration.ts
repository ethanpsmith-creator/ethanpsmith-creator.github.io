import {
  DEFAULT_RGB_WEIGHTS,
  type RandomSource,
  type MatchingMethod,
  type RgbWeights,
  type SourceImageWithUsage,
  type SourceImageColor,
} from './colorMatching'
import { findBestSourceImage } from './tileSelection'
import type { GridCell } from './gridAnalysis'

export type MosaicOutputSize = {
  width: number
  height: number
}

export const DEFAULT_MOSAIC_OUTPUT_SIZE: MosaicOutputSize = {
  width: 1000,
  height: 1000,
}

export const DEFAULT_MAX_REPETITIONS = Number.POSITIVE_INFINITY
export type CropPosition = 'center' | 'top' | 'bottom' | 'left' | 'right'
export type RotationMode = 'none' | 'random' | '90' | '180' | '270' | 'random-90'
export type MosaicRenderOptions = {
  opacity?: number
  adaptiveOpacity?: boolean
  showTargetImage?: boolean
  targetImageUrl?: string
  borderPercent?: number
  borderColor?: string
  sharpening?: number
}

type LoadedSourceImage = {
  image: HTMLImageElement
  averageRgb: SourceImageColor<string>['averageRgb']
  brightness?: number
  saturation?: number
  hue?: number
  usageCount: number
}

export type GenerateMosaicOptions = {
  mainImageGrid: GridCell[]
  sourceImages: SourceImageColor<string>[]
  rgbWeights?: RgbWeights
  outputSize?: MosaicOutputSize
  maxRepetitions?: number
  preferVariety?: boolean
  randomness?: number
  randomSource?: RandomSource
  brightnessWeight?: number
  saturationWeight?: number
  hueWeight?: number
  matchingMethod?: MatchingMethod
  cropPosition?: CropPosition
  rotationMode?: RotationMode
  renderOptions?: MosaicRenderOptions
  useEverySourceImage?: boolean
}

/**
 * Matches every main-image cell to a source image and renders the result to Canvas.
 */
export async function generateMosaic(
  {
    mainImageGrid,
    sourceImages,
    rgbWeights = DEFAULT_RGB_WEIGHTS,
    outputSize = DEFAULT_MOSAIC_OUTPUT_SIZE,
    maxRepetitions = DEFAULT_MAX_REPETITIONS,
    preferVariety = false,
    randomness = 0,
    randomSource = Math.random,
    brightnessWeight = 0,
    saturationWeight = 0,
    hueWeight = 0,
    matchingMethod = 'rgb',
    cropPosition = 'center',
    rotationMode = 'none',
    renderOptions = {},
    useEverySourceImage = false,
  }: GenerateMosaicOptions,
): Promise<HTMLCanvasElement> {
  if (mainImageGrid.length === 0) {
    throw new Error('The main image grid cannot be empty')
  }

  if (sourceImages.length === 0) {
    throw new Error('At least one source image is required')
  }

  validateOutputSize(outputSize)
  validateMaxRepetitions(maxRepetitions)

  const rows = Math.max(...mainImageGrid.map((cell) => cell.row)) + 1
  const columns = Math.max(...mainImageGrid.map((cell) => cell.column)) + 1
  const canvas = document.createElement('canvas')
  canvas.width = outputSize.width
  canvas.height = outputSize.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  const loadedSources = await Promise.all(sourceImages.map(loadSourceImage))
  const borderInset = Math.min(outputSize.width, outputSize.height)
    * Math.max(0, Math.min(50, renderOptions.borderPercent ?? 0)) / 200
  const imageAreaWidth = outputSize.width - borderInset * 2
  const imageAreaHeight = outputSize.height - borderInset * 2
  if (borderInset > 0) {
    context.fillStyle = renderOptions.borderColor ?? '#000000'
    context.fillRect(0, 0, outputSize.width, outputSize.height)
  }
  if (renderOptions.showTargetImage && renderOptions.targetImageUrl) {
    const targetImage = await loadImageUrl(renderOptions.targetImageUrl)
    drawImageCover(context, targetImage, borderInset, borderInset, imageAreaWidth, imageAreaHeight, 'center', 0, 1)
  }
  const cellWidth = imageAreaWidth / columns
  const cellHeight = imageAreaHeight / rows

  for (const cell of mainImageGrid) {
    const availableSources = loadedSources.filter((source) => source.usageCount < maxRepetitions)
    const candidates = availableSources.length > 0 ? availableSources : loadedSources
    const closestMatch = findBestSourceImage(
      {
        ...cell.averageRgb,
        brightness: cell.brightness,
        saturation: cell.saturation,
        hue: cell.hue,
      },
      candidates as SourceImageWithUsage<HTMLImageElement>[],
      rgbWeights,
      preferVariety,
      randomness,
      randomSource,
      brightnessWeight,
      saturationWeight,
      hueWeight,
      matchingMethod,
      useEverySourceImage,
    )
    if (!closestMatch) continue

    const sourceIndex = loadedSources.findIndex((source) => source === closestMatch.sourceImage)
    loadedSources[sourceIndex].usageCount += 1
    const rotation = getRotationDegrees(rotationMode, randomSource)
    const adaptiveFactor = renderOptions.adaptiveOpacity
      ? Math.exp(-closestMatch.distance * 4)
      : 1
    const tileOpacity = Math.max(0, Math.min(1, renderOptions.opacity ?? 1)) * adaptiveFactor
    drawImageCover(context, closestMatch.sourceImage.image, borderInset + cell.column * cellWidth, borderInset + cell.row * cellHeight, cellWidth, cellHeight, cropPosition, rotation, tileOpacity)
  }

  applySharpening(context, canvas, renderOptions.sharpening ?? 0)

  return canvas
}

function loadSourceImage(sourceImage: SourceImageColor<string>): Promise<LoadedSourceImage> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      image,
      averageRgb: sourceImage.averageRgb,
      brightness: sourceImage.brightness,
      saturation: sourceImage.saturation,
      hue: sourceImage.hue,
      usageCount: 0,
    })
    image.onerror = () => reject(new Error(`Unable to load source image: ${sourceImage.image}`))
    image.src = sourceImage.image
  })
}

function loadImageUrl(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the target image'))
    image.src = imageUrl
  })
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  cropPosition: CropPosition,
  rotation: number,
  opacity: number,
): void {
  const targetAspectRatio = width / height
  const sourceAspectRatio = image.naturalWidth / image.naturalHeight
  const sourceWidth = sourceAspectRatio > targetAspectRatio
    ? image.naturalHeight * targetAspectRatio
    : image.naturalWidth
  const sourceHeight = sourceAspectRatio > targetAspectRatio
    ? image.naturalHeight
    : image.naturalWidth / targetAspectRatio
  const horizontalAnchor = cropPosition === 'left' ? 0 : cropPosition === 'right' ? 1 : 0.5
  const verticalAnchor = cropPosition === 'top' ? 0 : cropPosition === 'bottom' ? 1 : 0.5
  const sourceX = (image.naturalWidth - sourceWidth) * horizontalAnchor
  const sourceY = (image.naturalHeight - sourceHeight) * verticalAnchor

  const radians = rotation * Math.PI / 180
  const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  const coverScale = Math.max(width / rotatedWidth, height / rotatedHeight)

  context.save()
  context.globalAlpha = opacity
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.translate(x + width / 2, y + height / 2)
  context.rotate(radians)
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -width * coverScale / 2,
    -height * coverScale / 2,
    width * coverScale,
    height * coverScale,
  )
  context.restore()
}

function getRotationDegrees(mode: RotationMode, random: RandomSource): number {
  if (mode === 'random') return random() * 360
  if (mode === 'random-90') return Math.floor(random() * 4) * 90
  if (mode === '90') return 90
  if (mode === '180') return 180
  if (mode === '270') return 270
  return 0
}

function applySharpening(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sharpening: number,
): void {
  const amount = Math.max(0, Math.min(1, sharpening))
  if (amount === 0) return

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const sourcePixels = new Uint8ClampedArray(imageData.data)
  const { width, height } = canvas
  const neighborWeight = -amount
  const centerWeight = 1 + amount * 4

  const sample = (x: number, y: number, channel: number) => {
    const clampedX = Math.max(0, Math.min(width - 1, x))
    const clampedY = Math.max(0, Math.min(height - 1, y))
    return sourcePixels[(clampedY * width + clampedX) * 4 + channel]
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        imageData.data[pixelIndex + channel] = Math.max(0, Math.min(255,
          centerWeight * sample(x, y, channel)
          + neighborWeight * (
            sample(x - 1, y, channel)
            + sample(x + 1, y, channel)
            + sample(x, y - 1, channel)
            + sample(x, y + 1, channel)
          ),
        ))
      }
    }
  }

  context.putImageData(imageData, 0, 0)
}

function validateOutputSize(outputSize: MosaicOutputSize): void {
  if (!Number.isFinite(outputSize.width) || outputSize.width < 1) {
    throw new Error('Mosaic output width must be a positive number')
  }

  if (!Number.isFinite(outputSize.height) || outputSize.height < 1) {
    throw new Error('Mosaic output height must be a positive number')
  }
}

function validateMaxRepetitions(maxRepetitions: number): void {
  if (
    maxRepetitions !== Number.POSITIVE_INFINITY
    && (!Number.isInteger(maxRepetitions) || maxRepetitions < 1)
  ) {
    throw new Error('Maximum repetitions must be a positive integer')
  }
}
