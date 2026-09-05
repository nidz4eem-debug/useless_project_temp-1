# 🎨 AirCube Studio

A browser-based **3D hand-gesture cube painter** — no installation needed. Just open it in Chrome/Edge with a webcam and start painting in the air!

![AirCube Studio](https://img.shields.io/badge/WebGL-Three.js-blue) ![MediaPipe](https://img.shields.io/badge/AI-MediaPipe%20Hands-green) ![License](https://img.shields.io/badge/license-MIT-orange)

---

## ✨ Features

- 🖐️ **Real-time hand tracking** via MediaPipe Hands (no backend needed)
- 🎲 **Interactive 3D cube** rendered with Three.js
- 🎨 **Paint directly on cube faces** using your fingertip
- 🤏 **Pinch to rotate** the cube in 3D space
- ✌️ **Peace sign / thumb-middle snap** to cycle through colours
- 👐 **Two-handed scale** to resize the cube
- 📷 **PiP webcam card** with live hand skeleton overlay
- 🌑 Sleek dark cyberpunk UI — no frameworks, pure HTML/CSS/JS

---

## 🎮 Gesture Controls

| Gesture | Action |
|---|---|
| ☝️ Index finger extended | **Paint** on the cube face |
| 🤏 Thumb + Index pinch | **Rotate** the cube |
| ✌️ Peace sign (Index + Middle up) | **Cycle colour** palette |
| 👐 Both hands open | **Scale** the cube |

---

## 🚀 Running Locally

> Pure static files — no build step required!

### Option 1: Python (built-in)
```bash
cd AirCubeStudio
python -m http.server 8000
# Open http://localhost:8000
```

### Option 2: Use the included launcher
```bash
python serve.py
# Auto-opens your browser
```

### Option 3: VS Code Live Server
Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) and click **Go Live**.

> ⚠️ **Must be served over HTTP/HTTPS** — opening `index.html` directly as a `file://` URL will block webcam access.

---

## 🌐 Hosting on GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **`main` branch, `/ (root)`**
4. Visit `https://<your-username>.github.io/AirCubeStudio/`

> Works entirely client-side — no server needed for GitHub Pages!

---

## 🗂️ Project Structure

```
AirCubeStudio/
├── index.html          # Main app shell
├── style.css           # Dark cyberpunk theme
├── serve.py            # Local dev server launcher
└── js/
    ├── app.js          # Gesture → action coordinator
    ├── cube-studio.js  # Three.js 3D cube + painting engine
    └── hand-tracker.js # MediaPipe hand landmark pipeline
```

---

## 🛠️ Tech Stack

| Library | Version | Purpose |
|---|---|---|
| [Three.js](https://threejs.org/) | r128 | 3D rendering |
| [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands) | Latest CDN | Hand landmark detection |
| Vanilla JS / HTML5 Canvas | — | UI & texture painting |

---

## 📋 Requirements

- **Browser**: Chrome or Edge (Firefox may have WebGL/MediaPipe issues)
- **Webcam**: Required for hand tracking
- **HTTPS or localhost**: Required for camera API access

---

## 📄 License

MIT — free to use, modify, and share.
