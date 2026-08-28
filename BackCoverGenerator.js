import * as THREE from 'three';

/**
 * Extracts dominant and accent colors directly from an HTMLImageElement using an offscreen canvas.
 */
export function extractPaletteFromImage(imageElement) {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 32;
  sampleCanvas.height = 32;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });

  ctx.drawImage(imageElement, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;

  let r = 0, g = 0, b = 0, count = 0;

  // Sample perimeter pixels to capture the cover's background tone
  for (let x = 0; x < 32; x++) {
    for (let y of [0, 1, 30, 31]) {
      const idx = (y * 32 + x) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
      count++;
    }
  }

  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const isDark = luminance < 0.55;

  return {
    background: `rgb(${r}, ${g}, ${b})`,
    backgroundRgb: [r, g, b],
    isDark,
    textPrimary: isDark ? '#ffffff' : '#14171a',
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(20, 23, 26, 0.75)',
    accent: isDark ? '#f4c430' : '#b8860b',
    ruleColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'
  };
}

/**
 * Generates a dynamic canvas texture for the book spine.
 */
export function generateSpineTexture(metadata, palette) {
  const canvas = document.createElement('canvas');
  // Width matches book height (along length of spine), Height matches spine thickness
  canvas.width = 1536;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const [r, g, b] = palette.backgroundRgb || [40, 50, 65];

  // 1. Base spine background
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Spine curvature shadow/highlight gradient (simulates rounded cylindrical spine)
  const curveGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  curveGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');     // Top edge hinge shadow
  curveGrad.addColorStop(0.18, 'rgba(0, 0, 0, 0.05)');
  curveGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)'); // Center specular highlight
  curveGrad.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)');
  curveGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');      // Bottom edge hinge shadow
  ctx.fillStyle = curveGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Head & Tail decorative bands (left & right ends of canvas)
  ctx.strokeStyle = palette.ruleColor || 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(90, 20);
  ctx.lineTo(90, canvas.height - 20);
  ctx.moveTo(canvas.width - 90, 20);
  ctx.lineTo(canvas.width - 90, canvas.height - 20);
  ctx.stroke();

  // 4. Spine Title (reads from head toward tail)
  ctx.fillStyle = palette.textPrimary;
  ctx.font = 'bold 64px "Georgia", serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const titleText = (metadata.title || 'Untitled').toUpperCase();
  const maxTitleWidth = canvas.width - 520;

  // Truncate title if it exceeds spine length
  let displayTitle = titleText;
  if (ctx.measureText(displayTitle).width > maxTitleWidth) {
    while (displayTitle.length > 0 && ctx.measureText(displayTitle + '…').width > maxTitleWidth) {
      displayTitle = displayTitle.slice(0, -1);
    }
    displayTitle += '…';
  }
  ctx.fillText(displayTitle, 130, canvas.height / 2);

  // 5. Spine Author (placed near the tail end)
  ctx.fillStyle = palette.textSecondary;
  ctx.font = 'italic 46px "Georgia", serif';
  ctx.textAlign = 'right';
  const authorText = metadata.author || '';
  ctx.fillText(authorText, canvas.width - 130, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, fillPercent = 1) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();

  if (fillPercent >= 1) {
    ctx.fill();
  } else if (fillPercent > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillRect(cx - outerRadius, cy - outerRadius, outerRadius * 2 * fillPercent, outerRadius * 2);
    ctx.restore();
  }
  ctx.stroke();
}

function wrapAndRenderText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.replace(/<[^>]*>?/gm, '').split(' ');
  let line = '';
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && n > 0) {
      if (linesDrawn === maxLines - 1) {
        ctx.fillText(line.trim() + '…', x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
      linesDrawn++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

export function generateBackCoverTexture(metadata, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  const padX = 80;
  const contentWidth = canvas.width - padX * 2;

  const [r, g, b] = palette.backgroundRgb || [26, 31, 44];
  const bgGrad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 3, 100,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.8
  );
  bgGrad.addColorStop(0, `rgba(${Math.min(255, r + 25)}, ${Math.min(255, g + 25)}, ${Math.min(255, b + 25)}, 1)`);
  bgGrad.addColorStop(1, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 1)`);

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let cursorY = 120;

  // Title
  ctx.fillStyle = palette.textPrimary;
  ctx.font = 'bold 52px "Georgia", serif';
  cursorY = wrapAndRenderText(ctx, metadata.title || 'Untitled', padX, cursorY, contentWidth, 62, 3);
  cursorY += 8;

  // Author
  ctx.fillStyle = palette.textSecondary;
  ctx.font = 'italic 34px "Georgia", serif';
  ctx.fillText(`by ${metadata.author || 'Unknown Author'}`, padX, cursorY);
  cursorY += 40;

  // Rating Stars
  const rating = parseFloat(metadata.rating) || 0;
  const starRadius = 18;
  const starGap = 44;

  ctx.fillStyle = palette.accent;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;

  for (let i = 0; i < 5; i++) {
    const fill = Math.min(Math.max(rating - i, 0), 1);
    drawStar(ctx, padX + starRadius + i * starGap, cursorY, 5, starRadius, starRadius * 0.45, fill);
  }

  ctx.fillStyle = palette.textPrimary;
  ctx.font = 'bold 30px "Helvetica Neue", sans-serif';
  const ratingText = rating > 0 ? rating.toFixed(2) : 'Unrated';
  ctx.fillText(ratingText, padX + 5 * starGap + 15, cursorY + 8);

  if (metadata.ratingsCount) {
    ctx.fillStyle = palette.textSecondary;
    ctx.font = '24px "Helvetica Neue", sans-serif';
    ctx.fillText(`(${metadata.ratingsCount.toLocaleString()} ratings)`, padX + 5 * starGap + 105, cursorY + 8);
  }

  cursorY += 45;

  // Divider
  ctx.strokeStyle = palette.ruleColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, cursorY);
  ctx.lineTo(canvas.width - padX, cursorY);
  ctx.stroke();

  cursorY += 55;

  // Description
  ctx.fillStyle = palette.textPrimary;
  ctx.font = '32px "Georgia", serif';
  const synopsis = metadata.description || 'No description available for this edition.';
  wrapAndRenderText(ctx, synopsis, padX, cursorY, contentWidth, 48, 14);

  // Footer
  const footerY = canvas.height - 90;
  ctx.strokeStyle = palette.ruleColor;
  ctx.beginPath();
  ctx.moveTo(padX, footerY - 35);
  ctx.lineTo(canvas.width - padX, footerY - 35);
  ctx.stroke();

  ctx.fillStyle = palette.textSecondary;
  ctx.font = '24px "Helvetica Neue", sans-serif';
  const pageLabel = metadata.pageCount ? `${metadata.pageCount} pages` : '';
  const isbnLabel = metadata.isbn ? `ISBN: ${metadata.isbn}` : '';
  ctx.fillText([pageLabel, isbnLabel].filter(Boolean).join('  •  '), padX, footerY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  // Invert 180° for physical end-over-end orientation
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI;

  return texture;
}

/**
 * Unified loader: loads cover image, derives palette, and applies both back cover and spine textures.
 */
export function attachDynamicCoversAndSpine(bookMesh, metadata) {
  const defaultPalette = {
    background: '#1a1f2c',
    backgroundRgb: [26, 31, 44],
    isDark: true,
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.75)',
    accent: '#f4c430',
    ruleColor: 'rgba(255, 255, 255, 0.15)'
  };

  const applyTextures = (palette) => {
    // Spine (-X face -> material index 1)
    const spineTexture = generateSpineTexture(metadata, palette);
    bookMesh.material[1].map = spineTexture;
    bookMesh.material[1].color.set(0xffffff);
    bookMesh.material[1].needsUpdate = true;

    // Back cover (-Y face -> material index 3)
    const backTexture = generateBackCoverTexture(metadata, palette);
    bookMesh.material[3].map = backTexture;
    bookMesh.material[3].color.set(0xffffff);
    bookMesh.material[3].needsUpdate = true;
  };

  if (!metadata.coverUrl) {
    applyTextures(defaultPalette);
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = metadata.coverUrl;

  img.onload = () => {
    const palette = extractPaletteFromImage(img);
    applyTextures(palette);
  };

  img.onerror = () => {
    applyTextures(defaultPalette);
  };
}