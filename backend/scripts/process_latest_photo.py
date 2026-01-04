import asyncio
import logging
import os
import sys

# Ensure backend module path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from server import db, process_photo_background

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('process_latest_photo')

async def main():
    latest = await db.photos.find({}, {"_id":0}).sort('created_at', -1).limit(1).to_list(1)
    if not latest:
        logger.error('No photos found in db.photos')
        return
    photo = latest[0]
    photo_id = photo['id']
    user_id = photo['user_id']
    logger.info(f'Processing photo {photo_id} for user {user_id}')
    await process_photo_background(photo_id, user_id)

    violations = await db.violations.find({'photo_id': photo_id}, {'_id':0}).sort('created_at', -1).to_list(100)
    challans = await db.challans.find({'violation_id': {'$in': [v['id'] for v in violations]}}, {'_id':0}).to_list(100)

    logger.info(f'Found {len(violations)} violations for photo {photo_id}')
    for v in violations:
        logger.info(v)
    logger.info(f'Found {len(challans)} challans for photo {photo_id}')
    for c in challans:
        logger.info(c)

if __name__ == '__main__':
    asyncio.get_event_loop().run_until_complete(main())
