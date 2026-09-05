/**
 * App - Coordinator connecting HandTracker, CubeStudio, and Futuristic UI
 */
class App {
  constructor() {
    // DOM Elements
    this.video = document.getElementById('webcam');
    this.canvas3dContainer = document.getElementById('canvas-3d-container');
    this.canvasHud = document.getElementById('canvas-hud');
    this.ctxHud = this.canvasHud.getContext('2d');
    this.pipCanvas = document.getElementById('pip-canvas');
    this.airCursor = document.getElementById('air-cursor');
    this.cursorLabel = document.getElementById('cursor-label');

    // UI Status Chips
    this.camStatus = document.getElementById('cam-status');
    this.handStatus = document.getElementById('hand-status');
    this.gestureLabel = document.getElementById('detected-gesture-label');
    this.activeColorPreview = document.getElementById('active-color-preview');

    // UI Interactive Controls
    this.swatches = document.querySelectorAll('.swatch');
    this.sizePills = document.querySelectorAll('.pill-btn');
    this.btnSpawnCube = document.getElementById('btn-spawn-cube');
    this.btnClearPaint = document.getElementById('btn-clear-paint');
    this.btnAutoRotate = document.getElementById('btn-auto-rotate');
    this.rippleContainer = document.getElementById('touch-ripple-container');

    // State
    this.currentColor = '#ff0055';
    this.currentBrushSize = 18;
    this.isEraser = false;

    // Previous cursor position for delta tracking (rotation)
    this.prevCursorPos = null;
    this.lastPinchState = false;

    // Gesture Debounce & Color Toast Notification
    this.lastColorSwitchTime = 0;
    this.colorToast = document.getElementById('color-toast');
    this.toastColorDot = document.getElementById('toast-color-dot');
    this.toastColorName = document.getElementById('toast-color-name');
    this.toastTimeout = null;

    // Subsystems
    this.cubeStudio = null;
    this.handTracker = null;
    this.audioSynth = new SciFiAudio();

    this.init();
  }

  async init() {
    this.resizeHudCanvas();
    window.addEventListener('resize', () => this.resizeHudCanvas());

    // 1. Initialize 3D Cube Scene
    this.cubeStudio = new CubeStudio(this.canvas3dContainer);

    // 2. Setup UI Handlers
    this.setupUIHandlers();

    // 3. Initialize Hand Tracking & Camera
    this.handTracker = new HandTracker(this.video, this.pipCanvas, {
      smoothingFactor: 0.42
    });

    this.handTracker.onStatusCallback = (type, text, dotClass) => {
      this.updateStatusBadge(type, text, dotClass);
    };

    this.handTracker.onResultsCallback = (state) => {
      this.handleHandFrame(state);
    };

    try {
      await this.handTracker.init();
    } catch (e) {
      console.error('Initialization failed:', e);
    }
  }

  resizeHudCanvas() {
    this.canvasHud.width = window.innerWidth;
    this.canvasHud.height = window.innerHeight;
  }

  setupUIHandlers() {
    // Swatches
    this.swatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        this.selectSwatch(swatch);
        this.audioSynth.playChime(780);
      });
    });

    // Size Pills
    this.sizePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        this.sizePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentBrushSize = parseInt(pill.getAttribute('data-size'), 10);
        this.audioSynth.playBeep(440, 0.05);
      });
    });

    // Action Buttons
    if (this.btnSpawnCube) {
      this.btnSpawnCube.addEventListener('click', () => {
        this.cubeStudio.spawnNewCube();
        this.audioSynth.playPop();
        this.createRipple(window.innerWidth / 2, window.innerHeight / 2);
      });
    }

    if (this.btnClearPaint) {
      this.btnClearPaint.addEventListener('click', () => {
        this.cubeStudio.clearAllFaces();
        this.audioSynth.playBeep(320, 0.12);
      });
    }

    if (this.btnAutoRotate) {
      this.btnAutoRotate.addEventListener('click', () => {
        this.cubeStudio.autoRotate = !this.cubeStudio.autoRotate;
        this.btnAutoRotate.classList.toggle('active', this.cubeStudio.autoRotate);
        this.audioSynth.playBeep(600, 0.06);
      });
    }

    // Mouse fallback / testing: clicking on 3D canvas draws when mouse is held
    let isMouseDown = false;
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('.hud-header, .hud-palette, .hud-actions, .webcam-pip-card, .hud-guide-bar')) return;
      isMouseDown = true;
    });
    window.addEventListener('mouseup', () => (isMouseDown = false));
    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const hit = this.cubeStudio.raycast({ x: e.clientX, y: e.clientY });
      if (hit) {
        this.cubeStudio.paintAtIntersection(hit, this.currentColor, this.currentBrushSize, this.isEraser);
      } else {
        this.cubeStudio.rotateCube(e.movementX * 1.5, e.movementY * 1.5);
      }
    });
  }

  selectSwatch(swatch) {
    this.swatches.forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');

    const color = swatch.getAttribute('data-color');
    this.isEraser = swatch.classList.contains('swatch-eraser');
    this.currentColor = color;

    document.documentElement.style.setProperty('--active-color', color);
    if (this.activeColorPreview) {
      this.activeColorPreview.style.background = this.isEraser ? '#fff' : color;
      this.activeColorPreview.style.boxShadow = this.isEraser ? 'none' : `0 0 10px ${color}`;
    }
  }

  updateStatusBadge(type, text, dotClass) {
    const chip = type === 'camera' ? this.camStatus : this.handStatus;
    if (!chip) return;
    const dot = chip.querySelector('.status-dot');
    const textEl = chip.querySelector('.status-text');

    dot.className = 'status-dot ' + (dotClass || '');
    textEl.textContent = text;
  }

  cycleNextColor() {
    const swatchesArray = Array.from(this.swatches);
    const currentIndex = swatchesArray.findIndex((s) => s.classList.contains('active'));
    const nextIndex = (currentIndex + 1) % swatchesArray.length;
    const nextSwatch = swatchesArray[nextIndex];
    this.selectSwatch(nextSwatch);
    this.audioSynth.playChime(650 + ((nextIndex % 6) * 50));
    this.showColorToast(nextSwatch.getAttribute('data-color'), nextSwatch.getAttribute('title') || 'Color');
  }

  showColorToast(color, name) {
    if (!this.colorToast) return;
    this.toastColorDot.style.backgroundColor = color;
    this.toastColorDot.style.boxShadow = `0 0 10px ${color}`;
    this.toastColorName.textContent = `Color: ${name} ✌️`;
    this.colorToast.classList.add('show');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.colorToast.classList.remove('show');
    }, 1200);
  }

  handleHandFrame(state) {
    // Clear 2D HUD canvas every frame
    this.ctxHud.clearRect(0, 0, this.canvasHud.width, this.canvasHud.height);

    if (state.handsDetected === 0) {
      this.airCursor.classList.remove('active', 'pinching');
      this.gestureLabel.textContent = 'Gesture: None';
      this.prevCursorPos = null;
      return;
    }

    // Hands detected!
    this.updateStatusBadge('hand', `${state.handsDetected} Hand${state.handsDetected > 1 ? 's' : ''} Detected`, 'active');
    this.airCursor.classList.add('active');

    const cursorPos = state.cursorScreenPos;
    this.airCursor.style.transform = `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`;

    // Detect Active Gesture label for HUD
    let gestureName = 'Hovering';
    if (state.isPeaceSign) gestureName = 'Peace Sign ✌️ (Change Colour)';
    else if (state.isThumbMiddlePinch) gestureName = 'Thumb-Middle Snap (Change Colour)';
    else if (state.isPinching) gestureName = 'Pinching 🤏 (Rotate Cube)';
    else if (state.isPointing) gestureName = 'Fingertip ☝️ (Painting)';
    else if (state.isOpenPalm) gestureName = 'Open Palm';
    else if (state.isFist) gestureName = 'Fist';
    this.gestureLabel.textContent = `Gesture: ${gestureName}`;

    // Update air cursor visual state
    this.airCursor.classList.toggle('pinching', state.isPinching);

    // GESTURE 1: CHANGE COLOURS (✌️ Peace Sign or 👌 Thumb+Middle Snap)
    const now = performance.now();
    if (state.isPeaceSign || state.isThumbMiddlePinch) {
      if (now - this.lastColorSwitchTime > 450) {
        this.lastColorSwitchTime = now;
        this.cycleNextColor();
        this.createRipple(cursorPos.x, cursorPos.y);
      }
      this.cursorLabel.textContent = 'COLOR ✌️';
    }
    // GESTURE 2: PINCH TO ROTATE CUBE (🤏 Thumb + Index Pinch)
    else if (state.isPinching) {
      // Check if hovering over UI buttons / swatches for mid-air click
      this.handleAirTouchUI(cursorPos, state.isPinching);

      // Drag to rotate the 3D cube in mid-air
      if (this.prevCursorPos) {
        const dx = cursorPos.x - this.prevCursorPos.x;
        const dy = cursorPos.y - this.prevCursorPos.y;
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
          this.cubeStudio.autoRotate = false;
          if (this.btnAutoRotate) this.btnAutoRotate.classList.remove('active');
          this.cubeStudio.rotateCube(dx * 2.0, dy * 2.0);
        }
      }
      this.cursorLabel.textContent = 'ROTATE 🤏';

      // Audio cue when pinch starts
      if (!this.lastPinchState) {
        this.audioSynth.playPop();
        this.createRipple(cursorPos.x, cursorPos.y);
      }
    }
    // GESTURE 3: FINGERTIPS TO PAINT (☝️ Extended Index Fingertip on Cube)
    else if (state.isPointing) {
      const hit = this.cubeStudio.raycast(cursorPos);
      if (hit) {
        this.drawTargetingLine(cursorPos.x, cursorPos.y, hit.point);
        this.cubeStudio.autoRotate = false;
        if (this.btnAutoRotate) this.btnAutoRotate.classList.remove('active');
        this.cubeStudio.paintAtIntersection(hit, this.currentColor, this.currentBrushSize, this.isEraser);
        this.drawPaintSparks(cursorPos.x, cursorPos.y);
        this.cursorLabel.textContent = 'PAINT 🖌️';
      } else {
        this.cursorLabel.textContent = 'POINT ☝️';
      }
    } else {
      this.cursorLabel.textContent = 'POINT ☝️';
      // Still raycast to show 3D surface ring preview
      this.cubeStudio.raycast(cursorPos);
    }

    // GESTURE 4: TWO-HAND SCALE (If 2 hands are present and expanding)
    if (state.twoHandDistance !== null && state.twoHandDistance > 0.05) {
      const scaleMultiplier = (state.twoHandDistance - 0.1) * 3.5;
      this.cubeStudio.setCubeScale(scaleMultiplier);
    }

    this.lastPinchState = state.isPinching;
    this.prevCursorPos = { x: cursorPos.x, y: cursorPos.y };
  }

  handleAirTouchUI(cursorPos, isPinching) {
    const el = document.elementFromPoint(cursorPos.x, cursorPos.y);
    const targetInteractive = el ? el.closest('.hud-btn, .swatch, .pill-btn') : null;

    if (targetInteractive) {
      targetInteractive.classList.add('air-hover');

      // If newly pinched over the element, trigger click!
      if (isPinching && !this.lastPinchState) {
        targetInteractive.click();
        this.createRipple(cursorPos.x, cursorPos.y);
      }
    } else {
      document.querySelectorAll('.air-hover').forEach((e) => e.classList.remove('air-hover'));
    }
  }

  drawTargetingLine(startX, startY, hit3dPoint) {
    // Project 3D hit point back to screen
    const p = hit3dPoint.clone().project(this.cubeStudio.camera);
    const targetX = ((p.x + 1) * window.innerWidth) / 2;
    const targetY = ((-p.y + 1) * window.innerHeight) / 2;

    const ctx = this.ctxHud;
    ctx.save();
    ctx.strokeStyle = this.currentColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    // Target crosshair
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawPaintSparks(x, y) {
    const ctx = this.ctxHud;
    ctx.save();
    ctx.fillStyle = this.currentColor;
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 18 + 5;
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.random() * 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  createRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple-circle';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = '60px';
    ripple.style.height = '60px';
    this.rippleContainer.appendChild(ripple);

    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 650);
  }
}

/**
 * Procedural Web Audio API Synthesizer (Instant sci-fi UI sound effects)
 */
class SciFiAudio {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBeep(freq = 440, duration = 0.08) {
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playPop() {
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  playChime(freq = 640) {
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch (e) {}
  }
}

// Launch Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.airCubeApp = new App();
});
