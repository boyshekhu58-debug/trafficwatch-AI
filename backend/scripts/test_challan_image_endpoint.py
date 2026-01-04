import asyncio
import os
import logging
import sys
# Ensure backend module path is on sys.path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from server import db

async def main():
    # Find a challan with detected_image_path
    doc = await db.challans.find_one({'detected_image_path': {'$exists': True}}, {'_id': 0})
    if not doc:
        print('No challan with detected image found')
        return
    print('Challan id:', doc.get('id'))
    print('Challan number:', doc.get('challan_number'))
    path = doc.get('detected_image_path')
    print('Detected image path:', path)
    print('Exists on disk:', os.path.exists(path))
    if os.path.exists(path):
        print('Size:', os.path.getsize(path))

if __name__ == '__main__':
    asyncio.run(main())
