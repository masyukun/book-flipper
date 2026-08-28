// ----------------------------------------------------------------------
// CONFIGURATION: Change this to any Goodreads user profile URL or ID
// ----------------------------------------------------------------------
export const GOODREADS_PROFILE = 'https://www.goodreads.com/user/show/5106656-matthew-royal';
export const MAX_BOOKS_PER_STACK = 6;
// ----------------------------------------------------------------------

import * as THREE from 'three';
import { createBookStack } from './BookStackModule.js';
import { attachDynamicCoversAndSpine } from './BackCoverGenerator.js';
import { BookInteractionController } from './BookInteractionController.js';
import { fetchGoodreadsShelf } from './GoodreadsService.js';

class BookShowcaseApp {
  constructor(containerId, canvasId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId);

    this.initScene();
    this.initLighting();
    this.initPlatforms();
    this.loadLiveData();
    this.initResizeObserver();
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    this.camera.position.set(0, 2.8, 5.8);
    this.camera.lookAt(0, 0.6, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  initLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 3;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x88bbff, 1.2);
    rimLight.position.set(-4, 3, -3);
    this.scene.add(rimLight);
  }

  initPlatforms() {
    const platformGeo = new THREE.CylinderGeometry(1.4, 1.45, 0.15, 48);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.6,
      metalness: 0.2
    });

    // Left Platform ("To Read")
    const leftPlatform = new THREE.Mesh(platformGeo, platformMat);
    leftPlatform.position.set(-1.8, -0.075, 0);
    leftPlatform.receiveShadow = true;
    this.scene.add(leftPlatform);

    // Right Platform ("Completed")
    const rightPlatform = new THREE.Mesh(platformGeo, platformMat);
    rightPlatform.position.set(1.8, -0.075, 0);
    rightPlatform.receiveShadow = true;
    this.scene.add(rightPlatform);
  }

  async loadLiveData() {
    try {
      // Parallel fetch for 'to-read' and 'read' shelves
      const [tbrBooks, completedBooks] = await Promise.all([
        fetchGoodreadsShelf(GOODREADS_PROFILE, 'to-read', MAX_BOOKS_PER_STACK),
        fetchGoodreadsShelf(GOODREADS_PROFILE, 'read', MAX_BOOKS_PER_STACK)
      ]);

      // Left Stack: "To Be Read"
      const tbrStack = createBookStack(tbrBooks, new THREE.Vector3(-1.8, 0, 0));
      // Right Stack: "Recently Completed"
      const completedStack = createBookStack(completedBooks, new THREE.Vector3(1.8, 0, 0));

      this.scene.add(tbrStack.group);
      this.scene.add(completedStack.group);

      const allBooks = [...tbrStack.bookMeshes, ...completedStack.bookMeshes];

      // Dynamically generate matching palette spines and back covers
      allBooks.forEach(mesh => {
        attachDynamicCoversAndSpine(mesh, mesh.userData.metadata);
      });

      // Initialize interaction controller (Hover, Zoom, Pan, Flip, Sticky Notes)
      this.interactionController = new BookInteractionController({
        camera: this.camera,
        scene: this.scene,
        domElement: this.canvas,
        clickableBooks: allBooks,
        focusDistance: 3.8
      });

    } catch (err) {
      console.error('Error loading Goodreads live data:', err);
    }
  }

  initResizeObserver() {
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }
    });

    resizeObserver.observe(this.container);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };
}

new BookShowcaseApp('bookshelf-container', 'webgl-canvas');