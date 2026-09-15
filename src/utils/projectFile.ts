import type { ExportFormat } from './export'
import type { CropPosition, RotationMode } from './mosaicRendering'
import type { MatchingMethod, RgbWeights } from './colorMatching'
import type { OutputResolutionPreset, PaletteMode } from './projectSettings'
import type { AverageRgb } from './imageAnalysis'

export type MosaicProjectFile = {
  schemaVersion: 1
  projectName: string
  settings: {
    gridResolution: number
    customResolution: number
    rgbWeights: RgbWeights
    rgbWeightsEnabled: boolean
    brightnessWeight: number
    brightnessEnabled: boolean
    saturationWeight: number
    saturationEnabled: boolean
    hueWeight: number
    hueEnabled: boolean
    matchingMethod: MatchingMethod
    paletteMode: PaletteMode
    paletteColors: AverageRgb[]
    matchingMethodEnabled: boolean
    maxRepetitions: string
    repetitionEnabled: boolean
    customMaxRepetitions: number
    preferVariety: boolean
    useEverySourceImage: boolean
    randomness: number
    randomnessEnabled: boolean
    randomSeed: string
    cropPosition: CropPosition
    cropEnabled: boolean
    rotationMode: RotationMode
    rotationEnabled: boolean
    tileOpacity: number
    opacityEnabled: boolean
    adaptiveOpacity: boolean
    showTargetImage: boolean
    borderPercent: number
    borderColor: string
    overlap: number
    sharpening: number
    sharpeningEnabled: boolean
    outputResolutionPreset: OutputResolutionPreset
    customOutputLongEdge: number
    exportFormat: ExportFormat
    exportQuality: number
  }
}

export function createProjectFile(project: MosaicProjectFile): string {
  return JSON.stringify(project, null, 2)
}

export function parseProjectFile(json: string): MosaicProjectFile {
  const parsed: unknown = JSON.parse(json)
  if (!isProjectFile(parsed)) {
    throw new Error('This file is not a valid Mosaic Gallery project file')
  }
  return parsed
}

export function downloadProjectFile(project: MosaicProjectFile): void {
  const blob = new Blob([createProjectFile(project)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.projectName.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'mosaic-gallery'}.mosaic.json`
  link.click()
  URL.revokeObjectURL(url)
}

function isProjectFile(value: unknown): value is MosaicProjectFile {
  if (!value || typeof value !== 'object') return false
  const project = value as Partial<MosaicProjectFile>
  return project.schemaVersion === 1
    && typeof project.projectName === 'string'
    && Boolean(project.settings && typeof project.settings === 'object')
}
