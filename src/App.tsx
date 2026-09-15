import { useEffect, useRef, useState } from 'react'
import { analyzeImageDetails } from './utils/imageAnalysis'
import { findClosestSourceImage, type MatchingMethod } from './utils/colorMatching'
import { getImageDimensions, GRID_RESOLUTION_PRESETS } from './utils/gridAnalysis'
import { canvasToDataUrl, createExportFilename, downloadImage, estimateDataUrlBytes, formatFileSize, type ExportFormat } from './utils/export'
import { generateApplicationMosaic } from './utils/applicationApi'
import { isSupportedImageFile, SUPPORTED_IMAGE_ACCEPT } from './utils/imageFile'
import { type CropPosition, type MosaicGenerationMetadata, type RotationMode } from './utils/mosaicRendering'
import { rgbToHsv } from './utils/colorConversion'
import { createSeededRandom, getOutputSize, MAX_SOURCE_IMAGES, rgbToHex, type OutputResolutionPreset, type PaletteMode, type SourceImage } from './utils/projectSettings'
import { downloadProjectFile, parseProjectFile, type MosaicProjectFile } from './utils/projectFile'
import type { AverageRgb } from './utils/imageAnalysis'
import './App.css'

const RYB_WHEEL_COLORS: AverageRgb[] = [
  { red: 215, green: 35, blue: 39 }, { red: 230, green: 105, blue: 35 },
  { red: 242, green: 190, blue: 46 }, { red: 143, green: 176, blue: 55 },
  { red: 55, green: 137, blue: 88 }, { red: 35, green: 155, blue: 166 },
  { red: 48, green: 103, blue: 178 }, { red: 78, green: 65, blue: 157 },
  { red: 133, green: 71, blue: 155 }, { red: 192, green: 66, blue: 126 },
  { red: 210, green: 72, blue: 75 }, { red: 226, green: 135, blue: 49 },
]

function App() {
  type ComparisonMode = 'original' | 'mosaic' | 'blend'
  type PresetName = 'accurate' | 'colour-focus' | 'brightness-focus' | 'artistic' | 'random' | 'minimal'
  const [mainImageFile, setMainImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [mainImageDimensions, setMainImageDimensions] = useState({ width: 1, height: 1 })
  const [mainImageAverageRgb, setMainImageAverageRgb] = useState<AverageRgb | null>(null)
  const [mainImageBrightness, setMainImageBrightness] = useState(0)
  const [mainImageSaturation, setMainImageSaturation] = useState(0)
  const [mainImageHue, setMainImageHue] = useState(0)
  const [prominentColors, setProminentColors] = useState<AverageRgb[]>([])
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([])
  const [gridResolution, setGridResolution] = useState(50)
  const [customResolution, setCustomResolution] = useState(50)
  const [rgbWeights, setRgbWeights] = useState({ red: 100, green: 100, blue: 100 })
  const [rgbWeightsEnabled, setRgbWeightsEnabled] = useState(true)
  const [brightnessWeight, setBrightnessWeight] = useState(0)
  const [brightnessEnabled, setBrightnessEnabled] = useState(false)
  const [saturationWeight, setSaturationWeight] = useState(0)
  const [saturationEnabled, setSaturationEnabled] = useState(false)
  const [hueWeight, setHueWeight] = useState(0)
  const [hueEnabled, setHueEnabled] = useState(false)
  const [matchingMethod, setMatchingMethod] = useState<MatchingMethod>('rgb')
  const [activePreset, setActivePreset] = useState<PresetName | ''>('')
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('none')
  const [paletteColors, setPaletteColors] = useState<AverageRgb[]>([])
  const [matchingMethodEnabled, setMatchingMethodEnabled] = useState(true)
  const [cropPosition, setCropPosition] = useState<CropPosition>('center')
  const [cropEnabled, setCropEnabled] = useState(false)
  const [rotationMode, setRotationMode] = useState<RotationMode>('none')
  const [rotationEnabled, setRotationEnabled] = useState(false)
  const [tileOpacity, setTileOpacity] = useState(100)
  const [opacityEnabled, setOpacityEnabled] = useState(false)
  const [sharpening, setSharpening] = useState(0)
  const [sharpeningEnabled, setSharpeningEnabled] = useState(false)
  const [adaptiveOpacity, setAdaptiveOpacity] = useState(false)
  const [showTargetImage, setShowTargetImage] = useState(false)
  const [borderPercent, setBorderPercent] = useState(0)
  const [borderColor, setBorderColor] = useState('#000000')
  const [overlap, setOverlap] = useState(0)
  const [repetitionPreset, setRepetitionPreset] = useState('unlimited')
  const [repetitionEnabled, setRepetitionEnabled] = useState(false)
  const [customMaxRepetitions, setCustomMaxRepetitions] = useState(10)
  const [preferVariety, setPreferVariety] = useState(false)
  const [useEverySourceImage, setUseEverySourceImage] = useState(false)
  const [randomness, setRandomness] = useState(0)
  const [randomnessEnabled, setRandomnessEnabled] = useState(false)
  const [randomSeed, setRandomSeed] = useState('mosaic-gallery')
  const [projectName, setProjectName] = useState('Mosaic Gallery')
  const [outputResolutionPreset, setOutputResolutionPreset] = useState<OutputResolutionPreset>('original')
  const [customOutputLongEdge, setCustomOutputLongEdge] = useState(1920)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportQuality, setExportQuality] = useState(90)
  const [generatedMosaicUrl, setGeneratedMosaicUrl] = useState<string | null>(null)
  const [generationMetadata, setGenerationMetadata] = useState<MosaicGenerationMetadata | null>(null)
  const [selectedUsageSource, setSelectedUsageSource] = useState<string | null>(null)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('mosaic')
  const [overlayPercent, setOverlayPercent] = useState(50)
  const [estimatedFileSize, setEstimatedFileSize] = useState<number | null>(null)
  const generatedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [generatedFilename, setGeneratedFilename] = useState('mosaic-gallery.png')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [projectNotice, setProjectNotice] = useState<string | null>(null)
  const [activeToolbarTab, setActiveToolbarTab] = useState<string | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [randomSeedCounter, setRandomSeedCounter] = useState(0)
  const sourceImagesRef = useRef<SourceImage[]>([])
  const interactionVersionRef = useRef(0)
  const generationAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  useEffect(() => {
    return () => {
      sourceImagesRef.current.forEach((sourceImage) => URL.revokeObjectURL(sourceImage.url))
    }
  }, [])

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!isSupportedImageFile(file)) {
      setGenerationError('Please choose a PNG, JPG, JPEG, or SVG image.')
      return
    }

    const interactionVersion = ++interactionVersionRef.current
    const nextImageUrl = URL.createObjectURL(file)
    setMainImageFile(file)
    setImageUrl(nextImageUrl)
    let analysis
    let dimensions
    try {
      analysis = await analyzeImageDetails(file)
      dimensions = await getImageDimensions(file)
    } catch (error) {
      URL.revokeObjectURL(nextImageUrl)
      setGenerationError(error instanceof Error ? error.message : 'The main image could not be analyzed')
      return
    }
    if (interactionVersion !== interactionVersionRef.current) {
      URL.revokeObjectURL(nextImageUrl)
      return
    }

    setMainImageAverageRgb(analysis.averageRgb)
    setMainImageBrightness(analysis.brightness)
    setMainImageSaturation(analysis.saturation)
    setMainImageHue(analysis.hue)
    setProminentColors(analysis.prominentColors)
    setMainImageDimensions(dimensions)
    setGeneratedMosaicUrl(null)
    setGenerationMetadata(null)
    setSelectedUsageSource(null)
    setGenerationError(null)
  }

  async function handleSourceImagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    const remainingSlots = MAX_SOURCE_IMAGES - sourceImages.length
    const supportedFiles = files.filter(isSupportedImageFile)

    if (supportedFiles.length === 0) {
      setGenerationError('Please choose PNG, JPG, JPEG, or SVG source images.')
      return
    }

    const interactionVersion = ++interactionVersionRef.current
    const batchFiles = supportedFiles.slice(0, remainingSlots)
    const batchUrls = batchFiles.map((file) => URL.createObjectURL(file))
    let newImages
    try {
      newImages = await Promise.all(
        batchFiles.map(async (file, index) => ({
          url: batchUrls[index],
          ...await analyzeImageDetails(file),
        })),
      )
    } catch (error) {
      batchUrls.forEach((url) => URL.revokeObjectURL(url))
      setGenerationError(error instanceof Error ? error.message : 'One or more source images could not be analyzed')
      return
    }
    if (interactionVersion !== interactionVersionRef.current) {
      newImages.forEach((sourceImage) => URL.revokeObjectURL(sourceImage.url))
      return
    }
    const nextImages = [...sourceImages, ...newImages]

    sourceImagesRef.current = nextImages
    setSourceImages(nextImages)
    setGeneratedMosaicUrl(null)
    setGenerationMetadata(null)
    setSelectedUsageSource(null)
    setGenerationError(null)
    event.target.value = ''
  }

  async function handleGenerateMosaic() {
    if (!mainImageFile || sourceImages.length === 0) return

    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationError(null)
    const abortController = new AbortController()
    generationAbortRef.current = abortController

    try {
      const result = await generateApplicationMosaic({
        mainImageFile,
        sourceImages,
        grid: { rows: gridRows, columns: gridColumns },
        rgbWeights: {
          red: rgbWeightsEnabled ? rgbWeights.red / 100 : 1,
          green: rgbWeightsEnabled ? rgbWeights.green / 100 : 1,
          blue: rgbWeightsEnabled ? rgbWeights.blue / 100 : 1,
        },
        outputSize,
        maxRepetitions: repetitionEnabled ? maxRepetitions : Number.POSITIVE_INFINITY,
        preferVariety,
        randomness: randomnessEnabled ? randomness / 100 : 0,
        randomSource: createSeededRandom(randomSeed),
        randomSeed,
        brightnessWeight: brightnessEnabled ? brightnessWeight / 100 : 0,
        saturationWeight: saturationEnabled ? saturationWeight / 100 : 0,
        hueWeight: hueEnabled ? hueWeight / 100 : 0,
        matchingMethod: matchingMethodEnabled ? matchingMethod : 'rgb',
        cropPosition: cropEnabled ? cropPosition : 'center',
        rotationMode: rotationEnabled ? rotationMode : 'none',
        renderOptions: {
          opacity: opacityEnabled ? tileOpacity / 100 : 1,
          adaptiveOpacity,
          showTargetImage,
          targetImageUrl: imageUrl ?? undefined,
          borderPercent,
          borderColor,
          sharpening: sharpeningEnabled ? sharpening / 100 : 0,
        },
        useEverySourceImage,
        paletteHues: paletteColors.map((color) => rgbToHsv(color.red, color.green, color.blue).hue),
        paletteColors,
        export: {
          format: exportFormat,
          quality: exportQuality / 100,
          projectName,
        },
      }, setGenerationProgress, abortController.signal)

      setGeneratedMosaicUrl(result.dataUrl)
      generatedCanvasRef.current = result.canvas
      setGenerationMetadata(result.metadata)
      setSelectedUsageSource(null)
      setEstimatedFileSize(result.estimatedBytes)
      setGeneratedFilename(result.filename)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setGenerationError('Mosaic generation cancelled')
      } else {
        setGenerationError(error instanceof Error ? error.message : 'Mosaic generation failed')
      }
    } finally {
      setIsGenerating(false)
      generationAbortRef.current = null
    }
  }

  function handleCancelGeneration() {
    generationAbortRef.current?.abort()
  }

  function handleDownloadMosaic() {
    if (!generatedMosaicUrl) return

    downloadImage(generatedMosaicUrl, generatedFilename)
  }

  function updateExportEncoding(format: ExportFormat, quality: number) {
    setExportFormat(format)
    setExportQuality(quality)
    if (generatedCanvasRef.current && generatedMosaicUrl) {
      const dataUrl = canvasToDataUrl(generatedCanvasRef.current, format, quality / 100, borderColor)
      setGeneratedMosaicUrl(dataUrl)
      setEstimatedFileSize(estimateDataUrlBytes(dataUrl))
      setGeneratedFilename(createExportFilename(projectName, format))
    }
  }

  const selectedResolution = gridResolution === -1 ? customResolution : gridResolution
  const outputSize = getOutputSize(mainImageDimensions, outputResolutionPreset, customOutputLongEdge)
  const imageAspectRatio = mainImageDimensions.width / mainImageDimensions.height
  const gridColumns = selectedResolution
  const gridRows = Math.max(1, Math.round(gridColumns / imageAspectRatio))
  const tileCount = gridColumns * gridRows
  const tiles = Array.from({ length: tileCount }, (_, index) => index)
  const showResolutionWarning = tileCount >= 5000
  const maxRepetitions = repetitionPreset === 'unlimited'
    ? Number.POSITIVE_INFINITY
    : repetitionPreset === 'custom'
      ? customMaxRepetitions
      : Number(repetitionPreset)
  const closestSourceImage = mainImageAverageRgb
    ? findClosestSourceImage(
        { ...mainImageAverageRgb, brightness: mainImageBrightness, saturation: mainImageSaturation, hue: mainImageHue },
        sourceImages.map((sourceImage) => ({
          image: sourceImage.url,
          averageRgb: sourceImage.averageRgb,
          brightness: sourceImage.brightness,
        })),
        {
          red: rgbWeightsEnabled ? rgbWeights.red / 100 : 1,
          green: rgbWeightsEnabled ? rgbWeights.green / 100 : 1,
          blue: rgbWeightsEnabled ? rgbWeights.blue / 100 : 1,
        },
        undefined,
        brightnessEnabled ? brightnessWeight / 100 : 0,
        saturationEnabled ? saturationWeight / 100 : 0,
        hueEnabled ? hueWeight / 100 : 0,
        matchingMethodEnabled ? matchingMethod : 'rgb',
      )
    : undefined

  function handleWeightChange(channel: 'red' | 'green' | 'blue', value: string) {
    setRgbWeights((currentWeights) => ({
      ...currentWeights,
      [channel]: Number(value),
    }))
    setGeneratedMosaicUrl(null)
    setGenerationError(null)
  }

  function handleResolutionChange(value: string) {
    const nextResolution = Number(value)
    setGridResolution(nextResolution)
    setGeneratedMosaicUrl(null)
  }

  function setBorderPreset(color: string) {
    setBorderColor(color)
    setGeneratedMosaicUrl(null)
  }

  function setPaletteSelectionMode(mode: PaletteMode) {
    setPaletteMode(mode)
    const requiredColors = mode === 'duo' ? 2 : mode === 'tritone' ? 3 : 0
    setPaletteColors(RYB_WHEEL_COLORS.slice(0, requiredColors))
    setGeneratedMosaicUrl(null)
  }

  function togglePaletteColor(color: AverageRgb) {
    const colorKey = rgbToHex(color)
    const selected = paletteColors.some((selectedColor) => rgbToHex(selectedColor) === colorKey)
    if (selected) {
      setPaletteColors(paletteColors.filter((selectedColor) => rgbToHex(selectedColor) !== colorKey))
    } else {
      const limit = paletteMode === 'duo' ? 2 : 3
      if (paletteColors.length >= limit) return
      setPaletteColors([...paletteColors, color])
    }
    setGeneratedMosaicUrl(null)
  }

  function applyPreset(preset: PresetName) {
    setActivePreset(preset)
    setGeneratedMosaicUrl(null)
    setGenerationMetadata(null)

    if (preset === 'accurate') {
      setRgbWeights({ red: 100, green: 100, blue: 100 }); setRgbWeightsEnabled(true)
      setBrightnessEnabled(false); setSaturationEnabled(false); setHueEnabled(false)
      setMatchingMethod('rgb'); setMatchingMethodEnabled(true)
      setRepetitionPreset('unlimited'); setRepetitionEnabled(false); setPreferVariety(false); setUseEverySourceImage(false)
      setRandomness(0); setRandomnessEnabled(false); setCropEnabled(false); setRotationEnabled(false)
      setOpacityEnabled(false); setAdaptiveOpacity(false); setShowTargetImage(false); setSharpeningEnabled(false); setBorderPercent(0)
      setPaletteSelectionMode('none')
    } else if (preset === 'colour-focus') {
      setRgbWeights({ red: 130, green: 100, blue: 130 }); setRgbWeightsEnabled(true)
      setBrightnessEnabled(false); setSaturationWeight(150); setSaturationEnabled(true); setHueWeight(140); setHueEnabled(true)
      setMatchingMethod('lab'); setMatchingMethodEnabled(true)
      setRepetitionPreset('unlimited'); setRepetitionEnabled(false); setPreferVariety(false); setUseEverySourceImage(false)
      setRandomness(0); setRandomnessEnabled(false); setCropEnabled(false); setRotationEnabled(false)
      setPaletteSelectionMode('none')
    } else if (preset === 'brightness-focus') {
      setRgbWeights({ red: 80, green: 80, blue: 80 }); setRgbWeightsEnabled(true)
      setBrightnessWeight(180); setBrightnessEnabled(true); setSaturationEnabled(false); setHueEnabled(false)
      setMatchingMethod('rgb'); setMatchingMethodEnabled(true)
      setRepetitionPreset('unlimited'); setRepetitionEnabled(false); setPreferVariety(false); setUseEverySourceImage(false)
      setRandomness(0); setRandomnessEnabled(false); setCropEnabled(false); setRotationEnabled(false)
      setPaletteSelectionMode('none')
    } else if (preset === 'artistic') {
      setRgbWeights({ red: 100, green: 120, blue: 100 }); setRgbWeightsEnabled(true)
      setBrightnessWeight(80); setBrightnessEnabled(true); setSaturationWeight(120); setSaturationEnabled(true); setHueWeight(100); setHueEnabled(true)
      setMatchingMethod('hsl'); setMatchingMethodEnabled(true)
      setRepetitionPreset('5'); setRepetitionEnabled(true); setPreferVariety(true); setUseEverySourceImage(true)
      setRandomness(25); setRandomnessEnabled(true); setCropEnabled(true); setCropPosition('center'); setRotationEnabled(true); setRotationMode('random-90')
      setOpacityEnabled(true); setTileOpacity(85); setAdaptiveOpacity(true); setSharpeningEnabled(true); setSharpening(20); setBorderPercent(4)
      setPaletteSelectionMode('tritone')
    } else if (preset === 'random') {
      setRgbWeights({ red: 100, green: 100, blue: 100 }); setRgbWeightsEnabled(true)
      setBrightnessEnabled(false); setSaturationEnabled(false); setHueEnabled(false); setMatchingMethod('rgb'); setMatchingMethodEnabled(true)
      setRepetitionPreset('10'); setRepetitionEnabled(true); setPreferVariety(true); setUseEverySourceImage(true)
      setRandomness(70); setRandomnessEnabled(true); setRotationEnabled(true); setRotationMode('random'); setCropEnabled(false)
      setPaletteSelectionMode('duo')
    } else {
      setRgbWeights({ red: 100, green: 100, blue: 100 }); setRgbWeightsEnabled(true)
      setBrightnessEnabled(false); setSaturationEnabled(false); setHueEnabled(false); setMatchingMethod('rgb'); setMatchingMethodEnabled(true)
      setRepetitionPreset('unlimited'); setRepetitionEnabled(false); setPreferVariety(false); setUseEverySourceImage(false)
      setRandomness(0); setRandomnessEnabled(false); setCropEnabled(false); setRotationEnabled(false); setOpacityEnabled(false)
      setAdaptiveOpacity(false); setShowTargetImage(false); setSharpeningEnabled(false); setBorderPercent(0)
      setPaletteSelectionMode('none')
    }
  }

  function focusWorkspace(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setActiveToolbarTab(null)
  }

  function randomizeSettings() {
    const nextSeed = randomSeedCounter + 1
    setRandomSeedCounter(nextSeed)
    setRandomnessEnabled(true)
    setRandomness(35)
    setRandomSeed(`lab-${nextSeed}`)
    setGeneratedMosaicUrl(null)
    setGenerationError(null)
    setActiveToolbarTab(null)
  }

  function setNewSeed() {
    const nextSeed = randomSeedCounter + 1
    setRandomSeedCounter(nextSeed)
    setRandomSeed(`lab-${nextSeed}`)
    setGeneratedMosaicUrl(null)
    setActiveToolbarTab(null)
  }

  function createProjectSnapshot(): MosaicProjectFile {
    return {
      schemaVersion: 1,
      projectName,
      settings: {
        gridResolution,
        customResolution,
        rgbWeights,
        rgbWeightsEnabled,
        brightnessWeight,
        brightnessEnabled,
        saturationWeight,
        saturationEnabled,
        hueWeight,
        hueEnabled,
        matchingMethod,
        paletteMode,
        paletteColors,
        matchingMethodEnabled,
        maxRepetitions: repetitionPreset,
        repetitionEnabled,
        customMaxRepetitions,
        preferVariety,
        useEverySourceImage,
        randomness,
        randomnessEnabled,
        randomSeed,
        cropPosition,
        cropEnabled,
        rotationMode,
        rotationEnabled,
        tileOpacity,
        opacityEnabled,
        adaptiveOpacity,
        showTargetImage,
        borderPercent,
        borderColor,
        overlap,
        sharpening,
        sharpeningEnabled,
        outputResolutionPreset,
        customOutputLongEdge,
        exportFormat,
        exportQuality,
      },
    }
  }

  function handleSaveProject() {
    downloadProjectFile(createProjectSnapshot())
    setActiveToolbarTab(null)
  }

  async function handleProjectFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const project = parseProjectFile(await file.text())
      const settings = project.settings
      setProjectName(project.projectName)
      setGridResolution(settings.gridResolution)
      setCustomResolution(settings.customResolution)
      setRgbWeights(settings.rgbWeights)
      setRgbWeightsEnabled(settings.rgbWeightsEnabled)
      setBrightnessWeight(settings.brightnessWeight)
      setBrightnessEnabled(settings.brightnessEnabled)
      setSaturationWeight(settings.saturationWeight)
      setSaturationEnabled(settings.saturationEnabled)
      setHueWeight(settings.hueWeight)
      setHueEnabled(settings.hueEnabled)
      setMatchingMethod(settings.matchingMethod)
      setPaletteMode(settings.paletteMode ?? 'none')
      setPaletteColors(settings.paletteColors ?? [])
      setMatchingMethodEnabled(settings.matchingMethodEnabled)
      setRepetitionPreset(settings.maxRepetitions)
      setRepetitionEnabled(settings.repetitionEnabled)
      setCustomMaxRepetitions(settings.customMaxRepetitions)
      setPreferVariety(settings.preferVariety)
      setUseEverySourceImage(settings.useEverySourceImage)
      setRandomness(settings.randomness)
      setRandomnessEnabled(settings.randomnessEnabled)
      setRandomSeed(settings.randomSeed)
      setCropPosition(settings.cropPosition)
      setCropEnabled(settings.cropEnabled)
      setRotationMode(settings.rotationMode)
      setRotationEnabled(settings.rotationEnabled)
      setTileOpacity(settings.tileOpacity)
      setOpacityEnabled(settings.opacityEnabled)
      setAdaptiveOpacity(settings.adaptiveOpacity)
      setShowTargetImage(settings.showTargetImage)
      setBorderPercent(settings.borderPercent)
      setBorderColor(settings.borderColor)
      setOverlap(settings.overlap)
      setSharpening(settings.sharpening)
      setSharpeningEnabled(settings.sharpeningEnabled)
      setOutputResolutionPreset(settings.outputResolutionPreset)
      setCustomOutputLongEdge(settings.customOutputLongEdge)
      setExportFormat(settings.exportFormat)
      setExportQuality(settings.exportQuality)
      sourceImagesRef.current.forEach((sourceImage) => URL.revokeObjectURL(sourceImage.url))
      sourceImagesRef.current = []
      setSourceImages([])
      setMainImageFile(null)
      setImageUrl(null)
      generatedCanvasRef.current = null
      setGeneratedMosaicUrl(null)
      setComparisonMode('mosaic')
      setGenerationMetadata(null)
      setEstimatedFileSize(null)
      setProjectNotice('Project settings loaded. Reselect the main image and source images to generate this project.')
      setActiveToolbarTab(null)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'The project file could not be loaded')
    }
  }

  const toolbarMenus: Record<string, Array<{ label: string; action: () => void; disabled?: boolean }>> = {
    FILE: [
      { label: 'Import main image', action: () => document.getElementById('main-image-input')?.click() },
      { label: 'Import source fragments', action: () => document.getElementById('source-images-input')?.click() },
      { label: 'Save project JSON', action: handleSaveProject },
      { label: 'Load project JSON', action: () => document.getElementById('project-file-input')?.click() },
    ],
    EDIT: [
      { label: 'Clear generated mosaic', action: () => { setGeneratedMosaicUrl(null); setEstimatedFileSize(null) }, disabled: !generatedMosaicUrl },
      { label: 'Reset optional settings', action: () => { setBrightnessEnabled(false); setSaturationEnabled(false); setHueEnabled(false); setRandomnessEnabled(false); setGeneratedMosaicUrl(null); setActiveToolbarTab(null) } },
    ],
    VIEW: [
      { label: 'Show image field', action: () => focusWorkspace('image-field') },
      { label: 'Show output panel', action: () => focusWorkspace('final-output') },
    ],
    TOOLS: [
      { label: 'Open control lab', action: () => focusWorkspace('control-lab') },
      { label: 'Use every source image', action: () => { setUseEverySourceImage(true); setActiveToolbarTab(null) } },
    ],
    RANDOMIZE: [
      { label: 'Randomize selection', action: randomizeSettings },
      { label: 'New seed only', action: setNewSeed },
    ],
    EXPORT: [
      { label: `Download ${exportFormat.toUpperCase()}`, action: handleDownloadMosaic, disabled: !generatedMosaicUrl },
      { label: 'Open export controls', action: () => focusWorkspace('export-controls') },
    ],
    INFO: [
      { label: 'Instagram: rivers_of_ash', action: () => window.open('https://www.instagram.com/rivers_of_ash/', '_blank', 'noopener,noreferrer') },
      { label: 'About Mosaic Gallery', action: () => { setShowAbout(true); setActiveToolbarTab(null) } },
    ],
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Mosaic Gallery home">
          <span className="wordmark-mark">mg</span>
          mosaic gallery
        </a>
        <div className="topbar-meta">
          <span className="status-pill">local processing</span>
          <span className="version-label">v1.0</span>
        </div>
      </header>

      <nav className="retro-toolbar" aria-label="Application toolbar">
        {Object.keys(toolbarMenus).map((tab) => (
          <div className="toolbar-menu" key={tab}>
            <button
              className={`toolbar-tab ${activeToolbarTab === tab ? 'active' : ''}`}
              type="button"
              aria-expanded={activeToolbarTab === tab}
              onClick={() => setActiveToolbarTab(activeToolbarTab === tab ? null : tab)}
            >
              {tab}
            </button>
            {activeToolbarTab === tab && (
              <div className="toolbar-dropdown">
                {toolbarMenus[tab].map((item) => (
                  <button key={item.label} type="button" disabled={item.disabled} onClick={item.action}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <span className="toolbar-spacer" />
        <span className="toolbar-readout">LOCAL / CLIENT-SIDE</span>
      </nav>

      <div className="system-strip">
        <span>IMAGE FIELD: {imageUrl ? 'READY' : 'EMPTY'}</span>
        <span>SOURCES: {sourceImages.length} / {MAX_SOURCE_IMAGES}</span>
        <span>TILES: {tileCount.toLocaleString()}</span>
        <span>GRID: {gridColumns} × {gridRows}</span>
        <span className="system-strip-end">MOSAIC LAB // 2004</span>
      </div>

      <input
        id="project-file-input"
        className="project-file-input"
        type="file"
        accept="application/json,.json,.mosaic.json"
        onChange={handleProjectFileChange}
      />
      {projectNotice && <div className="project-notice">PROJECT LOADED: {projectNotice}</div>}
      {showAbout && (
        <section className="about-panel" aria-label="About Mosaic Gallery">
          <div className="about-panel-heading">
            <strong>ABOUT / MOSAIC GALLERY</strong>
            <button type="button" onClick={() => setShowAbout(false)}>CLOSE [X]</button>
          </div>
          <p>
            Hi! this is an idea i had, its a photo mossaic that allows you to upload up to 120 source images ranging from .png, .jpeg, jpg, and .webp, into one main photo! ive done my best to include as many feutures as possible into this website/tool, reach out to me on my instagram if you have any other recommendations, or at my email @ethan.psmith@iclpud.com. a little bit of background on me, my name is Ethan smith, as im creating this website I'm a university student, who loves phtography and all the arts for that matter, through my countless hours of doomscrolling on social media i found myself getting more immersed in a feed filled with art. and the idea recently came by me that we see so many cool ways of expressing art, memories, nostalgia, and moments; the idea to use more than one moment to capture a larger picture stuck out to me and i built this website! i hope you make cool stuff with this tool! its open source witha creative commons 0 license, @ me on instagram if you want to share!
          </p>
          <a href="https://www.instagram.com/rivers_of_ash/" target="_blank" rel="noreferrer">instagram.com/rivers_of_ash</a>
        </section>
      )}

      <section className="intro">
        <p className="eyebrow">IMAGE PROCESSING / 01</p>
        <h1>Build a mosaic from your own visual library.</h1>
        <p className="intro-copy">
          Match every region of a main image to the closest source photograph.
          Everything runs locally in your browser.
        </p>
      </section>

      <section className="workspace" aria-label="Mosaic workspace">
        <aside className="source-archive">
          <div className="archive-heading">
            <div>
              <p className="eyebrow">SOURCE ARCHIVE</p>
              <h2>Contact sheet</h2>
            </div>
            <output>{sourceImages.length} / {MAX_SOURCE_IMAGES}</output>
          </div>
          <label className="archive-dropzone">
            <span>+</span>
            <strong>Import fragments</strong>
            <small>Drop or browse image files</small>
            <input
              id="source-images-input"
              type="file"
              accept={SUPPORTED_IMAGE_ACCEPT}
              multiple
              onChange={handleSourceImagesChange}
            />
          </label>
          <div className="archive-count">{sourceImages.length.toString().padStart(2, '0')} / {MAX_SOURCE_IMAGES} SOURCE FRAGMENTS</div>
          {sourceImages.length > 0 ? (
            <div className="source-images-grid">
              {sourceImages.map((sourceImage, index) => (
                <div className="source-image-card" key={sourceImage.url}>
                  <span className="source-index">{(index + 1).toString().padStart(2, '0')}</span>
                  <img src={sourceImage.url} alt={`Source image ${index + 1}`} />
                  <span className="source-image-rgb">{sourceImage.averageRgb.red} / {sourceImage.averageRgb.green} / {sourceImage.averageRgb.blue}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="archive-empty">NO SOURCE FIELD<br /><span>Awaiting fragments</span></div>
          )}
        </aside>
        <div className="preview-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">INPUT / MAIN IMAGE</p>
              <h2>{imageUrl ? 'Source composition' : 'Ready for an image'}</h2>
            </div>
            <span className="panel-index">01</span>
          </div>

          <div
            className={`mosaic-preview ${imageUrl ? 'has-image' : ''}`}
            style={{
              '--grid-columns': gridColumns,
              '--grid-rows': gridRows,
            } as React.CSSProperties}
          >
            {imageUrl ? (
              tiles.map((tile) => (
                <div
                  className="mosaic-tile"
                  key={tile}
                  style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundPosition: `${(tile % gridColumns) * (100 / (gridColumns - 1 || 1))}% ${Math.floor(tile / gridColumns) * (100 / (gridRows - 1 || 1))}%`,
                  }}
                />
              ))
            ) : (
              <div className="empty-preview">
                <span className="empty-icon">+</span>
                <strong>Drop in your main image</strong>
                <span>The selected grid will be previewed here</span>
              </div>
            )}
          </div>
          <div className="stage-footer">
            <span>{imageUrl ? 'Image loaded locally' : 'No image selected'}</span>
            <span>{tileCount.toLocaleString()} cells</span>
          </div>
        </div>

        <aside id="control-lab" className="controls-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONTROL ROOM / 02</p>
              <h2>Processing setup</h2>
            </div>
            <span className="panel-index">02</span>
          </div>

          <label className="preset-control" htmlFor="mosaic-preset">
            <span>
              <strong>Generation preset</strong>
              <small>Applies a starting configuration; every control stays editable.</small>
            </span>
            <select
              id="mosaic-preset"
              value={activePreset}
              onChange={(event) => event.target.value && applyPreset(event.target.value as PresetName)}
            >
              <option value="">Custom / current</option>
              <option value="accurate">Accurate</option>
              <option value="colour-focus">Colour Focus</option>
              <option value="brightness-focus">Brightness Focus</option>
              <option value="artistic">Artistic</option>
              <option value="random">Random</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>

          <div className="palette-control">
            <span>
              <strong>Colour palette filter</strong>
              <small>Constrain sources to a RYB-style two or three colour harmony.</small>
            </span>
            <select
              id="palette-mode"
              value={paletteMode}
              onChange={(event) => setPaletteSelectionMode(event.target.value as PaletteMode)}
            >
              <option value="none">None</option>
              <option value="duo">Duo · 2 colours</option>
              <option value="tritone">Tritone · 3 colours</option>
            </select>
            {paletteMode !== 'none' && (
              <div className="ryb-picker" role="group" aria-label="RYB colour wheel">
                <div className="ryb-wheel">
                  {RYB_WHEEL_COLORS.map((color, index) => {
                    const selected = paletteColors.some((selectedColor) => rgbToHex(selectedColor) === rgbToHex(color))
                    return (
                      <button
                        className={`ryb-swatch ${selected ? 'selected' : ''}`}
                        key={rgbToHex(color)}
                        type="button"
                        title={`RYB colour ${index + 1}`}
                        style={{ '--wheel-angle': `${index * 30}deg`, backgroundColor: rgbToHex(color) } as React.CSSProperties}
                        onClick={() => togglePaletteColor(color)}
                      />
                    )
                  })}
                  <span className="ryb-wheel-label">RYB<br />{paletteColors.length}/{paletteMode === 'duo' ? 2 : 3}</span>
                </div>
                <small>Select exactly {paletteMode === 'duo' ? 'two' : 'three'} colours. Selected hues remap the main image for matching.</small>
              </div>
            )}
          </div>

          <label className="upload-zone">
            <span className="upload-icon">↑</span>
            <span>
              <strong>{imageUrl ? 'Replace photo' : 'Add a photo'}</strong>
              <small>JPG, PNG, or WebP</small>
            </span>
            <input id="main-image-input" type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={handleImageChange} />
          </label>

          {imageUrl && (
            <div className="main-image-preview">
              <img src={imageUrl} alt="Selected main image" />
              <span>
                Selected main image
                {closestSourceImage && <small>Closest source matched below</small>}
              </span>
            </div>
          )}

          <label className="repetition-control" htmlFor="max-repetitions">
            <span>
              <strong>Maximum repetitions</strong>
              <small>Maximum uses per source image</small>
            </span>
            <input className="feature-toggle-input" type="checkbox" checked={repetitionEnabled} onChange={(event) => setRepetitionEnabled(event.target.checked)} aria-label="Enable maximum repetitions" />
            <select
              id="max-repetitions"
              value={repetitionPreset}
              disabled={!repetitionEnabled}
              onChange={(event) => {
                setRepetitionPreset(event.target.value)
                setGeneratedMosaicUrl(null)
                setComparisonMode('mosaic')
                setGenerationMetadata(null)
              }}
            >
              <option value="unlimited">Unlimited</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="5">5×</option>
              <option value="10">10×</option>
              <option value="custom">Custom</option>
            </select>
            {repetitionPreset === 'custom' && (
              <input
                className="custom-repetition-input"
                type="number"
                min="1"
                max="10000"
                value={customMaxRepetitions}
                disabled={!repetitionEnabled}
                aria-label="Custom maximum repetitions"
                onChange={(event) => {
                  setCustomMaxRepetitions(Math.max(1, Number(event.target.value)))
                  setGeneratedMosaicUrl(null)
                }}
              />
            )}
          </label>

          <label className="variety-control">
            <span>
              <strong>Prefer variety</strong>
              <small>Gently favour less-used source images</small>
            </span>
            <input
              type="checkbox"
              checked={preferVariety}
              onChange={(event) => {
                setPreferVariety(event.target.checked)
                setGeneratedMosaicUrl(null)
              }}
            />
          </label>

          <label className="render-option">
            <span>
              <strong>Use every source image</strong>
              <small>Prioritize unused images when their colour match is reasonably close</small>
            </span>
            <input
              type="checkbox"
              checked={useEverySourceImage}
              onChange={(event) => {
                setUseEverySourceImage(event.target.checked)
                setGeneratedMosaicUrl(null)
              }}
            />
          </label>

          <label className="resolution-control" htmlFor="grid-resolution">
            <span>
              <strong>Grid resolution</strong>
              <small>Columns × rows used for the mosaic</small>
            </span>
            <select
              id="grid-resolution"
              value={gridResolution}
              onChange={(event) => handleResolutionChange(event.target.value)}
            >
              {GRID_RESOLUTION_PRESETS.map((resolution) => (
                <option value={resolution} key={resolution}>
                  {resolution} × {resolution}
                </option>
              ))}
              <option value="-1">Custom</option>
            </select>
            {gridResolution === -1 && (
              <input
                className="custom-resolution-input"
                type="number"
                min="1"
                max="200"
                value={customResolution}
                aria-label="Custom grid columns"
                onChange={(event) => {
                  setCustomResolution(Math.min(200, Math.max(1, Number(event.target.value))))
                  setGeneratedMosaicUrl(null)
                }}
              />
            )}
          </label>
          <p className="resolution-summary">
            {gridColumns} columns × {gridRows} rows = {tileCount.toLocaleString()} tiles
          </p>
          {showResolutionWarning && (
            <p className="resolution-warning">High resolution may take longer to generate.</p>
          )}

          <div id="export-controls" className="export-resolution-control">
            <div className="feature-heading">
              <strong>Export resolution</strong>
              <small>Final PNG size, independent from preview grid</small>
            </div>
            <label className="method-control" htmlFor="output-resolution">
              <span>Preset</span>
              <select
                id="output-resolution"
                value={outputResolutionPreset}
                onChange={(event) => {
                  setOutputResolutionPreset(event.target.value as OutputResolutionPreset)
                  setGeneratedMosaicUrl(null)
                }}
              >
                <option value="original">Original Size</option>
                <option value="1920">1920px</option>
                <option value="4k">4K</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {outputResolutionPreset === 'custom' && (
              <label className="export-custom-size" htmlFor="custom-output-size">
                <span>Long edge</span>
                <input
                  id="custom-output-size"
                  type="number"
                  min="1"
                  max="10000"
                  value={customOutputLongEdge}
                  onChange={(event) => {
                    setCustomOutputLongEdge(Math.min(10000, Math.max(1, Number(event.target.value))))
                    setGeneratedMosaicUrl(null)
                  }}
                />
                <span>px</span>
              </label>
            )}
            <p className="resolution-summary">Final {exportFormat.toUpperCase()}: {outputSize.width} × {outputSize.height}px</p>
            <label className="method-control" htmlFor="export-format">
              <span>Format</span>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(event) => updateExportEncoding(event.target.value as ExportFormat, exportQuality)}
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </label>
            <label className="weight-control export-quality-control" htmlFor="export-quality">
              <span>Quality</span>
              <input
                id="export-quality"
                type="range"
                min="10"
                max="100"
                value={exportQuality}
                disabled={exportFormat === 'png'}
                onChange={(event) => updateExportEncoding(exportFormat, Number(event.target.value))}
              />
              <output>{exportQuality}%</output>
            </label>
          </div>

          <label className="project-name-control" htmlFor="project-name">
            <span>
              <strong>Project name</strong>
              <small>Used for the downloaded filename</small>
            </span>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>

          <div className="weight-controls">
            <div className="feature-heading">
              <strong>Colour matching weights</strong>
              <small>Choose which channels matter most</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={rgbWeightsEnabled} onChange={(event) => setRgbWeightsEnabled(event.target.checked)} />
                On
              </label>
            </div>

            {(['red', 'green', 'blue'] as const).map((channel) => (
              <label className="weight-control" htmlFor={`${channel}-weight`} key={channel}>
                <span>{channel}</span>
                <input
                  id={`${channel}-weight`}
                  type="range"
                  min="0"
                  max="200"
                  value={rgbWeights[channel]}
                  disabled={!rgbWeightsEnabled}
                  onChange={(event) => handleWeightChange(channel, event.target.value)}
                />
                <output>{rgbWeights[channel]}%</output>
              </label>
            ))}
          </div>

          <label className="method-control" htmlFor="matching-method">
            <span>
              <strong>Matching method</strong>
              <small>Choose the colour distance model</small>
            </span>
            <input className="feature-toggle-input" type="checkbox" checked={matchingMethodEnabled} onChange={(event) => setMatchingMethodEnabled(event.target.checked)} aria-label="Enable matching method" />
            <select
              id="matching-method"
              value={matchingMethod}
              disabled={!matchingMethodEnabled}
              onChange={(event) => {
                setMatchingMethod(event.target.value as MatchingMethod)
                setGeneratedMosaicUrl(null)
                setGenerationError(null)
              }}
            >
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
              <option value="lab">LAB</option>
            </select>
          </label>

          <label className="method-control" htmlFor="crop-position">
            <span>
              <strong>Crop position</strong>
              <small>Anchor the source image inside each tile</small>
            </span>
            <input className="feature-toggle-input" type="checkbox" checked={cropEnabled} onChange={(event) => setCropEnabled(event.target.checked)} aria-label="Enable crop position" />
            <select
              id="crop-position"
              value={cropPosition}
              disabled={!cropEnabled}
              onChange={(event) => {
                setCropPosition(event.target.value as CropPosition)
                setGeneratedMosaicUrl(null)
                setGenerationError(null)
              }}
            >
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>

          <label className="method-control" htmlFor="rotation-mode">
            <span>
              <strong>Tile rotation</strong>
              <small>Rotate source tiles during rendering</small>
            </span>
            <input className="feature-toggle-input" type="checkbox" checked={rotationEnabled} onChange={(event) => setRotationEnabled(event.target.checked)} aria-label="Enable tile rotation" />
            <select
              id="rotation-mode"
              value={rotationMode}
              disabled={!rotationEnabled}
              onChange={(event) => {
                setRotationMode(event.target.value as RotationMode)
                setGeneratedMosaicUrl(null)
                setGenerationError(null)
              }}
            >
              <option value="none">None</option>
              <option value="random">Random</option>
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
              <option value="random-90">Random 90° increments</option>
            </select>
          </label>

          <div className="opacity-control">
            <div className="feature-heading">
              <strong>Tile opacity</strong>
              <small>Set the overall transparency of source tiles</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={opacityEnabled} onChange={(event) => setOpacityEnabled(event.target.checked)} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="tile-opacity">
              <span>Alpha</span>
              <input
                id="tile-opacity"
                type="range"
                min="0"
                max="100"
                value={tileOpacity}
                disabled={!opacityEnabled}
                onChange={(event) => {
                  setTileOpacity(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                }}
              />
              <output>{tileOpacity}%</output>
            </label>
          </div>

          <div className="sharpening-control">
            <div className="feature-heading">
              <strong>Sharpening</strong>
              <small>Apply a light crispness filter to the final mosaic</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={sharpeningEnabled} onChange={(event) => setSharpeningEnabled(event.target.checked)} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="sharpening">
              <span>Amount</span>
              <input
                id="sharpening"
                type="range"
                min="0"
                max="100"
                value={sharpening}
                disabled={!sharpeningEnabled}
                onChange={(event) => {
                  setSharpening(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                }}
              />
              <output>{sharpening}%</output>
            </label>
          </div>

          <label className="render-option">
            <span>
              <strong>Adaptive opacity</strong>
              <small>Weaker colour matches become more transparent</small>
            </span>
            <input
              type="checkbox"
              checked={adaptiveOpacity}
              onChange={(event) => {
                setAdaptiveOpacity(event.target.checked)
                setGeneratedMosaicUrl(null)
              }}
            />
          </label>

          <label className="render-option">
            <span>
              <strong>Show target beneath</strong>
              <small>Keep the main image visible under transparent tiles</small>
            </span>
            <input
              type="checkbox"
              checked={showTargetImage}
              onChange={(event) => {
                setShowTargetImage(event.target.checked)
                setGeneratedMosaicUrl(null)
              }}
            />
          </label>

          <div className="border-control">
            <div className="feature-heading">
              <strong>Image border</strong>
              <small>Reserve space around the mosaic for a solid colour frame</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={borderPercent > 0} onChange={(event) => {
                  setBorderPercent(event.target.checked ? 10 : 0)
                  setGeneratedMosaicUrl(null)
                }} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="border-percent">
              <span>Size</span>
              <input
                id="border-percent"
                type="range"
                min="0"
                max="50"
                value={borderPercent}
                disabled={borderPercent === 0}
                onChange={(event) => {
                  setBorderPercent(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                }}
              />
              <output>{borderPercent}%</output>
            </label>
            <div className="border-color-row">
              <label htmlFor="border-color">Colour</label>
              <input
                id="border-color"
                type="color"
                value={borderColor}
                disabled={borderPercent === 0}
                onChange={(event) => {
                  setBorderColor(event.target.value)
                  setGeneratedMosaicUrl(null)
                }}
              />
            </div>
            <div className="border-presets">
              {[
                { label: 'White', color: '#ffffff' },
                { label: 'Grey', color: '#808080' },
                { label: 'Black', color: '#000000' },
              ].map((preset) => (
                <button type="button" className="border-preset" key={preset.label} onClick={() => setBorderPreset(preset.color)}>
                  <span style={{ backgroundColor: preset.color }} />
                  {preset.label}
                </button>
              ))}
              {prominentColors.map((color, index) => {
                const hex = rgbToHex(color)
                return (
                  <button type="button" className="border-preset" key={hex} onClick={() => setBorderPreset(hex)}>
                    <span style={{ backgroundColor: hex }} />
                    Main {index + 1}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="brightness-control">
            <div className="feature-heading">
              <strong>Brightness weight</strong>
              <small>Match normalized luminance independently</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={brightnessEnabled} onChange={(event) => {
                  setBrightnessEnabled(event.target.checked)
                  setGeneratedMosaicUrl(null)
                }} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="brightness-weight">
              <span>Light</span>
              <input
                id="brightness-weight"
                type="range"
                min="0"
                max="200"
                value={brightnessWeight}
                disabled={!brightnessEnabled}
                onChange={(event) => {
                  setBrightnessWeight(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                  setGenerationError(null)
                }}
              />
              <output>{brightnessWeight}%</output>
            </label>
          </div>

          <div className="saturation-control">
            <div className="feature-heading">
              <strong>Saturation weight</strong>
              <small>Match normalized colour intensity independently</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={saturationEnabled} onChange={(event) => {
                  setSaturationEnabled(event.target.checked)
                  setGeneratedMosaicUrl(null)
                }} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="saturation-weight">
              <span>Colour</span>
              <input
                id="saturation-weight"
                type="range"
                min="0"
                max="200"
                value={saturationWeight}
                disabled={!saturationEnabled}
                onChange={(event) => {
                  setSaturationWeight(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                  setGenerationError(null)
                }}
              />
              <output>{saturationWeight}%</output>
            </label>
          </div>

          <div className="hue-control">
            <div className="feature-heading">
              <strong>Hue weight</strong>
              <small>Match colour families around the hue circle</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={hueEnabled} onChange={(event) => {
                  setHueEnabled(event.target.checked)
                  setGeneratedMosaicUrl(null)
                }} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="hue-weight">
              <span>Hue</span>
              <input
                id="hue-weight"
                type="range"
                min="0"
                max="200"
                value={hueWeight}
                disabled={!hueEnabled}
                onChange={(event) => {
                  setHueWeight(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                  setGenerationError(null)
                }}
              />
              <output>{hueWeight}%</output>
            </label>
          </div>

          <div className="randomness-controls">
            <div className="feature-heading">
              <strong>Randomness</strong>
              <small>Allow near-best colour matches</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={randomnessEnabled} onChange={(event) => {
                  setRandomnessEnabled(event.target.checked)
                  setGeneratedMosaicUrl(null)
                }} />
                On
              </label>
            </div>
            <label className="weight-control" htmlFor="randomness">
              <span>Mix</span>
              <input
                id="randomness"
                type="range"
                min="0"
                max="100"
                value={randomness}
                disabled={!randomnessEnabled}
                onChange={(event) => {
                  setRandomness(Number(event.target.value))
                  setGeneratedMosaicUrl(null)
                }}
              />
              <output>{randomness}%</output>
            </label>
            <label className="seed-control" htmlFor="random-seed">
              <span>Seed</span>
              <input
                id="random-seed"
                type="text"
                value={randomSeed}
                onChange={(event) => {
                  setRandomSeed(event.target.value)
                  setGeneratedMosaicUrl(null)
                }}
              />
            </label>
          </div>

          <button
            className="generate-button"
            type="button"
            aria-busy={isGenerating}
            disabled={!mainImageFile || sourceImages.length === 0 || isGenerating}
            onClick={handleGenerateMosaic}
          >
            {isGenerating ? 'Generating mosaic...' : 'Generate mosaic'}
          </button>
          {isGenerating && (
            <div className="generation-progress" aria-live="polite">
              <div className="generation-progress-label">
                <span>MATCHING TILES</span>
                <output>{generationProgress}%</output>
              </div>
              <progress max="100" value={generationProgress} />
              <button className="cancel-generation-button" type="button" onClick={handleCancelGeneration}>
                Cancel generation
              </button>
            </div>
          )}
          <button
            className="download-button"
            type="button"
            disabled={!generatedMosaicUrl}
            onClick={handleDownloadMosaic}
          >
            Download {exportFormat.toUpperCase()}
          </button>
          {generationError && <p className="generation-error">{generationError}</p>}

          <div className="tip">
            <span>i</span>
            <p>Adjust the colour weights to tell the matcher which channels matter most.</p>
          </div>
        </aside>
      </section>

      <section id="final-output" className={`final-output ${generatedMosaicUrl ? 'has-result' : ''}`} aria-label="Final mosaic preview">
        <div className="final-output-heading">
          <div>
            <p className="eyebrow">OUTPUT / FINAL MOSAIC</p>
            <h2>{generatedMosaicUrl ? 'Your generated mosaic' : 'Final output appears here'}</h2>
          </div>
          <span className="panel-index">03</span>
        </div>
        <div className="comparison-controls" role="group" aria-label="Image comparison mode">
          {(['original', 'mosaic', 'blend'] as const).map((mode) => (
            <button
              className={comparisonMode === mode ? 'active' : ''}
              key={mode}
              type="button"
              disabled={mode !== 'original' && !generatedMosaicUrl}
              onClick={() => setComparisonMode(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
          {comparisonMode === 'blend' && (
            <label className="overlay-control" htmlFor="overlay-percent">
              OVERLAY
              <input
                id="overlay-percent"
                type="range"
                min="0"
                max="100"
                value={overlayPercent}
                onChange={(event) => setOverlayPercent(Number(event.target.value))}
              />
              <output>{overlayPercent}%</output>
            </label>
          )}
        </div>
        <div className="final-output-stage">
          {comparisonMode === 'original' && imageUrl ? (
            <img className="comparison-image" src={imageUrl} alt="Original main image" />
          ) : generatedMosaicUrl ? (
            <>
              {comparisonMode === 'blend' && imageUrl && (
                <img className="comparison-image" src={imageUrl} alt="Original main image beneath mosaic" />
              )}
              <img
                className={comparisonMode === 'blend' ? 'comparison-image blend-mosaic' : 'generated-mosaic'}
                src={generatedMosaicUrl}
                alt="Generated photo mosaic"
                style={comparisonMode === 'blend' ? { opacity: overlayPercent / 100 } : undefined}
              />
              {generationMetadata && selectedUsageSource && generationMetadata.sources
                .find((source) => source.sourceUrl === selectedUsageSource)
                ?.locations.map((location) => (
                  <span
                    className="usage-highlight"
                    key={`${location.row}-${location.column}`}
                    style={{
                      left: `${(location.column / generationMetadata.columns) * 100}%`,
                      top: `${(location.row / generationMetadata.rows) * 100}%`,
                      width: `${100 / generationMetadata.columns}%`,
                      height: `${100 / generationMetadata.rows}%`,
                    }}
                  />
                ))}
            </>
          ) : (
            <span>Run the generator to inspect your final composition.</span>
          )}
        </div>
        {generationMetadata && (
          <div className="usage-visualization">
            <div className="usage-heading">
              <span>SOURCE USAGE / SORTED BY TILE COUNT</span>
              <span>{selectedUsageSource ? 'CLICK AGAIN TO CLEAR' : 'CLICK A SOURCE TO LOCATE TILES'}</span>
            </div>
            <div className="usage-list">
              {generationMetadata.sources.map((source, index) => {
                const sourceIndex = sourceImages.findIndex((image) => image.url === source.sourceUrl)
                const isSelected = selectedUsageSource === source.sourceUrl
                return (
                  <button
                    className={`usage-item ${isSelected ? 'selected' : ''}`}
                    key={source.sourceUrl}
                    type="button"
                    onClick={() => setSelectedUsageSource(isSelected ? null : source.sourceUrl)}
                  >
                    <span className="usage-rank">{(index + 1).toString().padStart(2, '0')}</span>
                    <img src={source.sourceUrl} alt={`Used source ${sourceIndex + 1}`} />
                    <span className="usage-detail">
                      <strong>SOURCE {(sourceIndex + 1).toString().padStart(2, '0')}</strong>
                      <small>{source.count}× / {source.percentage.toFixed(1)}% OF TILES</small>
                    </span>
                    <span className="usage-meter"><i style={{ width: `${Math.max(source.percentage, source.count > 0 ? 2 : 0)}%` }} /></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="final-output-footer">
          <span>{outputSize.width} × {outputSize.height} {exportFormat.toUpperCase()}</span>
          <span>{generatedMosaicUrl ? `Ready to export${estimatedFileSize === null ? '' : ` · ~${formatFileSize(estimatedFileSize)}`}` : 'Awaiting generation'}</span>
        </div>
      </section>

      <footer>
        <span>MG / Mosaic Gallery</span>
        <span>Local-first image processing</span>
      </footer>
    </main>
  )
}

export default App
