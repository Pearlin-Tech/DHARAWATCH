import { fromBlob } from 'geotiff';

/**
 * Validates uploaded GeoTIFF file size and format extension.
 */
export function validateGeoTiffFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };

  const validExtensions = ['.tif', '.tiff', '.geotiff', '.png', '.jpg', '.jpeg'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

  if (!validExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format '${ext}'. Please upload a valid .tif or .tiff GeoTIFF file.`
    };
  }

  // Max 50 MB
  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds 50MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`
    };
  }

  return { valid: true, error: null };
}

/**
 * Reads GeoTIFF file in browser, generating a canvas thumbnail Data URL
 * and extracting client-side metadata.
 */
export async function processClientGeoTiff(file) {
  const isTiff = file.name.toLowerCase().includes('.tif');

  if (!isTiff) {
    // Regular image preview fallback
    const previewUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });

    return {
      filename: file.name,
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      previewUrl,
      isTiff: false
    };
  }

  try {
    const tiff = await fromBlob(file);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const samplesPerPixel = image.getSamplesPerPixel();

    // Generate a 120x120 thumbnail preview canvas
    const thumbWidth = 120;
    const thumbHeight = Math.round((height / width) * 120);

    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(thumbWidth, thumbHeight);

    const rasters = await image.readRasters({ width: thumbWidth, height: thumbHeight });

    const rBand = rasters[0] || [];
    const gBand = rasters[1] || rBand;
    const bBand = rasters[2] || rBand;

    for (let i = 0; i < rBand.length; i++) {
      const offset = i * 4;
      imgData.data[offset] = Math.min(255, Math.max(0, rBand[i]));     // R
      imgData.data[offset + 1] = Math.min(255, Math.max(0, gBand[i])); // G
      imgData.data[offset + 2] = Math.min(255, Math.max(0, bBand[i])); // B
      imgData.data[offset + 3] = 255;                                  // Alpha
    }

    ctx.putImageData(imgData, 0, 0);
    const previewUrl = canvas.toDataURL('image/png');

    return {
      filename: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      dimensions: `${width}x${height} px`,
      bandCount: samplesPerPixel,
      previewUrl,
      isTiff: true
    };
  } catch (err) {
    console.warn('Browser GeoTIFF preview fallback:', err.message);
    return {
      filename: file.name,
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      previewUrl: null,
      isTiff: true
    };
  }
}
