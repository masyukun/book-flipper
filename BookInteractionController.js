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

    this.activeBook = null;
    this.hoveredBook = null;
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
    this._onPointerMove = this.onPointerMove.bind(this);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
  }

  updateMouseCoords(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onPointerMove(event) {
    if (this.isAnimating) return;

    this.updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableBooks, false);

    // 1. Hovering while a book is in focus
    if (this.activeBook) {
      if (intersects.length > 0 && intersects[0].object === this.activeBook) {
        this.domElement.style.cursor = 'pointer'; // Ready to flip
      } else {
        this.domElement.style.cursor = 'default';
      }
      return;
    }

    // 2. Hovering books in the stack
    if (intersects.length > 0) {
      const hitBook = intersects[0].object;

      if (this.hoveredBook !== hitBook) {
        this.clearHover();
        this.setHover(hitBook);
      }
      this.domElement.style.cursor = 'pointer';
    } else {
      if (this.hoveredBook) {
        this.clearHover();
      }
      this.domElement.style.cursor = 'default';
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

  onPointerDown(event) {
    this.pointerDownPos.set(event.clientX, event.clientY);
  }

  onPointerUp(event) {
    const moveDistance = this.pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    if (moveDistance > 5 || this.isAnimating) return;

    this.updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickableBooks, false);

    if (intersects.length > 0) {
      const hitBook = intersects[0].object;
      if (this.activeBook === hitBook) {
        this.flipBook();
      } else {
        this.focusBook(hitBook);
      }
    } else if (this.activeBook) {
      this.unfocusCurrentBook();
    }
  }

  calculateFocusTransform(flipped = false, bookMesh = this.activeBook) {
    let distance = this.focusDistance;

    if (bookMesh && bookMesh.userData?.dimensions) {
      const bookHeight = bookMesh.userData.dimensions.height || 2.1;
      const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
      const targetScreenCoverage = 0.65;
      distance = (bookHeight / (2 * Math.tan(vFovRad / 2))) / targetScreenCoverage;
    }

    this.cameraRig.position.set(0, 0, -distance);

    // Math.PI / 2 points the front cover (+Y) toward the camera.
    // flipAngle rotates around Z by 180° to show the back cover upright.
    const flipAngle = flipped ? Math.PI : 0;
    this.cameraRig.rotation.set(Math.PI / 2, 0, flipAngle);
    this.cameraRig.updateMatrixWorld();

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    this.cameraRig.getWorldPosition(targetPos);
    this.cameraRig.getWorldQuaternion(targetQuat);

    return { targetPos, targetQuat };
  }

  focusBook(bookMesh) {
    this.isAnimating = true;
    this.isFlipped = false;

    // Reset hover state so the mesh doesn't retain the +Y hover offset
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
    this.camera.remove(this.cameraRig);
    this.domElement.style.cursor = 'default';
  }
}