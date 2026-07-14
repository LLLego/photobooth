import { stripExif as canvasStripExif } from '../camera/capture.js';

/**
 * Strips EXIF metadata by re-rendering the image into a fresh canvas and
 * exporting a new blob. Because canvas redraws do not preserve metadata, this
 * is a deterministic way to remove GPS, device, and timestamp information.
 *
 * @param {Blob} blob
 * @param {{ type?: string, quality?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function stripExif(blob, opts = {}) {
  if (!blob) throw new Error('A blob is required to strip EXIF.');
  return canvasStripExif(blob, opts);
}
