#!/usr/bin/env python3
import os
import sys
from pymongo import MongoClient

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
if not MONGO_URL or not DB_NAME:
    print('MONGO_URL and DB_NAME environment variables must be set')
    sys.exit(1)

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

apply_changes = '--apply' in sys.argv
force_update = '--force' in sys.argv

# Rules:
# - If photo.is_video_frame == True OR photo.source_video_id exists and not empty OR filename starts with 'frame_' => uploaded_via = 'video'
# - Else => uploaded_via = 'upload'

query = {}
photos = list(db.photos.find(query, {'_id': 0, 'id': 1, 'is_video_frame': 1, 'source_video_id': 1, 'filename':1, 'uploaded_via':1}))
print(f'Found {len(photos)} photos to inspect')
summary = {'to_update': 0, 'updated': 0, 'skipped': 0, 'examples': []}

for p in photos:
    pid = p.get('id')
    current = p.get('uploaded_via')
    is_frame_flag = True if p.get('is_video_frame') is True else False
    src_vid = p.get('source_video_id')
    fname = p.get('filename') or ''

    should_be = 'video' if (is_frame_flag or (src_vid not in (None, '', [])) or fname.startswith('frame_')) else 'upload'

    if current == should_be and not force_update:
        summary['skipped'] += 1
        continue

    summary['to_update'] += 1
    if len(summary['examples']) < 10:
        summary['examples'].append({'id': pid, 'current': current, 'should_be': should_be, 'is_video_frame': is_frame_flag, 'source_video_id': src_vid, 'filename': fname})

    if apply_changes:
        res = db.photos.update_one({'id': pid}, {'$set': {'uploaded_via': should_be}})
        if res.modified_count:
            summary['updated'] += 1
        else:
            summary['skipped'] += 1

print('\nMigration summary:')
print(f"  Total photos inspected: {len(photos)}")
print(f"  To update: {summary['to_update']}")
print(f"  Updated (applied): {summary['updated']}")
print(f"  Skipped: {summary['skipped']}")
print('\nExamples:')
for ex in summary['examples']:
    print(' -', ex)

if not apply_changes:
    print('\nDry run complete. Re-run with --apply to persist changes, or add --force to overwrite existing uploaded_via values.')
else:
    print('\nMigration applied. Consider refreshing frontend caches or restarting services to pick up changes.')
