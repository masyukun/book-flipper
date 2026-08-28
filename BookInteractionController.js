import * as THREE from 'three';
import gsap from 'gsap';

export class BookInteractionController {
  /**
   * @param {Object} params
   * @param {THREE.Camera} params.camera
   * @param {THREE.Scene} params.scene
   * @param {HTMLElement} params.domElement - The renderer canvas element
   * @param {Array<THREE.Mesh>} params.clickableBooks
   * @param {number} [params.focusDistance=1.2] - Distance from camera when focused
   */
  constructor({ camera, scene, domElement, clickableBooks = [], focusDistance = 1.2 }) {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    this.clickableBooks = clickableBooks;
    this.focusDistance = focusDistance;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerDownPos = new THREE.Vector2();

    this.activeBook = null;
    this.isAnimating = false;
    this.isFlipped = false;

    // Helper dummy object for calculating camera-relative orientation
    this.cameraRig = new THREE.Object3D();
    this.camera.add(this.cameraRig);

    this.initEventListeners();
  }

  initEventListeners() {
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
  }

  onPointerDown(event) {
    this.pointerDownPos.set(event.clientX, event.clientY);
  }

  onPointerUp(event) {
    // Prevent raycast trigger if the user was dragging OrbitControls
    const moveDistance = this.pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    if (moveDistance > 5) return;

    if (this.isAnimating) return;

    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableBooks, false);

    if (intersects.length > 0) {
      const hitBook = intersects[0].object;
      if (this.activeBook === hitBook) {
        // Clicking the currently focused book flips it
        this.flipBook();
      } else {
        // Focus new book (or switch directly from another)
        this.focusBook(hitBook);
      }
    } else if (this.activeBook) {
      // Clicking empty space closes the focused book
      this.unfocusCurrentBook();
    }
  }

  /**
   * Calculates the world position and quaternion for viewing the book
   * @param {boolean} flipped - False for front cover, True for back cover
   * @param {THREE.Mesh} [bookMesh] - The book being viewed (to measure dimensions)
   */
  calculateFocusTransform(flipped = false, bookMesh = this.activeBook) {
    // 1. Calculate dynamic distance based on book height and camera FOV
    let distance = this.focusDistance;

    if (bookMesh && bookMesh.userData?.dimensions) {
      const bookHeight = bookMesh.userData.dimensions.height || 2.1;
      const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
      const targetScreenCoverage = 0.65; // Book takes up 65% of screen height
      
      distance = (bookHeight / (2 * Math.tan(vFovRad / 2))) / targetScreenCoverage;
    }

    // 2. Position dummy rig in front of camera
    this.cameraRig.position.set(0, 0, -distance);

    const flipAngle = flipped ? Math.PI : 0;
    this.cameraRig.rotation.set(-Math.PI / 2, 0, flipAngle);
    this.cameraRig.updateMatrixWorld();

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    this.cameraRig.getWorldPosition(targetPos);
    this.cameraRig.getWorldQuaternion(targetQuat);

    return { targetPos, targetQuat };
  }

  /**
   * Brings a book from its stack position to focus in front of the camera
   */
  focusBook(bookMesh) {
    this.isAnimating = true;
    this.isFlipped = false;

    // If another book is active, return it to its stack first
    if (this.activeBook && this.activeBook !== bookMesh) {
      this.returnBookToStack(this.activeBook);
    }

    this.activeBook = bookMesh;

    // Cache original parent (the stack group) to restore hierarchy later
    if (!bookMesh.userData.originalParent) {
      bookMesh.userData.originalParent = bookMesh.parent;
    }

    // Attach to root scene so transforms aren't skewed by stack group positioning
    this.scene.attach(bookMesh);

    const { targetPos, targetQuat } = this.calculateFocusTransform(false, bookMesh);

    // Interpolation proxies for smooth quaternion slerp
    const startQuat = bookMesh.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
        bookMesh.userData.isFocused = true;
      }
    })
      .to(bookMesh.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 0.9,
        ease: 'power3.out'
      }, 0)
      .to(animProxy, {
        progress: 1,
        duration: 0.9,
        ease: 'power3.out',
        onUpdate: () => {
          bookMesh.quaternion.slerpQuaternions(startQuat, targetQuat, animProxy.progress);
        }
      }, 0);
  }

  /**
   * Flips the active book 180 degrees to show the back cover/metadata
   */
  flipBook() {
    if (!this.activeBook || this.isAnimating) return;

    this.isAnimating = true;
    this.isFlipped = !this.isFlipped;

    const { targetQuat } = this.calculateFocusTransform(this.isFlipped);
    const startQuat = this.activeBook.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.to(animProxy, {
      progress: 1,
      duration: 0.8,
      ease: 'back.out(1.2)',
      onUpdate: () => {
        this.activeBook.quaternion.slerpQuaternions(startQuat, targetQuat, animProxy.progress);
      },
      onComplete: () => {
        this.isAnimating = false;
      }
    });
  }

  /**
   * Returns a specific book mesh to its original stack location
   */
  returnBookToStack(bookMesh) {
    const originalParent = bookMesh.userData.originalParent;
    const restPos = bookMesh.userData.restPosition;
    const restRot = bookMesh.userData.restRotation;

    // Convert local resting transform to world space
    const targetWorldPos = restPos.clone();
    originalParent.localToWorld(targetWorldPos);

    const targetWorldQuat = new THREE.Quaternion().setFromEuler(restRot);
    targetWorldQuat.premultiply(originalParent.quaternion);

    const startQuat = bookMesh.quaternion.clone();
    const animProxy = { progress: 0 };

    gsap.timeline({
      onComplete: () => {
        // Re-attach book back to its original stack group
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
        duration: 0.7,
        ease: 'power2.inOut'
      }, 0)
      .to(animProxy, {
        progress: 1,
        duration: 0.7,
        ease: 'power2.inOut',
        onUpdate: () => {
          bookMesh.quaternion.slerpQuaternions(startQuat, targetWorldQuat, animProxy.progress);
        }
      }, 0);
  }

  /**
   * Closes the active book and clears selection
   */
  unfocusCurrentBook() {
    if (!this.activeBook || this.isAnimating) return;

    this.isAnimating = true;
    const book = this.activeBook;
    this.activeBook = null;
    this.isFlipped = false;

    this.returnBookToStack(book);
    setTimeout(() => {
      this.isAnimating = false;
    }, 700);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.camera.remove(this.cameraRig);
  }
}