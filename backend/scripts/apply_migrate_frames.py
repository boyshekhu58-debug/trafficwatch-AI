#!/usr/bin/env python3
import os
import sys
from datetime import datetime, timedelta
from pymongo import MongoClient

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
if not MONGO_URL or not DB_NAME:
    print('MONGO_URL and DB_NAME environment variables must be set')
    sys.exit(1)

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

apply_changes = '--apply' in sys.argv

def iso(dt):
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)

summary = {'videos_processed': 0, 'total_candidates': 0, 'total_updated': 0, 'details': []}

videos = list(db.videos.find({'user_id': {'$exists': True}}, {'_id': 0}))
for v in videos:
    vid = v['id']
    fname = v.get('filename')
    created_at = v.get('created_at')
    if isinstance(created_at, str):
        start_iso = created_at
        try:
            start_dt = datetime.fromisoformat(start_iso)
        except Exception:
            start_dt = None
    elif isinstance(created_at, datetime):
        start_dt = created_at
        start_iso = start_dt.isoformat()
    else:
        start_iso = None
        start_dt = None

    duration = float(v.get('duration') or 0)
    if start_dt:
        end_dt = start_dt + timedelta(seconds=int(duration) + 30)
        end_iso = end_dt.isoformat()
    else:
        end_iso = start_iso

    # Build candidate filter
    photo_filter = {
        'user_id': v['user_id'],
        '$and': [
            {'$or': [
                {'is_video_frame': {'$exists': False}},
                {'is_video_frame': False}
            ]},
            {'$or': [
                {'source_video_id': {'$exists': False}},
                {'source_video_id': None}
            ]}
        ]
    }
    # Created_at range if available
    created_range = {}
    if start_iso and end_iso:
        created_range = {'created_at': {'$gte': start_iso, '$lte': end_iso}}
    if created_range:
        photo_filter.update(created_range)

    candidates = list(db.photos.find(photo_filter, {'_id': 0}))
    # Also look for legacy filename matches (frame_*) within time window
    legacy_filter = {'user_id': v['user_id'], 'filename': {'$regex': r'^frame_'}}
    if start_iso and end_iso:
        legacy_filter['created_at'] = {'$gte': start_iso, '$lte': end_iso}
    legacy = list(db.photos.find(legacy_filter, {'_id': 0}))

    # Combine unique ids
    cand_ids = {c['id'] for c in candidates} | {c['id'] for c in legacy}
    cand_list = list(cand_ids)
    summary['videos_processed'] += 1
    summary['total_candidates'] += len(cand_list)
    example_ids = cand_list[:10]
    summary['details'].append({'video_id': vid, 'video_filename': fname, 'found': len(cand_list), 'examples': example_ids})

    if apply_changes and cand_list:
        res = db.photos.update_many({'id': {'$in': cand_list}}, {'$set': {'source_video_id': vid, 'is_video_frame': True}})
        summary['total_updated'] += res.modified_count
        print(f"Video {vid} ({fname}): updated {res.modified_count} photos")
    else:
        print(f"Video {vid} ({fname}): found {len(cand_list)} candidate photos (dry-run)")

print('\nMigration summary:')
print(summary)

if apply_changes:
    print('\nMigration applied. You may want to refresh the frontend cache or restart the frontend to see updated frames.')
else:
    print('\nDry run complete. Re-run with --apply to make changes.')
