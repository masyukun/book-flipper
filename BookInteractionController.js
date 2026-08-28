import * as THREE from 'three';
import gsap from 'gsap';

export class BookInteractionController {
  /**
   * @param {Object} params
   * @param {THREE.Camera} params.camera
   * @param {THREE.Scene} params.scene
   * @param {HTMLElement} params.domElement - The renderer canvas element
   * @param {Array<THREE.Mesh>} params.clickableBooks
   * @param {number} [params.focusDistance=3.8] - Default distance fallback
   * @param {number} [params.hoverLift=0.08] - Vertical lift distance on hover
   */
  constructor({
    camera,
    scene,
    domElement,
    clickableBooks = [],
    focusDistance = 3.8,
    hoverLift = 0.08
  }) {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    this.clickableBooks = clickableBooks;
    this.focusDistance = focusDistance;
    this.hoverLift = hoverLift;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerDownPos = new THREE.Vector2();
    this.lastPointerPos = new THREE.Vector2();

    this.activeBook = null;
    this.hoveredBook = null;
    this.isAnimating = false;
    this.isFlipped = false;

    // Pan & Zoom state for focused inspection
    this.zoomLevel = 1.0;
    this.minZoom = 0.6;
    this.maxZoom = 3.0;
    this.panOffset = new THREE.Vector2(0, 0); // Screen-space X/Y offset
    this.isDragging = false;
    this.isPointerDownOnBook = false;

    // Helper dummy object for calculating camera-relative orientation
    this.cameraRig = new THREE.Object3D();
    this.camera.add(this.cameraRig);

    this.initEventListeners();
  }

  initEventListeners() {
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onWheel = this.onWheel.bind(this);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  updateMouseCoords(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Calculates the base focus distance based on book height and camera FOV
   */
  getBaseFocusDistance(bookMesh = this.activeBook) {
    if (bookMesh && bookMesh.userData?.dimensions) {
      const bookHeight = bookMesh.userData.dimensions.height || 2.1;
      const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
      const targetScreenCoverage = 0.65;
      return (bookHeight / (2 * Math.tan(vFovRad / 2))) / targetScreenCoverage;
    }
    return this.focusDistance;
  }

  /**
   * Calculates world position and quaternion for the focused book
   */
  calculateFocusTransform(flipped = this.isFlipped, bookMesh = this.activeBook) {
    const baseDist = this.getBaseFocusDistance(bookMesh);
    const currentDist = baseDist / this.zoomLevel;

    // Position camera rig with pan and zoom applied in camera space
    this.cameraRig.position.set(this.panOffset.x, this.panOffset.y, -currentDist);

    // End-over-end flip (+Y faces camera, flipped on Z)
    const flipAngle = flipped ? Math.PI : 0;
    this.cameraRig.rotation.set(Math.PI / 2, 0, flipAngle);
    this.cameraRig.updateMatrixWorld();

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    this.cameraRig.getWorldPosition(targetPos);
    this.cameraRig.getWorldQuaternion(targetQuat);

    return { targetPos, targetQuat, currentDist };
  }

  onWheel(event) {
    if (!this.activeBook || this.isAnimating) return;

    // Prevent full-page scroll while interacting with the book
    event.preventDefault();

    const zoomDelta = -event.deltaY * 0.0015;
    const nextZoom = THREE.MathUtils.clamp(this.zoomLevel + zoomDelta, this.minZoom, this.maxZoom);

    if (nextZoom === this.zoomLevel) return;
    this.zoomLevel = nextZoom;

    const { targetPos } = this.calculateFocusTransform();

    gsap.to(this.activeBook.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto'
    });
  }

  onPointerDown(event) {
    this.pointerDownPos.set(event.clientX, event.clientY);
    this.lastPointerPos.set(event.clientX, event.clientY);
    this.isDragging = false;

    if (this.activeBook && !this.isAnimating) {
      this.updateMouseCoords(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.activeBook, false);

      if (intersects.length > 0) {
        this.isPointerDownOnBook = true;
      }
    }
  }

  onPointerMove(event) {
    if (this.isAnimating) return;

    // 1. Dragging / Panning the focused book
    if (this.isPointerDownOnBook && this.activeBook) {
      const deltaX = event.clientX - this.lastPointerPos.x;
      const deltaY = event.clientY - this.lastPointerPos.y;

      const totalDistMoved = this.pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
      if (!this.isDragging && totalDistMoved > 4) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        this.domElement.style.cursor = 'grabbing';

        const rect = this.domElement.getBoundingClientRect();
        const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const { currentDist } = this.calculateFocusTransform();

        // Convert pixel delta into camera-plane world distance
        const visibleHeight = 2 * currentDist * Math.tan(vFovRad / 2);
        const visibleWidth = visibleHeight * (rect.width / rect.height);

        const worldDeltaX = (deltaX / rect.width) * visibleWidth;
        const worldDeltaY = -(deltaY / rect.height) * visibleHeight;

        this.panOffset.x += worldDeltaX;
        this.panOffset.y += worldDeltaY;

        // Apply immediately during drag
        const { targetPos } = this.calculateFocusTransform();
        this.activeBook.position.copy(targetPos);
      }

      this.lastPointerPos.set(event.clientX, event.clientY);
      return;
    }

    // 2. Regular hover state tracking
    this.updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableBooks, false);

    if (this.activeBook) {
      if (intersects.length > 0 && intersects[0].object === this.activeBook) {
        this.domElement.style.cursor = 'grab';
      } else {
        this.domElement.style.cursor = 'default';
      }
      return;
    }

    // Stack Hovering
    if (intersects.length > 0) {
      const hitBook = intersects[0].object;
      if (this.hoveredBook !== hitBook) {
        this.clearHover();
        this.setHover(hitBook);
      }
      this.domElement.style.cursor = 'pointer';
    } else {
      if (this.hoveredBook) this.clearHover();
      this.domElement.style.cursor = 'default';
    }
  }

  onPointerUp(event) {
    const wasDragging = this.isDragging;
    this.isDragging = false;
    this.isPointerDownOnBook = false;

    if (this.isAnimating) return;

    // If the user was dragging the book, don't trigger a flip or unfocus
    if (wasDragging) {
      if (this.activeBook) this.domElement.style.cursor = 'grab';
      return;
    }

    this.updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableBooks, false);

    if (intersects.length > 0) {
      const hitBook = intersects[0].object;
      if (this.activeBook === hitBook) {
        // Quick click on the focused book flips it
        this.flipBook();
      } else {
        this.focusBook(hitBook);
      }
    } else if (this.activeBook) {
      // Clicked outside the book -> return to stack
      this.unfocusCurrentBook();
    }
  }

  setHover(bookMesh) {
    this.hoveredBook = bookMesh;
    const restY = bookMesh.userData.restPosition.y;

    gsap.to(bookMesh.position, {
      y: restY + this.hoverLift,
      duration: 0.25,
      ease: 'power2.out',
      overwrite: 'auto'
    });
  }

  clearHover() {
    if (!this.hoveredBook) return;
    const book = this.hoveredBook;
    const restY = book.userData.restPosition.y;
    this.hoveredBook = null;

    gsap.to(book.position, {
      y: restY,
      duration: 0.25,
      ease: 'power2.inOut',
      overwrite: 'auto'
    });
  }

  focusBook(bookMesh) {
    this.isAnimating = true;
    this.isFlipped = false;
    this.zoomLevel = 1.0;
    this.panOffset.set(0, 0);

    if (this.hoveredBook === bookMesh) {
      this.hoveredBook = null;
      bookMesh.position.y = bookMesh.userData.restPosition.y;
    }

    if (this.activeBook && this.activeBook !== bookMesh) {
      this.returnBookToStack(this.activeBook);
    }

    this.activeBook = bookMesh;

    if (!bookMesh.userData.originalParent) {
      bookMesh.userData.originalParent = bookMesh.parent;
    }

    this.scene.attach(bookMesh);

    const { targetPos, targetQuat } = this.calculateFocusTransform(false, bookMesh);

    const startQuat = bookMesh.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        bookMesh.userData.isFocused = true;
        this.domElement.style.cursor = 'grab';
      }
    })
      .to(bookMesh.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.85,
        ease: 'power3.out'
      }, 0)
      .to(animProxy, {
        progress: 1,
        duration: 0.85,
        ease: 'power3.out',
        onUpdate: () => {
          bookMesh.quaternion.slerpQuaternions(startQuat, targetQuat, animProxy.progress);
        }
      }, 0);
  }

  flipBook() {
    if (!this.activeBook || this.isAnimating) return;

    this.isAnimating = true;
    this.isFlipped = !this.isFlipped;

    const { targetQuat } = this.calculateFocusTransform(this.isFlipped, this.activeBook);
    const startQuat = this.activeBook.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.to(animProxy, {
      progress: 1,
      duration: 0.75,
      ease: 'back.out(1.15)',
      onUpdate: () => {
        this.activeBook.quaternion.slerpQuaternions(startQuat, targetQuat, animProxy.progress);
      },
      onComplete: () => {
        this.isAnimating = false;
      }
    });
  }

  returnBookToStack(bookMesh) {
    const originalParent = bookMesh.userData.originalParent;
    const restPos = bookMesh.userData.restPosition;
    const restRot = bookMesh.userData.restRotation;

    const targetWorldPos = restPos.clone();
    originalParent.localToWorld(targetWorldPos);

    const targetWorldQuat = new THREE.Quaternion().setFromEuler(restRot);
    targetWorldQuat.premultiply(originalParent.quaternion);

    const startQuat = bookMesh.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.timeline({
      onComplete: () => {
        originalParent.attach(bookMesh);
        bookMesh.position.copy(restPos);
        bookMesh.rotation.copy(restRot);
        bookMesh.userData.isFocused = false;
      }
    })
      .to(bookMesh.position, {
        x: targetWorldPos.x,
        y: targetWorldPos.y,
        z: targetWorldPos.z,
        duration: 0.65,
        ease: 'power2.inOut'
      }, 0)
      .to(animProxy, {
        progress: 1,
        duration: 0.65,
        ease: 'power2.inOut',
        onUpdate: () => {
          bookMesh.quaternion.slerpQuaternions(startQuat, targetWorldQuat, animProxy.progress);
        }
      }, 0);
  }

  unfocusCurrentBook() {
    if (!this.activeBook || this.isAnimating) return;

    this.isAnimating = true;
    const book = this.activeBook;
    this.activeBook = null;
    this.isFlipped = false;
    this.zoomLevel = 1.0;
    this.panOffset.set(0, 0);
    this.domElement.style.cursor = 'default';

    this.returnBookToStack(book);
    setTimeout(() => {
      this.isAnimating = false;
    }, 650);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.camera.remove(this.cameraRig);
    this.domElement.style.cursor = 'default';
  }
}