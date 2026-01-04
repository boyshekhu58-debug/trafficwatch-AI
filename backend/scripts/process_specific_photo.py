import sys
import os
import requests
from pathlib import Path
import json

if len(sys.argv) < 2:
    print('Usage: process_specific_photo.py <absolute_image_path>')
    sys.exit(1)

img_path = Path(sys.argv[1])
if not img_path.exists():
    print('Image not found:', img_path)
    sys.exit(1)

# Print raw detections using server model
repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

print('Loading backend and model...')
try:
    from server import model_predict, CLASS_NAMES
    import cv2
    import numpy as np
except Exception as e:
    print('Error importing server/model:', e)
    # fallback: try importing with backend in path
    raise

frame = cv2.imread(str(img_path))
if frame is None:
    print('Could not read image:', img_path)
    sys.exit(1)

print('Running model_predict...')
res = model_predict(frame)
if not res or res[0].boxes is None:
    print('No detections from model')
else:
    boxes = res[0].boxes.xyxy.cpu().numpy()
    classes = res[0].boxes.cls.cpu().numpy().astype(int)
    confs = res[0].boxes.conf.cpu().numpy()
    dets = []
    for box, cls, conf in zip(boxes, classes, confs):
        name = CLASS_NAMES.get(int(cls), 'unknown')
        dets.append({'class': name, 'conf': float(conf), 'bbox': [float(box[0]), float(box[1]), float(box[2]), float(box[3])]})
    print('Raw detections:')
    print(json.dumps(dets, indent=2))

# Upload via API
session_token = os.environ.get('TEST_SESSION_TOKEN', 'fb74527e-4d3f-48dc-96cb-03cb2658d584')
cookies = {'session_token': session_token}
files = {'file': open(str(img_path), 'rb')}
print('\nUploading image to /api/photos/upload')
r = requests.post('http://localhost:8000/api/photos/upload', files=files, cookies=cookies)
print('Upload status:', r.status_code)
print(r.text)
if not r.ok:
    sys.exit(1)
photo = r.json()
photo_id = photo.get('id')
print('Uploaded photo id:', photo_id)

# Process sync=true
print('\nProcessing photo with sync=true')
r2 = requests.post(f'http://localhost:8000/api/photos/{photo_id}/process?sync=true', cookies=cookies)
print('Process status:', r2.status_code)
try:
    print(json.dumps(r2.json(), indent=2))
except Exception:
    print('Process response:', r2.text)

print('\nDone')