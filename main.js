// ----------------------------------------------------------------------
// CONFIGURATION: Change this to any Goodreads user profile URL or ID
// ----------------------------------------------------------------------
export const GOODREADS_PROFILE = 'https://www.goodreads.com/user/show/5106656-matthew-royal';
export const MAX_BOOKS_PER_STACK = 6;
// ----------------------------------------------------------------------

import * as THREE from 'three';
import { createBookStack, createShingledShelf } from './BookStackModule.js';
import { attachDynamicCoversAndSpine } from './BackCoverGenerator.js';
import { BookInteractionController } from './BookInteractionController.js';
import { fetchGoodreadsShelf } from './GoodreadsService.js';
import { ModalController } from './ModalController.js';

class BookShowcaseApp {
  constructor(containerId, canvasId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId);

    this.modal = new ModalController();
    this.initScene();
    this.initLighting();
    this.initPlatforms();
    this.loadLiveData();
    this.initResizeObserver();
    this.initFullscreen();
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    
    // Raised camera slightly and shifted lookAt target from Y: 0.6 up to Y: 1.05
    this.camera.position.set(0, 3.0, 5.7);
    this.camera.lookAt(0, 1.50, 0);

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
      // 1. Fetch all 3 shelves in parallel
      const [tbrBooks, completedBooks, currentBooks] = await Promise.all([
        fetchGoodreadsShelf(GOODREADS_PROFILE, 'to-read', MAX_BOOKS_PER_STACK),
        fetchGoodreadsShelf(GOODREADS_PROFILE, 'read', MAX_BOOKS_PER_STACK),
        fetchGoodreadsShelf(GOODREADS_PROFILE, 'currently-reading', 6)
      ]);

      // Clear any existing meshes if retrying
      if (this.tbrGroup) this.scene.remove(this.tbrGroup);
      if (this.completedGroup) this.scene.remove(this.completedGroup);
      if (this.currentGroup) this.scene.remove(this.currentGroup);

      // 2. Build the two stacks and the floating shingled shelf
      const tbrStack = createBookStack(tbrBooks, new THREE.Vector3(-1.8, 0, 0));
      const completedStack = createBookStack(completedBooks, new THREE.Vector3(1.8, 0, 0));
      const currentShelf = createShingledShelf(currentBooks, new THREE.Vector3(0, 1.35, -1.6));

      this.tbrGroup = tbrStack.group;
      this.completedGroup = completedStack.group;
      this.currentGroup = currentShelf.group;

      this.scene.add(this.tbrGroup);
      this.scene.add(this.completedGroup);
      this.scene.add(this.currentGroup);

      // 3. Combine all meshes for unified textures and raycasting
      const allBooks = [
        ...tbrStack.bookMeshes,
        ...completedStack.bookMeshes,
        ...currentShelf.bookMeshes
      ];

      // 4. Attach matching dynamic spines, back covers, and sticky notes
      allBooks.forEach(mesh => {
        attachDynamicCoversAndSpine(mesh, mesh.userData.metadata);
      });

      if (this.interactionController) {
        this.interactionController.dispose();
      }

      // 5. Initialize interaction controller across all shelves
      this.interactionController = new BookInteractionController({
        camera: this.camera,
        scene: this.scene,
        domElement: this.canvas,
        clickableBooks: allBooks,
        focusDistance: 3.8
      });

      // Data loaded and rendered successfully
      this.modal.hide();

    } catch (err) {
      console.error('Error loading Goodreads shelves:', err);
      // Display burning book error modal with exact error status/message
      this.modal.showError(err.message, () => this.loadLiveData());
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

  initFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    if (!btn) return;

    const expandIcon = btn.querySelector('.icon-expand');
    const compressIcon = btn.querySelector('.icon-compress');

    const toggleFullscreen = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (this.container.requestFullscreen) {
          this.container.requestFullscreen();
        } else if (this.container.webkitRequestFullscreen) {
          this.container.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    };

    btn.addEventListener('click', toggleFullscreen);

    // Sync button icon state whenever entering or exiting fullscreen (including via Escape key)
    const onFullscreenChange = () => {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      expandIcon.style.display = isFullscreen ? 'none' : 'block';
      compressIcon.style.display = isFullscreen ? 'block' : 'none';
      btn.setAttribute('title', isFullscreen ? 'Exit Fullscreen (Esc)' : 'Toggle Fullscreen');
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };
}

new BookShowcaseApp('bookshelf-container', 'webgl-canvas');