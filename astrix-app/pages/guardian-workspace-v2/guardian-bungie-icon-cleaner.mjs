/* ASTRIX PARADOX — Bungie emblem cleaner.
 * Browser-side port of the supplied extract_supers.py algorithm.
 * Converts Bungie's coloured ability/subclass tiles into centred white
 * transparent emblems so Forge owns the diamond background/glow treatment.
 */

const CANVAS = 512;
const TARGET_FILL = 0.72;
const ALPHA_FLOOR = 6;
const cleanedIconCache = new Map();

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function detectBackground(data, width, height) {
  const channels = [[], [], []];
  const fallback = [[], [], []];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max > 0 ? (max - min) / max : 0;

      if (saturation > 0.30) {
        channels[0].push(r);
        channels[1].push(g);
        channels[2].push(b);
      }
      if (max < 200) {
        fallback[0].push(r);
        fallback[1].push(g);
        fallback[2].push(b);
      }
    }
  }

  const source = channels[0].length >= 50 ? channels : fallback;
  return source.map(median);
}

function keyWhite(imageData) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const bg = detectBackground(data, width, height);
  const gaps = bg.map(value => Math.max(255 - value, 1));
  const gapTotal = gaps[0] + gaps[1] + gaps[2];
  const weights = gaps.map(value => value / gapTotal);

  for (let i = 0; i < data.length; i += 4) {
    const alphaParts = [0, 1, 2].map(channel =>
      Math.min(1, Math.max(0, (data[i + channel] - bg[channel]) / gaps[channel]))
    );
    const alpha = alphaParts[0] * weights[0] + alphaParts[1] * weights[1] + alphaParts[2] * weights[2];
    output[i] = 255;
    output[i + 1] = 255;
    output[i + 2] = 255;
    const sourceAlpha = data[i + 3] / 255;
    output[i + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * sourceAlpha * 255);
  }

  return new ImageData(output, width, height);
}

function cropBounds(imageData) {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= ALPHA_FLOOR) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function bitmapFromUrl(src) {
  const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Bungie icon request failed (${response.status})`);
  return createImageBitmap(await response.blob());
}

async function cleanBungieIcon(src) {
  if (!src) return '';
  if (cleanedIconCache.has(src)) return cleanedIconCache.get(src);

  const task = (async () => {
    const bitmap = await bitmapFromUrl(src);
    const source = document.createElement('canvas');
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const keyed = keyWhite(sourceContext.getImageData(0, 0, source.width, source.height));
    const bounds = cropBounds(keyed);

    const keyedCanvas = document.createElement('canvas');
    keyedCanvas.width = keyed.width;
    keyedCanvas.height = keyed.height;
    keyedCanvas.getContext('2d').putImageData(keyed, 0, 0);

    const output = document.createElement('canvas');
    output.width = CANVAS;
    output.height = CANVAS;
    const outputContext = output.getContext('2d');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';

    const scale = (CANVAS * TARGET_FILL) / Math.max(bounds.width, bounds.height);
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    const x = Math.round((CANVAS - width) / 2);
    const y = Math.round((CANVAS - height) / 2);
    outputContext.drawImage(
      keyedCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      x,
      y,
      width,
      height
    );

    return output.toDataURL('image/png');
  })();

  cleanedIconCache.set(src, task);
  try {
    return await task;
  } catch (error) {
    cleanedIconCache.delete(src);
    throw error;
  }
}

async function cleanImageElement(img, src) {
  if (!img || !src) return;
  img.src = src;
  img.dataset.bungieOriginalSrc = src;
  try {
    const cleaned = await cleanBungieIcon(src);
    if (img.dataset.bungieOriginalSrc !== src) return;
    img.src = cleaned;
    img.dataset.bungieIconCleaned = 'true';
  } catch (error) {
    console.warn('[Forge Bungie icon cleaner] using original icon', src, error);
    if (img.dataset.bungieOriginalSrc === src) img.src = src;
    img.dataset.bungieIconCleaned = 'false';
  }
}

export { cleanBungieIcon, cleanImageElement };
