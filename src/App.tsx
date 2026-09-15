import { useEffect, useRef, useState } from 'react'
import { analyzeImageDetails } from './utils/imageAnalysis'
import { findClosestSourceImage, type MatchingMethod } from './utils/colorMatching'
import { getImageDimensions, GRID_RESOLUTION_PRESETS } from './utils/gridAnalysis'
import { canvasToDataUrl, createExportFilename, downloadImage, estimateDataUrlBytes, formatFileSize, type ExportFormat } from './utils/export'
import { generateApplicationMosaic } from './utils/applicationApi'
import { isSupportedImageFile, SUPPORTED_IMAGE_ACCEPT } from './utils/imageFile'
import { type CropPosition, type RotationMode } from './utils/mosaicRendering'
import { createSeededRandom, getOutputSize, MAX_SOURCE_IMAGES, rgbToHex, type OutputResolutionPreset, type SourceImage } from './utils/projectSettings'
import type { AverageRgb } from './utils/imageAnalysis'
import './App.css'

function App() {
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
  const [generatedSettingsKey, setGeneratedSettingsKey] = useState<string | null>(null)
  const [estimatedFileSize, setEstimatedFileSize] = useState<number | null>(null)
  const generatedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [generatedFilename, setGeneratedFilename] = useState('mosaic-gallery.png')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const sourceImagesRef = useRef<SourceImage[]>([])
  const mainImageImportIdRef = useRef(0)
  const generationIdRef = useRef(0)

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

  async function importMainImage(file: File) {
    if (!isSupportedImageFile(file)) {
      setGenerationError('Please choose a PNG, JPG, JPEG, WebP, or SVG image.')
      return
    }

    const importId = ++mainImageImportIdRef.current
    setGenerationError(null)

    try {
      const [analysis, dimensions] = await Promise.all([
        analyzeImageDetails(file),
        getImageDimensions(file),
      ])
      if (importId !== mainImageImportIdRef.current) return

      setMainImageFile(file)
      setImageUrl(URL.createObjectURL(file))
      setMainImageAverageRgb(analysis.averageRgb)
      setMainImageBrightness(analysis.brightness)
      setMainImageSaturation(analysis.saturation)
      setMainImageHue(analysis.hue)
      setProminentColors(analysis.prominentColors)
      setMainImageDimensions(dimensions)
    } catch (error) {
      if (importId === mainImageImportIdRef.current) {
        setGenerationError(error instanceof Error ? error.message : 'The selected image could not be imported.')
      }
    }
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await importMainImage(file)
  }

  async function importSourceImages(files: File[]) {
    const supportedFiles = files.filter(isSupportedImageFile)

    if (supportedFiles.length === 0) {
      setGenerationError('Please choose PNG, JPG, JPEG, WebP, or SVG source images.')
      return
    }

    const openSlots = Math.max(0, MAX_SOURCE_IMAGES - sourceImagesRef.current.length)
    if (openSlots === 0) {
      setGenerationError(`You can import up to ${MAX_SOURCE_IMAGES} source images.`)
      return
    }

    const candidateFiles = supportedFiles.slice(0, openSlots)
    const analyses = await Promise.allSettled(candidateFiles.map(async (file) => ({
      file,
      analysis: await analyzeImageDetails(file),
    })))
    const successfulFiles = analyses
      .filter((result): result is PromiseFulfilledResult<{ file: File; analysis: Awaited<ReturnType<typeof analyzeImageDetails>> }> => result.status === 'fulfilled')
      .map((result) => result.value)
    const remainingSlots = Math.max(0, MAX_SOURCE_IMAGES - sourceImagesRef.current.length)
    const newImages = successfulFiles.slice(0, remainingSlots).map(({ file, analysis }) => ({
      url: URL.createObjectURL(file),
      ...analysis,
    }))

    if (newImages.length === 0) {
      setGenerationError(remainingSlots === 0
        ? `You can import up to ${MAX_SOURCE_IMAGES} source images.`
        : 'None of the selected source images could be read.')
      return
    }

    const nextImages = [...sourceImagesRef.current, ...newImages]

    sourceImagesRef.current = nextImages
    setSourceImages(nextImages)
    const skippedCount = supportedFiles.length - newImages.length
    setGenerationError(skippedCount > 0
      ? `${skippedCount} image${skippedCount === 1 ? ' was' : 's were'} skipped because it could not be read or the archive is full.`
      : null)
  }

  async function handleSourceImagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await importSourceImages(files)
  }

  function removeSourceImage(imageUrl: string) {
    const removedImage = sourceImagesRef.current.find((sourceImage) => sourceImage.url === imageUrl)
    const nextImages = sourceImagesRef.current.filter((sourceImage) => sourceImage.url !== imageUrl)
    sourceImagesRef.current = nextImages
    setSourceImages(nextImages)
    if (removedImage) URL.revokeObjectURL(removedImage.url)
  }

  async function handleGenerateMosaic() {
    if (!mainImageFile || sourceImages.length === 0) return

    const generationId = ++generationIdRef.current
    setIsGenerating(true)
    setGenerationError(null)

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
        export: {
          format: exportFormat,
          quality: exportQuality / 100,
          projectName,
        },
      })

      if (generationId !== generationIdRef.current) return
      generatedCanvasRef.current = result.canvas
      setGeneratedMosaicUrl(result.dataUrl)
      setGeneratedSettingsKey(generationSettingsKey)
      setEstimatedFileSize(result.estimatedBytes)
      setGeneratedFilename(result.filename)
    } catch (error) {
      if (generationId === generationIdRef.current) {
        setGenerationError(error instanceof Error ? error.message : 'Mosaic generation failed')
      }
    } finally {
      if (generationId === generationIdRef.current) setIsGenerating(false)
    }
  }

  function handleDownloadMosaic() {
    if (!hasCurrentResult || !generatedMosaicUrl) return

    downloadImage(generatedMosaicUrl, generatedFilename)
  }

  function updateExportEncoding(format: ExportFormat, quality: number) {
    setExportFormat(format)
    setExportQuality(quality)
    if (generatedCanvasRef.current && hasCurrentResult && generatedMosaicUrl) {
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
  const generationSettingsKey = JSON.stringify({
    imageUrl,
    sourceImages: sourceImages.map((sourceImage) => sourceImage.url),
    gridColumns,
    gridRows,
    rgbWeights,
    rgbWeightsEnabled,
    brightnessWeight,
    brightnessEnabled,
    saturationWeight,
    saturationEnabled,
    hueWeight,
    hueEnabled,
    matchingMethod,
    matchingMethodEnabled,
    cropPosition,
    cropEnabled,
    rotationMode,
    rotationEnabled,
    tileOpacity,
    opacityEnabled,
    sharpening,
    sharpeningEnabled,
    adaptiveOpacity,
    showTargetImage,
    borderPercent,
    borderColor,
    maxRepetitions,
    repetitionEnabled,
    preferVariety,
    useEverySourceImage,
    randomness,
    randomnessEnabled,
    randomSeed,
    outputSize,
  })
  const hasCurrentResult = generatedMosaicUrl !== null && generatedSettingsKey === generationSettingsKey
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

  function randomizeMosaicSettings() {
    const nextSeed = `chaos-${Math.random().toString(36).slice(2, 8)}`
    setRandomSeed(nextSeed)
    setRandomnessEnabled(true)
    setRandomness(Math.floor(20 + Math.random() * 61))
    setRotationEnabled(true)
    setRotationMode(Math.random() > 0.5 ? 'random-90' : 'random')
    setPreferVariety(Math.random() > 0.35)
    setGenerationError(null)
  }

  function resetColourMatching() {
    setRgbWeights({ red: 100, green: 100, blue: 100 })
    setRgbWeightsEnabled(true)
    setBrightnessWeight(0)
    setBrightnessEnabled(false)
    setSaturationWeight(0)
    setSaturationEnabled(false)
    setHueWeight(0)
    setHueEnabled(false)
    setMatchingMethod('rgb')
    setMatchingMethodEnabled(true)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="masthead">
          <a className="wordmark" href="/" aria-label="Mosaic Gallery home">
            <span className="wordmark-mark">MG</span>
            MOSAIC GALLERY <small>v1.0</small>
          </a>
          <div className="topbar-meta">
            <span className="status-pill">LOCAL ENGINE ONLINE</span>
            <span className="version-label">BUILD 2004.09</span>
          </div>
        </div>
        <nav className="menu-bar" aria-label="Mosaic Gallery controls">
          <a href="#input">[FILE]</a>
          <a href="#engine">[ENGINE]</a>
          <a href="#colour">[COLOUR]</a>
          <a href="#output">[EXPORT]</a>
          <button type="button" onClick={randomizeMosaicSettings}>[CHAOS!]</button>
        </nav>
      </header>

      <section className="intro">
        <p className="eyebrow">MOSAIC-GALLERY.EXE / PERSONAL IMAGE UTILITY</p>
        <h1>MAKE A PHOTO OUT OF <em>OTHER</em> PHOTOS.</h1>
        <p className="intro-copy">
          Feed the engine a target image and a pile of fragments. Every dial remains exposed;
          nothing leaves your browser.
        </p>
      </section>

      <section className="workspace" aria-label="Mosaic workspace">
        <aside className="source-archive" id="input">
          <div className="archive-heading">
            <div>
              <p className="eyebrow">SOURCE ARCHIVE</p>
              <h2>Contact sheet</h2>
            </div>
            <output>{sourceImages.length} / {MAX_SOURCE_IMAGES}</output>
          </div>
          <label
            className="archive-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void importSourceImages(Array.from(event.dataTransfer.files))
            }}
          >
            <span>+</span>
            <strong>Import fragments</strong>
            <small>Drop or browse image files</small>
            <input
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
                  <button
                    className="remove-source-image"
                    type="button"
                    aria-label={`Remove source image ${index + 1}`}
                    onClick={() => removeSourceImage(sourceImage.url)}
                  >
                    ×
                  </button>
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
          <div className="stage-footer" aria-live="polite">
            <span>{imageUrl ? 'TARGET BUFFER: READY' : 'TARGET BUFFER: EMPTY'}</span>
            <span>GRID: {gridColumns} × {gridRows}</span>
            <span>{tileCount.toLocaleString()} CELLS</span>
          </div>
        </div>

        <aside className="controls-panel" id="engine">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONTROL ROOM / 02</p>
              <h2>Processing setup</h2>
            </div>
            <span className="panel-index">02</span>
          </div>

          <label
            className="upload-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const file = event.dataTransfer.files[0]
              if (file) void importMainImage(file)
            }}
          >
            <span className="upload-icon">↑</span>
            <span>
              <strong>{imageUrl ? 'Replace photo' : 'Add a photo'}</strong>
              <small>Drop or browse JPG, PNG, WebP, or SVG</small>
            </span>
            <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={handleImageChange} />
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

          <div className="export-resolution-control">
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
              <strong id="colour">Colour matching weights</strong>
              <small>Choose which channels matter most</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={rgbWeightsEnabled} onChange={(event) => setRgbWeightsEnabled(event.target.checked)} />
                On
              </label>
              <button className="mini-reset" type="button" onClick={resetColourMatching}>RESET</button>
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
            <div className="weight-controls-heading">
              <strong>Brightness weight</strong>
              <small>Match normalized luminance independently</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={brightnessEnabled} onChange={(event) => setBrightnessEnabled(event.target.checked)} />
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
            <div className="weight-controls-heading">
              <strong>Saturation weight</strong>
              <small>Match normalized colour intensity independently</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={saturationEnabled} onChange={(event) => setSaturationEnabled(event.target.checked)} />
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
            <div className="weight-controls-heading">
              <strong>Hue weight</strong>
              <small>Match colour families around the hue circle</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={hueEnabled} onChange={(event) => setHueEnabled(event.target.checked)} />
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
            <div className="weight-controls-heading">
              <strong>Randomness</strong>
              <small>Allow near-best colour matches</small>
              <label className="feature-toggle">
                <input type="checkbox" checked={randomnessEnabled} onChange={(event) => setRandomnessEnabled(event.target.checked)} />
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
            <button className="chaos-button" type="button" onClick={randomizeMosaicSettings}>
              ROLL A CHAOS SEED
            </button>
          </div>

          <div className="machine-status" aria-live="polite">
            <span>ENGINE: {isGenerating ? 'RENDERING' : 'IDLE'}</span>
            <span>SOURCES: {sourceImages.length} / {MAX_SOURCE_IMAGES}</span>
            <span>OUTPUT: {outputSize.width} × {outputSize.height}</span>
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
          <button
            className="download-button"
            type="button"
            disabled={!hasCurrentResult}
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

      <section className={`final-output ${hasCurrentResult ? 'has-result' : ''}`} id="output" aria-label="Final mosaic preview">
        <div className="final-output-heading">
          <div>
            <p className="eyebrow">OUTPUT / FINAL MOSAIC</p>
            <h2>{hasCurrentResult ? 'Your generated mosaic' : 'Final output appears here'}</h2>
          </div>
          <span className="panel-index">03</span>
        </div>
        <div className="final-output-stage">
          {hasCurrentResult && generatedMosaicUrl ? (
            <img className="generated-mosaic" src={generatedMosaicUrl} alt="Generated photo mosaic" />
          ) : (
            <span>Run the generator to inspect your final composition.</span>
          )}
        </div>
        <div className="final-output-footer">
          <span>{outputSize.width} × {outputSize.height} {exportFormat.toUpperCase()}</span>
          <span>{hasCurrentResult ? `Ready to export${estimatedFileSize === null ? '' : ` · ~${formatFileSize(estimatedFileSize)}`}` : 'Awaiting generation'}</span>
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
