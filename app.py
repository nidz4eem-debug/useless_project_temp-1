import os
import uuid
import urllib.request
import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode
from flask import Flask, render_template, request, redirect, url_for, flash

app = Flask(__name__)
app.secret_key = "dev-secret-key"  # change this in production

UPLOAD_FOLDER = os.path.join("static", "uploads")
# Note: detection below works on static images. GIFs are only read as their
# first frame by OpenCV, so animated content won't be fully processed.
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB limit

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- MediaPipe Face Landmarker setup -----------------------------------
# We use Google's MediaPipe Face Landmarker task instead of OpenCV's old
# Haar Cascades. It's a proper neural network (BlazeFace + a landmark/
# blendshape model), so it detects faces far more reliably at different
# angles and lighting, and — importantly — it outputs a real learned
# "mouthSmileLeft" / "mouthSmileRight" blendshape score for each face
# instead of guessing from edge patterns like the old smile cascade did.

MODEL_DIR = "models"
MODEL_PATH = os.path.join(MODEL_DIR, "face_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# How confident a "smile" blendshape needs to be (0-1) to count as smiling.
# MediaPipe returns two scores, mouthSmileLeft and mouthSmileRight; we
# average them. 0.4 is a reasonable middle ground — raise it to require a
# more obvious smile, lower it to catch subtle/closed-mouth smiles too.
SMILE_THRESHOLD = 0.4


def ensure_model_downloaded():
    """
    Download the Face Landmarker model on first run and cache it locally in
    models/. Later runs reuse the cached file, so this only touches the
    network once. Raises a clear error if the download fails (e.g. no
    internet, or a firewall blocking storage.googleapis.com) so the failure
    doesn't look like a mysterious crash.
    """
    if os.path.exists(MODEL_PATH):
        return MODEL_PATH

    os.makedirs(MODEL_DIR, exist_ok=True)
    tmp_path = MODEL_PATH + ".part"
    try:
        print("Downloading face detection model (~4MB, first run only)...")
        urllib.request.urlretrieve(MODEL_URL, tmp_path)
        os.replace(tmp_path, MODEL_PATH)
        print("Model downloaded and cached at", MODEL_PATH)
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(
            "Could not download the face detection model. Check your internet "
            f"connection, or manually download it from {MODEL_URL} and save it "
            f"as {MODEL_PATH}."
        ) from exc

    return MODEL_PATH


landmarker = None  # created lazily on first request, see get_landmarker()


def get_landmarker():
    """Create the FaceLandmarker once and reuse it across requests."""
    global landmarker
    if landmarker is None:
        model_path = ensure_model_downloaded()
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=RunningMode.IMAGE,
            num_faces=20,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=False,
        )
        landmarker = FaceLandmarker.create_from_options(options)
    return landmarker


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def smile_score(face_blendshapes):
    """Average of the left/right mouth-smile blendshape scores for one face."""
    scores = {b.category_name: b.score for b in face_blendshapes}
    left = scores.get("mouthSmileLeft", 0.0)
    right = scores.get("mouthSmileRight", 0.0)
    return (left + right) / 2


def detect_faces(filepath):
    """
    Detect faces in the image at filepath using MediaPipe, classify each as
    smiling or not via its smile blendshape score, draw bounding boxes
    (green = smiling, red = not smiling) on the saved image, and return
    (total_faces, not_smiling_count). Returns (0, 0) if the image can't be
    read or no faces are found.
    """
    image = cv2.imread(filepath)
    if image is None:
        return 0, 0

    height, width = image.shape[:2]
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)

    result = get_landmarker().detect(mp_image)
    face_landmarks_list = result.face_landmarks
    face_blendshapes_list = result.face_blendshapes

    not_smiling_count = 0

    for landmarks, blendshapes in zip(face_landmarks_list, face_blendshapes_list):
        # Derive a bounding box from the landmark points themselves (there's
        # no separate detector box in this API — the landmarks cover the
        # whole face, so their min/max extent is the face box).
        xs = [lm.x * width for lm in landmarks]
        ys = [lm.y * height for lm in landmarks]
        x1, x2 = int(min(xs)), int(max(xs))
        y1, y2 = int(min(ys)), int(max(ys))

        score = smile_score(blendshapes)
        smiling = score >= SMILE_THRESHOLD

        if smiling:
            color = (0, 200, 0)  # green (BGR)
            label = f"Smiling ({score:.2f})"
        else:
            color = (0, 0, 220)  # red (BGR)
            label = f"Not smiling ({score:.2f})"
            not_smiling_count += 1

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            image,
            label,
            (x1, max(y1 - 8, 15)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            1,
            cv2.LINE_AA,
        )

    cv2.imwrite(filepath, image)
    return len(face_landmarks_list), not_smiling_count


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "image" not in request.files:
        flash("No file part in the request.")
        return redirect(url_for("index"))

    file = request.files["image"]

    if file.filename == "":
        flash("No file selected.")
        return redirect(url_for("index"))

    if not allowed_file(file.filename):
        flash("Unsupported file type. Please upload a PNG, JPG, JPEG, GIF, or WEBP image.")
        return redirect(url_for("index"))

    # Generate a unique filename to avoid collisions/overwrites
    ext = file.filename.rsplit(".", 1)[1].lower()
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
    file.save(filepath)

    try:
        face_count, not_smiling_count = detect_faces(filepath)
    except RuntimeError as exc:
        flash(str(exc))
        return redirect(url_for("index"))

    image_url = url_for("static", filename=f"uploads/{unique_name}")
    return render_template(
        "index.html",
        uploaded_image=image_url,
        original_name=file.filename,
        face_count=face_count,
        not_smiling_count=not_smiling_count,
    )


if __name__ == "__main__":
    app.run(debug=True)
