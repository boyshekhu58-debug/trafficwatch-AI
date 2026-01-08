import os
import logging
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO
from datetime import datetime

logger = logging.getLogger(__name__)
ROOT_DIR = Path(__file__).parent
MODEL_PATH = ROOT_DIR / 'models' / 'best.pt'
MODEL_INFER_IMG = int(os.environ.get('MODEL_INFER_IMG', '512'))

logger.info(f"Loading YOLO model for video worker from {MODEL_PATH}")
model = YOLO(str(MODEL_PATH))

# Extract class names if present
MODEL_CLASS_NAMES = getattr(model, 'names', {})
CLASS_NAMES = {idx: (name.split('-')[-1].strip() if isinstance(name, str) else str(name)) for idx, name in MODEL_CLASS_NAMES.items()}


def process_video_file(input_path: str, output_path: str, pixels_per_meter: float = 50.0, speed_limit: float = 60.0, frame_skip: int = 3):
    """Process a single video file synchronously and write annotated output.
    Returns dict: {'violations_count': int, 'fps': float, 'duration': float}
    """
    cap = cv2.VideoCapture(str(input_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

    frame_idx = 0
    violations_count = 0
    tracker_data = {}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_skip != 0:
            out.write(frame)
            frame_idx += 1
            continue

        # Run tracking on sampled frames
        try:
            results = model.track(frame, persist=True, verbose=False, imgsz=MODEL_INFER_IMG, conf=0.35)
        except Exception as e:
            logger.exception('Model track failed on frame %d: %s', frame_idx, e)
            out.write(frame)
            frame_idx += 1
            continue

        # Annotated frame
        try:
            annotated = results[0].plot()
        except Exception:
            annotated = frame

        # Simple violation counting: look for classes named 'no_helmet' or similar
        if results and results[0].boxes is not None:
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            for cls in classes:
                name = CLASS_NAMES.get(int(cls), '').lower()
                if 'no_helmet' in name or 'nohelmet' in name or 'no helmet' in name:
                    violations_count += 1

        out.write(annotated)
        frame_idx += 1

    cap.release()
    out.release()

    # Compute duration from frame count
    cap2 = cv2.VideoCapture(str(input_path))
    frame_count = int(cap2.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap2.release()
    duration = frame_count / fps if fps > 0 else 0

    logger.info(f"Processed video {input_path} -> {output_path}: fps={fps}, duration={duration:.2f}s, violations={violations_count}")

    return {
        'violations_count': int(violations_count),
        'fps': float(fps),
        'duration': float(duration)
    }
