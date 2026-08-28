import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Renders the review text onto a yellow post-it canvas texture
 */
export function createStickyNoteTexture(reviewText = '', rating = null) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Post-it yellow background with top adhesive strip shadow
  ctx.fillStyle = '#fffa82';
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, 512, 60);

  // Note Header
  ctx.fillStyle = '#2b2608';
  ctx.font = 'bold 30px "Caveat", "Bradley Hand", "Comic Sans MS", cursive, sans-serif';
  ctx.fillText("Reader's Note ✍️", 36, 44);

  let cursorY = 100;

  // Mini star rating
  if (rating) {
    ctx.fillStyle = '#d49e00';
    ctx.font = '28px sans-serif';
    ctx.fillText('★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)), 36, cursorY);
    cursorY += 42;
  }

  // Review text with word wrapping
  ctx.fillStyle = '#1c1905';
  ctx.font = '26px "Caveat", "Bradley Hand", "Comic Sans MS", cursive, sans-serif';

  const words = reviewText.split(' ');
  let line = '';
  const maxWidth = 440;
  const lineHeight = 36;
  const maxLines = 9;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      if (linesDrawn === maxLines - 1) {
        ctx.fillText(line.trim() + '…', 36, cursorY);
        break;
      }
      ctx.fillText(line, 36, cursorY);
      line = words[n] + ' ';
      cursorY += lineHeight;
      linesDrawn++;
    } else {
      line = testLine;
    }
  }
  if (linesDrawn < maxLines) {
    ctx.fillText(line, 36, cursorY);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates the sticky note mesh with a curl morph target
 */
export function createStickyNoteMesh(reviewText, bookDimensions, rating = null) {
  const noteWidth = 0.58;
  const noteHeight = 0.58;
  const segments = 24;

  const geometry = new THREE.PlaneGeometry(noteWidth, noteHeight, segments, segments);
  const posAttr = geometry.attributes.position;
  const curledPositions = new Float32Array(posAttr.count * 3);

  // Curl morph target: lifts in local +Z (outward from book cover)
  const curlRadius = 0.15;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);

    const t = (noteHeight / 2 - y) / noteHeight;
    const diagBias = (x / (noteWidth / 2)) * 0.12;
    const effT = THREE.MathUtils.clamp(t + diagBias, 0, 1.2);

    if (effT <= 0.18) {
      curledPositions[i * 3] = x;
      curledPositions[i * 3 + 1] = y;
      curledPositions[i * 3 + 2] = 0;
    } else {
      const arcLength = (effT - 0.18) * noteHeight;
      const angle = arcLength / curlRadius;

      curledPositions[i * 3] = x * Math.cos(angle * 0.2);
      curledPositions[i * 3 + 1] = (noteHeight / 2 - 0.18 * noteHeight) - curlRadius * Math.sin(angle);
      curledPositions[i * 3 + 2] = curlRadius * (1 - Math.cos(angle));
    }
  }

  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(curledPositions, 3)
  ];
  geometry.computeVertexNormals();

  const texture = createStickyNoteTexture(reviewText, rating);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    // Prevents Z-fighting and geometry clipping at all viewing angles
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;

  // Upper-right quadrant placement
  const jitterX = (Math.random() - 0.5) * 0.04;
  const jitterZ = (Math.random() - 0.5) * 0.04;
  const jitterYaw = (Math.random() - 0.5) * 0.16; // Subtle ±4.5° tilt

  const targetX = bookDimensions.width * 0.20 + jitterX;
  const targetZ = -bookDimensions.height * 0.20 + jitterZ;
  const targetY = bookDimensions.thickness / 2 + 0.006; // 0.6mm clearance above the cover

  mesh.position.set(targetX, targetY, targetZ);

  // 'YXZ' ensures rotation by -90° on X lays flat, then yaw spins around the cover's normal (+Y)
  mesh.rotation.set(-Math.PI / 2, jitterYaw, 0, 'YXZ');

  mesh.userData = {
    isStickyNote: true,
    isCurled: false,
    toggleCurl: function () {
      this.isCurled = !this.isCurled;
      gsap.to(mesh.morphTargetInfluences, {
        0: this.isCurled ? 1 : 0,
        duration: 0.65,
        ease: 'power2.inOut'
      });
    }
  };

  return mesh;
}