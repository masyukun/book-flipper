import * as THREE from 'three';
import { createBookStack } from './BookStackModule.js';
import { attachDynamicBackCover } from './BackCoverGenerator.js';
import { BookInteractionController } from './BookInteractionController.js';

class BookShowcaseApp {
  constructor(containerId, canvasId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId);

    this.initScene();
    this.initLighting();
    this.initPlatforms();
    this.loadShelfData();
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
    // Soft ambient fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    // Key directional light with soft shadow mapping
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 3;
    this.scene.add(keyLight);

    // Cool rim light for book edge highlights
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

    // Left platform ("To Read")
    const leftPlatform = new THREE.Mesh(platformGeo, platformMat);
    leftPlatform.position.set(-1.8, -0.075, 0);
    leftPlatform.receiveShadow = true;
    this.scene.add(leftPlatform);

    // Right platform ("Completed")
    const rightPlatform = new THREE.Mesh(platformGeo, platformMat);
    rightPlatform.position.set(1.8, -0.075, 0);
    rightPlatform.receiveShadow = true;
    this.scene.add(rightPlatform);
  }

  async loadShelfData() {
    // Mock data (replace with your backend API endpoint)
    const tbrBooks = [
      { id: 1, title: 'Klara and the Sun', author: 'Kazuo Ishiguro', pageCount: 303, rating: 3.75, ratingsCount: 340000, description: 'The story of Klara, an Artificial Friend with outstanding observational qualities.', coverUrl: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1603206535i/54120408.jpg' },
      { id: 2, title: 'Piranesi', author: 'Susanna Clarke', pageCount: 245, rating: 4.24, ratingsCount: 420000, description: 'Piranesi lives in the House. Perhaps he always has.', coverUrl: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1589640985i/50202953.jpg' },
      { id: 3, title: 'Exhalation', author: 'Ted Chiang', pageCount: 352, rating: 4.31, ratingsCount: 120000, description: 'A collection of nine groundbreaking science fiction short stories.', coverUrl: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1544426511i/41160292.jpg' }
    ];

    const completedBooks = [
      { id: 4, title: 'Project Hail Mary', author: 'Andy Weir', pageCount: 496, rating: 4.51, ratingsCount: 680000, description: 'Ryland Grace is the sole survivor on a desperate, last-chance mission.', coverUrl: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1597695864i/54493401.jpg', review: "Amaze! Amaze! Rocky is one of my favorite sci-fi characters ever written. Pure fun from start to finish." },
      { id: 5, title: 'Recursion', author: 'Blake Crouch', pageCount: 336, rating: 4.16, ratingsCount: 210000, description: 'Memory makes reality. That is what NYC cop Barry Sutton is learning.', coverUrl: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1543852086i/42046112.jpg' }
    ];

    // Build stacks on top of the pedestals (Y = 0)
    const tbrStack = createBookStack(tbrBooks, new THREE.Vector3(-1.8, 0, 0));
    const completedStack = createBookStack(completedBooks, new THREE.Vector3(1.8, 0, 0));

    this.scene.add(tbrStack.group);
    this.scene.add(completedStack.group);

    const allBooks = [...tbrStack.bookMeshes, ...completedStack.bookMeshes];

    // Attach dynamic 2D canvas back covers
    allBooks.forEach(mesh => {
      attachDynamicBackCover(mesh, mesh.userData.metadata);
    });

    // Initialize the GSAP click & flip controller
    this.interactionController = new BookInteractionController({
      camera: this.camera,
      scene: this.scene,
      domElement: this.canvas,
      clickableBooks: allBooks,
      focusDistance: 1.15
    });
  }

  initResizeObserver() {
    // Watches the specific container box instead of window resize
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

// Instantiate once DOM is ready
new BookShowcaseApp('bookshelf-container', 'webgl-canvas');