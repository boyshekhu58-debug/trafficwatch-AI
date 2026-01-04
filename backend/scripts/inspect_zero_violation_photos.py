import requests
from pathlib import Path

session_token = 'fb74527e-4d3f-48dc-96cb-03cb2658d584'
cookies = {'session_token': session_token}

r = requests.get('http://localhost:8000/api/photos', cookies=cookies)
if not r.ok:
    print('Failed to list photos', r.status_code, r.text)
    raise SystemExit(1)

photos = r.json()
print('Total photos returned:', len(photos))
zero_photos = [p for p in photos if p.get('processed_path') and p.get('total_violations', 0) == 0]
print('Photos with processed_path and total_violations==0:', len(zero_photos))

for p in zero_photos[:5]:
    print('\nInspecting photo', p['id'], p['filename'])
    # Re-run processing sync=true
    r2 = requests.post(f"http://localhost:8000/api/photos/{p['id']}/process?sync=true", cookies=cookies)
    print('  process status', r2.status_code)
    if r2.ok:
        data = r2.json()
        print('  violations returned:', len(data.get('violations', [])))
        for v in data.get('violations', []):
            print('   -', v['violation_type'], v.get('confidence'), v.get('bbox'))
        print('  challans returned:', len(data.get('challans', [])))
    else:
        print('  process failed:', r2.text)

print('\nDone')