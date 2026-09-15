import type { AverageRgb } from './imageAnalysis'

export const MAX_SOURCE_IMAGES = 120
export type OutputResolutionPreset = 'original' | '1920' | '4k' | 'custom'
export type SourceImage = {
  url: string
  averageRgb: AverageRgb
  brightness: number
  saturation: number
  hue: number
}

export function rgbToHex(color: AverageRgb): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

export function getOutputSize(
  dimensions: { width: number; height: number },
  preset: OutputResolutionPreset,
  customLongEdge: number,
) {
  if (preset === 'original') return dimensions

  const longEdge = preset === '1920' ? 1920 : preset === '4k' ? 3840 : customLongEdge
  const aspectRatio = dimensions.width / dimensions.height

  return dimensions.width >= dimensions.height
    ? { width: Math.round(longEdge), height: Math.max(1, Math.round(longEdge / aspectRatio)) }
    : { width: Math.max(1, Math.round(longEdge * aspectRatio)), height: Math.round(longEdge) }
}

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed)

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
