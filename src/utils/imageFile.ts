export const SUPPORTED_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml'

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg']
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

/**
 * Accepts supported image MIME types and extensions, including files with a missing MIME type.
 */
export function isSupportedImageFile(file: File): boolean {
  const fileName = file.name.toLowerCase()
  const hasSupportedExtension = SUPPORTED_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
  const hasSupportedType = SUPPORTED_IMAGE_TYPES.includes(file.type)

  return hasSupportedExtension || hasSupportedType
}