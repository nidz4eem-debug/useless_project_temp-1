/**
 * HandTracker - MediaPipe Hands tracking with smoothing & gesture recognition
 */
class HandTracker {
  constructor(videoElement, pipCanvas, options = {}) {
    this.video = videoElement;
    this.pipCanvas = pipCanvas;
    this.pipCtx = pipCanvas ? pipCanvas.getContext('2d') : null;
    
    // Landmark smoothing factors (Exponential Moving Average)
    this.smoothingFactor = options.smoothingFactor || 0.45;
    this.prevLandmarks = [null, null]; // For up to 2 hands

    this.onResultsCallback = null;
    this.onStatusCallback = null;
    this.hands = null;
    this.cameraRunning = false;

    // Gesture states
    this.state = {
      handsDetected: 0,
      primaryHand: null,      // { landmarks, smoothedLandmarks, handedness }
      secondaryHand: null,
      isPinching: false,
      pinchDistance: 0,
      isPointing: false,
      isPeaceSign: false,
      isThumbMiddlePinch: false,
      isOpenPalm: false,
      isFist: false,
      cursorScreenPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      twoHandDistance: null,
      handRotation: { x: 0, y: 0, z: 0 }
    };
  }

  async init() {
    this.updateStatus('camera', 'Requesting camera access...', 'pulsing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.video.srcObject = stream;
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      // Match PiP canvas resolution
      if (this.pipCanvas) {
        this.pipCanvas.width = this.video.videoWidth || 640;
        this.pipCanvas.height = this.video.videoHeight || 480;
      }

      this.updateStatus('camera', 'Camera Active', 'active');
      this.updateStatus('hand', 'Loading AI Model...', 'pulsing');

      // Initialize MediaPipe Hands
      if (typeof Hands === 'undefined') {
        throw new Error('MediaPipe Hands library not loaded from CDN.');
      }

      this.hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });

      this.hands.onResults((results) => this.processResults(results));

      this.updateStatus('hand', 'Looking for hands...', '');
      this.startDetectionLoop();
    } catch (err) {
      console.error('Camera or MediaPipe Init Error:', err);
      this.updateStatus('camera', 'Camera Error: ' + err.message, '');
      throw err;
    }
  }

  updateStatus(type, text, dotClass) {
    if (this.onStatusCallback) {
      this.onStatusCallback(type, text, dotClass);
    }
  }

  startDetectionLoop() {
    this.cameraRunning = true;
    const processFrame = async () => {
      if (!this.cameraRunning) return;
      if (this.video.readyState >= 2) {
        await this.hands.send({ image: this.video });
      }
      requestAnimationFrame(processFrame);
    };
    requestAnimationFrame(processFrame);
  }

  processResults(results) {
    const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    this.state.handsDetected = numHands;

    // Draw video feed and skeleton on PiP canvas
    this.drawPiP(results);

    if (numHands === 0) {
      this.prevLandmarks = [null, null];
      this.state.primaryHand = null;
      this.state.secondaryHand = null;
      this.state.isPinching = false;
      this.state.isPointing = false;
      this.state.isPeaceSign = false;
      this.state.isThumbMiddlePinch = false;
      this.state.isOpenPalm = false;
      this.state.twoHandDistance = null;

      if (this.onResultsCallback) {
        this.onResultsCallback(this.state);
      }
      return;
    }

    // Apply smoothing to landmarks
    const smoothedHands = results.multiHandLandmarks.map((landmarks, handIndex) => {
      const prev = this.prevLandmarks[handIndex];
      const smoothed = landmarks.map((lm, i) => {
        if (!prev) return { x: lm.x, y: lm.y, z: lm.z };
        const alpha = this.smoothingFactor;
        return {
          x: alpha * lm.x + (1 - alpha) * prev[i].x,
          y: alpha * lm.y + (1 - alpha) * prev[i].y,
          z: alpha * lm.z + (1 - alpha) * prev[i].z
        };
      });
      this.prevLandmarks[handIndex] = smoothed;
      return smoothed;
    });

    // Primary hand (first detected hand)
    const primary = smoothedHands[0];
    this.state.primaryHand = primary;
    this.state.secondaryHand = smoothedHands[1] || null;

    // Calculate Screen Coordinates for Primary Index Tip (Landmark 8)
    // Note: Video is mirrored horizontally so user moving right moves right on screen
    const indexTip = primary[8];
    const thumbTip = primary[4];
    const middleTip = primary[12];
    const ringTip = primary[16];
    const pinkyTip = primary[20];
    const wrist = primary[0];

    // Screen mapped cursor
    const screenX = (1.0 - indexTip.x) * window.innerWidth;
    const screenY = indexTip.y * window.innerHeight;
    this.state.cursorScreenPos = { x: screenX, y: screenY };

    // Pinch Detection (Thumb Tip #4 to Index Tip #8) -> Used for ROTATING the cube
    const pinchDist = this.get3DDistance(thumbTip, indexTip);
    this.state.pinchDistance = pinchDist;
    this.state.isPinching = pinchDist < 0.082;

    // Thumb to Middle Finger Pinch -> Alternate Quick Color Switch
    const thumbMiddleDist = this.get3DDistance(thumbTip, middleTip);
    this.state.isThumbMiddlePinch = thumbMiddleDist < 0.072;

    // Distance from wrist (#0) for robust orientation-independent extension check
    const distFromWrist = (point) => this.get3DDistance(point, wrist);
    const isIndexExtended = distFromWrist(indexTip) > distFromWrist(primary[6]) * 1.12 || indexTip.y < primary[6].y;
    const isMiddleExtended = distFromWrist(middleTip) > distFromWrist(primary[10]) * 1.12 || middleTip.y < primary[10].y;
    const isRingExtended = distFromWrist(ringTip) > distFromWrist(primary[14]) * 1.12 || ringTip.y < primary[14].y;
    const isPinkyExtended = distFromWrist(pinkyTip) > distFromWrist(primary[18]) * 1.12 || pinkyTip.y < primary[18].y;

    // Peace Sign ✌️ (Index & Middle extended, Ring & Pinky curled) -> COLOR CHANGE GESTURE
    this.state.isPeaceSign = isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && !this.state.isPinching;

    // Pointing / Paint Gesture (Index extended, others curled or relaxed, NOT pinching) -> PAINTING GESTURE
    this.state.isPointing = isIndexExtended && !this.state.isPinching && !this.state.isPeaceSign;

    // Open Palm Check (all fingertips extended)
    this.state.isOpenPalm = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;

    // Fist Check (all fingers curled in)
    this.state.isFist = !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended;

    // Palm / Hand Rotation (Wrist #0 relative to Middle Knuckle #9)
    const middleKnuckle = primary[9];
    const dx = middleKnuckle.x - wrist.x;
    const dy = middleKnuckle.y - wrist.y;
    const dz = middleKnuckle.z - wrist.z;
    this.state.handRotation = {
      roll: Math.atan2(dx, -dy),
      pitch: Math.atan2(dz, -dy)
    };

    // Two-Hand Gesture: Distance between two hands (Index tips)
    if (smoothedHands.length >= 2) {
      const hand1Index = smoothedHands[0][8];
      const hand2Index = smoothedHands[1][8];
      this.state.twoHandDistance = this.get3DDistance(hand1Index, hand2Index);
    } else {
      this.state.twoHandDistance = null;
    }

    if (this.onResultsCallback) {
      this.onResultsCallback(this.state);
    }
  }

  get3DDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  drawPiP(results) {
    if (!this.pipCtx || !this.pipCanvas) return;
    const ctx = this.pipCtx;
    const w = this.pipCanvas.width;
    const h = this.pipCanvas.height;

    // Clear and draw mirrored camera frame
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.video, 0, 0, w, h);

    // If hands detected, draw neon futuristic skeleton overlay
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        // Draw connections
        if (typeof drawConnectors === 'function' && typeof HAND_CONNECTIONS !== 'undefined') {
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
            color: '#00f2fe',
            lineWidth: 2
          });
        }

        // Draw landmarks
        if (typeof drawLandmarks === 'function') {
          drawLandmarks(ctx, landmarks, {
            color: '#ff007f',
            fillColor: '#ffffff',
            lineWidth: 1,
            radius: 3
          });
        }
      }
    }
    ctx.restore();
  }
}
