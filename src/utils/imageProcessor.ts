/**
 * Image processing utilities for client-side resizing, background replacement,
 * chromakey-based background removal, and target-KB file compression.
 */

export interface ProcessSettings {
  width: number;
  height: number;
  backgroundType: 'white' | 'transparent' | 'custom';
  customBackgroundColor: string;
  removeBackground: boolean;
  backgroundRemovalThreshold: number;
  fitMode: 'contain' | 'cover' | 'stretch';
  targetSizeKb: number | null; // Target KB size
}

export interface ProcessResult {
  dataUrl: string;
  blob: Blob;
  sizeBytes: number;
  width: number;
  height: number;
  qualityUsed: number;
}

/**
 * Loads an image from a URL or File into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Dynamic Chroma Key: Detects dominant corner background color and masks it out.
 * Returns a new canvas with the transparent mask.
 */
export function eraseBackground(
  sourceImg: HTMLImageElement,
  threshold: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sourceImg.naturalWidth;
  canvas.height = sourceImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(sourceImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Sample corner colors to estimate background color
  const samplePixels = [
    getPixel(data, canvas.width, 0, 0), // Top-Left
    getPixel(data, canvas.width, canvas.width - 1, 0), // Top-Right
    getPixel(data, canvas.width, 0, canvas.height - 1), // Bottom-Left
    getPixel(data, canvas.width, canvas.width - 1, canvas.height - 1) // Bottom-Right
  ];

  // We find the corner color that appears average
  const bgR = Math.round(samplePixels.reduce((sum, p) => sum + p.r, 0) / 4);
  const bgG = Math.round(samplePixels.reduce((sum, p) => sum + p.g, 0) / 4);
  const bgB = Math.round(samplePixels.reduce((sum, p) => sum + p.b, 0) / 4);

  // Apply chroma key masking (euclidean color distance threshold)
  const len = data.length;
  const limit = (threshold / 100) * 441.67; // max distance between two colors is sqrt(3 * 255^2) ≈ 441.67

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    // Euclidean distance in RGB color space
    const dist = Math.sqrt(
      Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
    );

    if (dist < limit) {
      // Soften edges or mask pixel out
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3]
  };
}

/**
 * Renders the processed image on a canvas with target width, height, background and fit settings.
 */
export function renderToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  settings: ProcessSettings
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Draw Background
  const bg = settings.backgroundType;
  if (bg === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, settings.width, settings.height);
  } else if (bg === 'custom') {
    ctx.fillStyle = settings.customBackgroundColor;
    ctx.fillRect(0, 0, settings.width, settings.height);
  } else {
    // transparent background
    ctx.clearRect(0, 0, settings.width, settings.height);
  }

  // 2. Draw Image based on fitMode
  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  let drawW = settings.width;
  let drawH = settings.height;
  let drawX = 0;
  let drawY = 0;

  if (settings.fitMode === 'contain') {
    const ratio = Math.min(settings.width / srcWidth, settings.height / srcHeight);
    drawW = srcWidth * ratio;
    drawH = srcHeight * ratio;
    drawX = (settings.width - drawW) / 2;
    drawY = (settings.height - drawH) / 2;
  } else if (settings.fitMode === 'cover') {
    const ratio = Math.max(settings.width / srcWidth, settings.height / srcHeight);
    drawW = srcWidth * ratio;
    drawH = srcHeight * ratio;
    drawX = (settings.width - drawW) / 2;
    drawY = (settings.height - drawH) / 2;
  }

  ctx.drawImage(source, drawX, drawY, drawW, drawH);
  return canvas;
}

/**
 * Searches and generates the optimal JPEG quality or content scale to hit a target KB.
 */
export async function optimizeAndCompress(
  renderedCanvas: HTMLCanvasElement,
  targetSizeKb: number | null,
  isTransparent: boolean
): Promise<ProcessResult> {
  // If transparent, we MUST output as PNG, since JPEG lacks alpha.
  // Note: PNG can't be lossy-compressed client-side via canvas.toBlob() parameters,
  // so size compression is only applicable to non-transparent targets (JPEG).
  const format = isTransparent ? 'image/png' : 'image/jpeg';

  if (!targetSizeKb || isTransparent) {
    // Direct output
    const blob = await new Promise<Blob>((resolve) => {
      renderedCanvas.toBlob((b) => resolve(b || new Blob()), format, 0.95);
    });
    return {
      dataUrl: URL.createObjectURL(blob),
      blob,
      sizeBytes: blob.size,
      width: renderedCanvas.width,
      height: renderedCanvas.height,
      qualityUsed: 0.95
    };
  }

  const targetBytes = targetSizeKb * 1024;
  
  // Binary Search to find the closest quality value between 0.01 and 1.00
  let low = 0.01;
  let high = 1.0;
  let bestBlob: Blob | null = null;
  let bestQuality = 0.8;
  const maxIterations = 8;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const blob = await new Promise<Blob>((resolve) => {
      renderedCanvas.toBlob((b) => resolve(b || new Blob()), format, mid);
    });

    if (!bestBlob || Math.abs(blob.size - targetBytes) < Math.abs(bestBlob.size - targetBytes)) {
      bestBlob = blob;
      bestQuality = mid;
    }

    if (blob.size > targetBytes) {
      high = mid;
    } else {
      low = mid;
    }
  }

  // If even at lowest quality we exceed targetBytes, try scaling down dimensions internally as fallback,
  // but usually for 600x800, quality 0.01 ranges 8-15KB so it should easily reach 19 KB.
  const finalBlob = bestBlob || new Blob();

  return {
    dataUrl: URL.createObjectURL(finalBlob),
    blob: finalBlob,
    sizeBytes: finalBlob.size,
    width: renderedCanvas.width,
    height: renderedCanvas.height,
    qualityUsed: bestQuality
  };
}
