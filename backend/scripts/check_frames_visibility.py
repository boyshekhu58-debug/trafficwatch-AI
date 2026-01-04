#!/usr/bin/env python3
import os
import sys
from pymongo import MongoClient

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'trafficwatch')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Count photos that should be excluded from the Upload Photo page
excluded_query = {'$or': [
    {'is_video_frame': True},
    {'source_video_id': {'$exists': True, '$nin': [None, '']}},
    {'filename': {'$regex': r'^frame_'}}
]}

excluded_count = db.photos.count_documents(excluded_query)
examples = list(db.photos.find(excluded_query, {'_id': 0}).sort('created_at', -1).limit(10))

count_is_video_frame = db.photos.count_documents({'is_video_frame': True})
count_has_source = db.photos.count_documents({'source_video_id': {'$exists': True}})
count_legacy_frame = db.photos.count_documents({'filename': {'$regex': r'^frame_'}})

print('Total photos in DB:', db.photos.count_documents({}))
print('Excluded photo count (frames / legacy frames):', excluded_count)
print('  - is_video_frame=True:', count_is_video_frame)
print('  - source_video_id exists:', count_has_source)
print('  - filename starts with frame_:', count_legacy_frame)
print('\nExamples of excluded photos:')
for ex in examples:
    print('-', ex.get('id'), ex.get('filename'), 'source_video_id=', ex.get('source_video_id'), 'is_video_frame=', ex.get('is_video_frame'))

# Print full document for two curious IDs (may appear in both lists)
for curious in ['2b339e9f-148b-466c-84f6-2953846accc5', 'f525b6d1-4ed1-4c5f-ade4-54c898a93142']:
    doc = db.photos.find_one({'id': curious})
    if doc:
        print('\nFull doc for', curious)
        for k, v in doc.items():
            print(' ', k, ':', v)
    else:
        print('\nNo doc found for', curious)

# Also compute allowed photos in Python to ensure logic is correct
all_docs = list(db.photos.find({}, {'_id': 0}))
allowed_docs = []
for d in all_docs:
    is_frame_flag = d.get('is_video_frame') is True
    has_nonnull_source = ('source_video_id' in d) and (d.get('source_video_id') not in (None, ''))
    legacy_name = bool(d.get('filename') and d.get('filename').startswith('frame_'))
    if not is_frame_flag and not has_nonnull_source and not legacy_name:
        allowed_docs.append(d)

print('\nAllowed (manually uploaded) photo count (python check):', len(allowed_docs))
print('Examples:')
for ex in allowed_docs[:10]:
    print('-', ex.get('id'), ex.get('filename'), 'is_video_frame=', ex.get('is_video_frame'), 'source_video_id=', ex.get('source_video_id'))

