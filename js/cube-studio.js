/**
 * CubeStudio - 3D Scene Manager, Dynamic Texture Painting & Raycasting
 */
class CubeStudio {
  constructor(containerElement) {
    this.container = containerElement;

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raycaster = new THREE.Raycaster();
    this.cube = null;
    this.cubeEdges = null;
    this.cursorRingMesh = null;

    // Face Canvases (6 faces: Right, Left, Top, Bottom, Front, Back)
    this.faceCanvases = [];
    this.faceContexts = [];
    this.faceTextures = [];
    this.faceMaterials = [];
    this.canvasResolution = 1024; // High-res paint canvas

    // Interaction & Animation States
    this.lastPaint = null; // { faceIndex, x, y, timestamp }
    this.targetRotation = { x: 0.35, y: 0.45 };
    this.autoRotate = true;
    this.cubeBaseSize = 2.4;
    this.currentScale = 1.0;
    this.targetScale = 1.0;

    // Particle field in background
    this.particles = null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x090c15, 0.04);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 7.2);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting (Dramatic cyber studio lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00f2fe, 1.2);
    dirLight1.position.set(5, 8, 5);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff007f, 0.8);
    dirLight2.position.set(-5, -6, -4);
    this.scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.6, 12);
    pointLight.position.set(0, 0, 4.5);
    this.scene.add(pointLight);

    // 5. Holographic Background Floating Particles
    this.createBackgroundParticles();

    // 6. Create 3D Paintable Cube with 6 Dynamic Canvases
    this.createPaintableCube();

    // 7. Surface Hover Cursor Ring
    this.createHoverCursor();

    // Resize Handler
    window.addEventListener('resize', () => this.onResize());

    // Render loop
    this.animate();
  }

  createBackgroundParticles() {
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 16;
      positions[i + 1] = (Math.random() - 0.5) * 12;
      positions[i + 2] = (Math.random() - 0.5) * 10 - 2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x4facfe,
      size: 0.04,
      transparent: true,
      opacity: 0.45
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  createPaintableCube() {
    const faceLabels = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
    const geometry = new THREE.BoxGeometry(this.cubeBaseSize, this.cubeBaseSize, this.cubeBaseSize);

    this.faceMaterials = [];
    this.faceCanvases = [];
    this.faceContexts = [];
    this.faceTextures = [];

    // Create a 2D offscreen canvas for each of the 6 cube faces
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvasResolution;
      canvas.height = this.canvasResolution;
      const ctx = canvas.getContext('2d');

      this.faceCanvases.push(canvas);
      this.faceContexts.push(ctx);

      // Draw initial face design
      this.resetFaceCanvas(ctx, faceLabels[i]);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.faceTextures.push(texture);

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.25,
        metalness: 0.15,
        bumpScale: 0.05
      });
      this.faceMaterials.push(mat);
    }

    if (this.cube) {
      this.scene.remove(this.cube);
    }

    this.cube = new THREE.Mesh(geometry, this.faceMaterials);
    this.cube.rotation.x = this.targetRotation.x;
    this.cube.rotation.y = this.targetRotation.y;
    this.scene.add(this.cube);

    // Glowing wireframe edges
    const edgeGeo = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f2fe,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    this.cubeEdges = new THREE.LineSegments(edgeGeo, edgeMat);
    this.cube.add(this.cubeEdges);
  }

  resetFaceCanvas(ctx, label) {
    const res = this.canvasResolution;

    const grad = ctx.createLinearGradient(0, 0, res, res);
    grad.addColorStop(0, '#101626');
    grad.addColorStop(1, '#0b0f1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, res, res);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 4;
    const step = res / 8;
    for (let x = 0; x <= res; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, res);
      ctx.stroke();
    }
    for (let y = 0; y <= res; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(res, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
    ctx.lineWidth = 12;
    ctx.strokeRect(16, 16, res - 32, res - 32);

    ctx.save();
    ctx.font = 'bold 42px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, res / 2, res / 2);
    ctx.restore();
  }

  clearAllFaces() {
    const faceLabels = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
    for (let i = 0; i < 6; i++) {
      this.resetFaceCanvas(this.faceContexts[i], faceLabels[i]);
      this.faceTextures[i].needsUpdate = true;
    }
    this.lastPaint = null;
  }

  createHoverCursor() {
    const geometry = new THREE.RingGeometry(0.08, 0.12, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.cursorRingMesh = new THREE.Mesh(geometry, material);
    this.cursorRingMesh.visible = false;
    this.scene.add(this.cursorRingMesh);
  }

  raycast(screenPos) {
    if (!this.cube) return null;

    const ndcX = (screenPos.x / window.innerWidth) * 2 - 1;
    const ndcY = -(screenPos.y / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const intersects = this.raycaster.intersectObject(this.cube);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (this.cursorRingMesh) {
        this.cursorRingMesh.visible = true;
        this.cursorRingMesh.position.copy(hit.point).add(hit.face.normal.clone().multiplyScalar(0.02));
        this.cursorRingMesh.lookAt(hit.point.clone().add(hit.face.normal));
      }
      return hit;
    } else {
      if (this.cursorRingMesh) {
        this.cursorRingMesh.visible = false;
      }
      this.lastPaint = null;
      return null;
    }
  }

  paintAtIntersection(hit, color, brushSize, isEraser = false) {
    if (!hit || !hit.uv || !hit.face) return;

    const materialIndex = typeof hit.face.materialIndex === 'number' ? hit.face.materialIndex : 0;
    const ctx = this.faceContexts[materialIndex];
    const texture = this.faceTextures[materialIndex];
    if (!ctx || !texture) return;

    const res = this.canvasResolution;
    const px = hit.uv.x * res;
    const py = (1.0 - hit.uv.y) * res;

    const scaledSize = brushSize * (res / 360);

    ctx.save();
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(px, py, scaledSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = scaledSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = scaledSize * 0.4;

      const now = performance.now();
      if (this.lastPaint && this.lastPaint.faceIndex === materialIndex && (now - this.lastPaint.time < 150)) {
        ctx.beginPath();
        ctx.moveTo(this.lastPaint.x, this.lastPaint.y);
        ctx.lineTo(px, py);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, scaledSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      this.lastPaint = {
        faceIndex: materialIndex,
        x: px,
        y: py,
        time: now
      };
    }
    ctx.restore();

    texture.needsUpdate = true;
  }

  spawnNewCube() {
    this.createPaintableCube();
    this.currentScale = 0.05;
    this.targetScale = 1.0;
    this.cube.rotation.set(0.3, 0.4, 0);
  }

  setCubeScale(scaleMultiplier) {
    this.targetScale = Math.max(0.4, Math.min(2.2, scaleMultiplier));
  }

  rotateCube(deltaX, deltaY) {
    if (!this.cube) return;
    this.cube.rotation.y += deltaX * 0.01;
    this.cube.rotation.x += deltaY * 0.01;
    this.targetRotation.x = this.cube.rotation.x;
    this.targetRotation.y = this.cube.rotation.y;
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    if (this.camera && this.renderer) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.currentScale += (this.targetScale - this.currentScale) * 0.12;
    if (this.cube) {
      this.cube.scale.set(this.currentScale, this.currentScale, this.currentScale);
    }

    if (this.autoRotate && this.cube) {
      this.cube.rotation.y += 0.004;
      this.cube.rotation.x = 0.35 + Math.sin(performance.now() * 0.0008) * 0.08;
    }

    if (this.particles) {
      this.particles.rotation.y += 0.0005;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
