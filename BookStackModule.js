import * as THREE from 'three';
import { createStickyNoteMesh } from './StickyNoteModule.js';

/**
 * Configuration & tuning constants (all units normalized to ~1 unit = 10 cm)
 */
export const STACK_CONFIG = {
  defaultWidth: 1.4,       // ~14 cm standard paperback width
  defaultHeight: 2.1,      // ~21 cm standard paperback height
  maxThickness: 0.65,     // ~6.5 cm maximum thickness
  stackGap: 0.006,        // 0.6 mm air gap to prevent Z-fighting
  minThickness: 0.14,
  pageThicknessRatio: 0.0006,
  jitter: {
    yaw: 0.085,           // ± ~5 degrees (radians)
    translationX: 0.04,   // ± 4 mm X offset
    translationZ: 0.04,   // ± 4 mm Z offset
    yaw: 0.12,            // ± ~7 degrees jitter
    translationX: 0.04,
    translationZ: 0.04,
  },
  colors: {
    pages: 0xf5eedc,      // Warm off-white paper color
    defaultCover: 0x2c3e50,
    spineEdge: 0x1a252f
  }
};

function createPageTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5eedc';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#e6dbc4';
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 3) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

const sharedPageTexture = createPageTexture();

export function calculateBookDimensions(metadata = {}) {
  const pageCount = metadata.pageCount || 300;
  const rawThickness = pageCount * STACK_CONFIG.pageThicknessRatio;
  const thickness = THREE.MathUtils.clamp(
    rawThickness,
    STACK_CONFIG.minThickness,
    STACK_CONFIG.maxThickness
  );

  const trimVariance = (metadata.id ? (metadata.id % 7) - 3 : 0) * 0.015;
  const width = STACK_CONFIG.defaultWidth + trimVariance;
  const height = STACK_CONFIG.defaultHeight + trimVariance * 1.4;

  return { width, height, thickness };
}

export function createBookMaterials(metadata, textureLoader = new THREE.TextureLoader()) {
  const pageMaterial = new THREE.MeshStandardMaterial({
    map: sharedPageTexture,
    roughness: 0.9,
    metalness: 0.0
  });

  const spineMaterial = new THREE.MeshStandardMaterial({
    color: STACK_CONFIG.colors.spineEdge,
    roughness: 0.5,
    metalness: 0.05
  });

  const frontMaterial = new THREE.MeshStandardMaterial({
    color: STACK_CONFIG.colors.defaultCover,
    roughness: 0.4,
    metalness: 0.05
  });

  if (metadata.coverUrl) {
    textureLoader.load(
      metadata.coverUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        frontMaterial.map = texture;
        frontMaterial.color.set(0xffffff);
        frontMaterial.needsUpdate = true;
      }
    );
  }

  const backMaterial = new THREE.MeshStandardMaterial({
    color: STACK_CONFIG.colors.defaultCover,
    roughness: 0.5
  });

  return [
    pageMaterial,  // +X: Outer edge
    spineMaterial, // -X: Spine
    frontMaterial, // +Y: Front Cover
    backMaterial,  // -Y: Back Cover
    pageMaterial,  // +Z: Bottom page trim
    pageMaterial   // -Z: Top page trim
  ];
}

export function createBookMesh(metadata, textureLoader) {
  const { width, height, thickness } = calculateBookDimensions(metadata);
  const geometry = new THREE.BoxGeometry(width, thickness, height);
  const materials = createBookMaterials(metadata, textureLoader);

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.userData = {
    metadata,
    dimensions: { width, height, thickness },
    isFocused: false,
    restPosition: new THREE.Vector3(),
    restRotation: new THREE.Euler()
  };

  if (metadata.review) {
    const stickyNote = createStickyNoteMesh(
      metadata.review,
      { width, height, thickness },
      metadata.myRating || metadata.rating
    );
    mesh.add(stickyNote);
    mesh.userData.stickyNote = stickyNote;
  }

  return mesh;
}

export function createBookStack(booksMetadata, basePosition = new THREE.Vector3(0, 0, 0)) {
  const group = new THREE.Group();
  group.position.copy(basePosition);

  const bookMeshes = [];
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  let currentY = 0;

  // Reversing places older books at the base (Y = 0) and the newest book on top
  const stackOrder = [...booksMetadata].reverse();

  stackOrder.forEach((metadata, index) => {
    const bookMesh = createBookMesh(metadata, textureLoader);
    const { thickness } = bookMesh.userData.dimensions;

    const bookCenterY = currentY + thickness / 2;

    const jitterX = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.translationX;
    const jitterZ = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.translationZ;
    const jitterYaw = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.yaw;

    bookMesh.position.set(jitterX, bookCenterY, jitterZ);
    bookMesh.rotation.set(0, Math.PI / 2 + jitterYaw, 0);

    bookMesh.userData.restPosition.copy(bookMesh.position);
    bookMesh.userData.restRotation.copy(bookMesh.rotation);
    bookMesh.userData.stackIndex = index;

    currentY += thickness + STACK_CONFIG.stackGap;

    group.add(bookMesh);
    bookMeshes.push(bookMesh);
  });

  return { group, bookMeshes, totalHeight: currentY };
}

/**
 * Generates an overlapping, floating "shingled" display of books behind the main stacks
 *
 * @param {Array<Object>} booksMetadata - Books from the 'currently-reading' shelf
 * @param {THREE.Vector3} basePosition - Center origin of the floating arrangement
 * @param {Object} [options]
 * @returns {{ group: THREE.Group, bookMeshes: Array<THREE.Mesh> }}
 */
export function createShingledShelf(booksMetadata, basePosition = new THREE.Vector3(0, 1.35, -1.6), options = {}) {
  const group = new THREE.Group();
  group.position.copy(basePosition);

  const bookMeshes = [];
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  const count = booksMetadata.length;
  if (count === 0) return { group, bookMeshes };

  // Spacing parameters for the shingled fan
  const spacingX = 0.75;  // Horizontal step between overlapping covers
  const stepZ = 0.16;     // Stagger depth to prevent polygon intersection
  const totalWidth = (count - 1) * spacingX;
  const startX = -totalWidth / 2;

  booksMetadata.forEach((metadata, index) => {
    const bookMesh = createBookMesh(metadata, textureLoader);

    // Calculate cascading position
    const posX = startX + index * spacingX;
    // Layer front-to-back from left to right
    const posZ = (index - (count - 1) / 2) * stepZ;
    // Subtle arch: middle books float slightly higher
    const archY = Math.sin((index / Math.max(count - 1, 1)) * Math.PI) * 0.08;

    bookMesh.position.set(posX, archY, posZ);

    // Orientation:
    // 1. Math.PI / 2 on X brings front cover (+Y) facing outward toward camera (+Z)
    // 2. -0.1 on X tilts the book back slightly (~6°) for readability from the camera angle
    // 3. -0.3 on Y creates the classic shingled/fanned book display angle (~17°)
    bookMesh.rotation.set(
      Math.PI / 2 - 0.1,
      -0.3,
      0.04,
      'YXZ'
    );

    // Store resting transforms so GSAP unfocus and return animations work seamlessly
    bookMesh.userData.restPosition.copy(bookMesh.position);
    bookMesh.userData.restRotation.copy(bookMesh.rotation);
    bookMesh.userData.isFloatingShelf = true;

    group.add(bookMesh);
    bookMeshes.push(bookMesh);
  });

  return { group, bookMeshes };
}
