import asyncio
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from server import db, create_challan_for_violation
from datetime import datetime, timezone
import uuid

async def main():
    # Insert a dummy violation
    violation_id = str(uuid.uuid4())
    violation = {
        'id': violation_id,
        'user_id': 'test_user',
        'video_id': None,
        'photo_id': None,
        'violation_type': 'no_helmet',
        'timestamp': 0.0,
        'track_id': 0,
        'speed': None,
        'confidence': 0.9,
        'bbox': [0,0,10,10],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.violations.insert_one(violation)
    print('Inserted test violation', violation_id)

    # Run challan creation
    challan = await create_challan_for_violation(violation_id, 'test_user', 'no_helmet', None, plate_detected=False, detected_image=None)
    print('Created challan:', challan.get('challan_number'))

    # Check inserted challan in DB
    doc = await db.challans.find_one({'violation_id': violation_id})
    print('DB challan:', doc)

if __name__ == '__main__':
    asyncio.run(main())
