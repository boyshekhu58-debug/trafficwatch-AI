import requests
import os
from pathlib import Path

session_token = 'fb74527e-4d3f-48dc-96cb-03cb2658d584'
backend_dir = Path(__file__).resolve().parent.parent
img_path = backend_dir / 'processed_photos' / '161f182b-0e87-4af2-b7ed-e772dd27d41f_processed.jpg'
if not img_path.exists():
    raise SystemExit(f'Image not found: {img_path}')

files = {'file': open(str(img_path), 'rb')}
cookies = {'session_token': session_token}

print('Uploading', img_path)
r = requests.post('http://localhost:8000/api/photos/upload', files=files, cookies=cookies)
print('Upload status:', r.status_code)
print(r.text)
if not r.ok:
    raise SystemExit('Upload failed')

photo = r.json()
photo_id = photo.get('id')
print('Uploaded photo id:', photo_id)

print('Processing photo sync=true')
r2 = requests.post(f'http://localhost:8000/api/photos/{photo_id}/process?sync=true', cookies=cookies)
print('Process status:', r2.status_code)
print(r2.text)

if r2.ok:
    res = r2.json()
    print('Violations:', res.get('violations'))
    print('Challans:', res.get('challans'))
else:
    print('Processing failed')
