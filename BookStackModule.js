import * as THREE from 'three';
import { createStickyNoteMesh } from './StickyNoteModule.js';

/**
 * Configuration & tuning constants (all units normalized to ~1 unit = 10 cm)
 */
export const STACK_CONFIG = {
  defaultWidth: 1.4,       // ~14 cm standard paperback width
  defaultHeight: 2.1,      // ~21 cm standard paperback height
  minThickness: 0.12,     // ~1.2 cm minimum thickness
  maxThickness: 0.65,     // ~6.5 cm maximum thickness
  pageThicknessRatio: 0.00055, // ~0.055 mm per page
  stackGap: 0.006,        // 0.6 mm air gap to prevent Z-fighting
  jitter: {
    yaw: 0.085,           // ± ~5 degrees (radians)
    translationX: 0.04,   // ± 4 mm X offset
    translationZ: 0.04,   // ± 4 mm Z offset
  },
  colors: {
    pages: 0xf5eedc,      // Warm off-white paper color
    defaultCover: 0x2c3e50,
    spineEdge: 0x1a252f
  }
};

/**
 * Generates a shared canvas-based page edge texture with subtle linear grain
 */
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

/**
 * Calculates realistic book dimensions from Goodreads metadata
 */
export function calculateBookDimensions(metadata = {}) {
  const pageCount = metadata.pageCount || 300;
  
  // Depth (spine thickness) derived from page count
  const rawThickness = pageCount * STACK_CONFIG.pageThicknessRatio;
  const thickness = THREE.MathUtils.clamp(
    rawThickness,
    STACK_CONFIG.minThickness,
    STACK_CONFIG.maxThickness
  );

  // Slight variance in physical trim sizes (paperback vs hardcover)
  const trimVariance = (metadata.id ? (metadata.id % 7) - 3 : 0) * 0.015;
  const width = STACK_CONFIG.defaultWidth + trimVariance;
  const height = STACK_CONFIG.defaultHeight + trimVariance * 1.4;

  return { width, height, thickness };
}

/**
 * Builds the 6-sided multi-material array for a BoxGeometry book lying flat:
 * 0: +X (Right edge / Pages)
 * 1: -X (Left edge / Spine)
 * 2: +Y (Top face / Front Cover)
 * 3: -Y (Bottom face / Back Cover)
 * 4: +Z (Bottom edge / Pages)
 * 5: -Z (Top edge / Pages)
 */
export function createBookMaterials(metadata, textureLoader = new THREE.TextureLoader()) {
  const pageMaterial = new THREE.MeshStandardMaterial({
    map: sharedPageTexture,
    roughness: 0.9,
    metalness: 0.0
  });

  const spineMaterial = new THREE.MeshStandardMaterial({
    color: STACK_CONFIG.colors.spineEdge,
    roughness: 0.5,
    metalness: 0.1
  });

  const frontMaterial = new THREE.MeshStandardMaterial({
    color: STACK_CONFIG.colors.defaultCover,
    roughness: 0.4,
    metalness: 0.05
  });

  // Asynchronously load the front cover if a URL is provided
  if (metadata.coverUrl) {
    textureLoader.load(
      metadata.coverUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        frontMaterial.map = texture;
        frontMaterial.color.set(0xffffff);
        frontMaterial.needsUpdate = true;
      },
      undefined,
      (err) => console.warn(`Failed to load cover for "${metadata.title}":`, err)
    );
  }

  // Back cover material (can be updated later with dynamic canvas texture)
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

/**
 * Creates an individual procedural book mesh
 */
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

  // Attach optional sticky note if a review is provided
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

/**
 * Generates a complete jittered stack of books on a platform
 *
 * @param {Array<Object>} booksMetadata - Array of book data objects from API
 * @param {THREE.Vector3} basePosition - Center origin of the stack base
 * @param {Object} [options] - Custom tuning overrides
 * @returns {{ group: THREE.Group, bookMeshes: Array<THREE.Mesh> }}
 */
export function createBookStack(booksMetadata, basePosition = new THREE.Vector3(0, 0, 0), options = {}) {
  const group = new THREE.Group();
  group.position.copy(basePosition);

  const bookMeshes = [];
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  let currentY = 0; // Stack height accumulator

  booksMetadata.forEach((metadata, index) => {
    const bookMesh = createBookMesh(metadata, textureLoader);
    const { thickness } = bookMesh.userData.dimensions;

    // Center of the current book in the vertical stack
    const bookCenterY = currentY + thickness / 2;

    // Pseudo-random jitter calculations
    const jitterX = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.translationX;
    const jitterZ = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.translationZ;
    const jitterYaw = (Math.random() - 0.5) * 2 * STACK_CONFIG.jitter.yaw;

    // Position and orient the book
    bookMesh.position.set(jitterX, bookCenterY, jitterZ);
    bookMesh.rotation.set(0, jitterYaw, 0);

    // Cache resting transforms for GSAP return animations
    bookMesh.userData.restPosition.copy(bookMesh.position);
    bookMesh.userData.restRotation.copy(bookMesh.rotation);
    bookMesh.userData.stackIndex = index;

    // Advance height accumulator with air gap
    currentY += thickness + STACK_CONFIG.stackGap;

    group.add(bookMesh);
    bookMeshes.push(bookMesh);
  });

  return { group, bookMeshes, totalHeight: currentY };
}