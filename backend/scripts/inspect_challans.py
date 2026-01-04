import asyncio
from server import db

async def main():
    photo_id='6ad9e4fa-d692-4f31-ba0e-265182d4f039'
    violations = await db.violations.find({'photo_id': photo_id}).to_list(100)
    v_ids = [v['id'] for v in violations]
    challans = await db.challans.find({'violation_id': {'$in': v_ids}}).to_list(100)
    for c in challans:
        print('---')
        print('id',c.get('id'))
        print('challan_number', c.get('challan_number'))
        dip = c.get('detected_image_path')
        print('detected_image_path', dip, 'exists' if dip and os.path.exists(dip) else 'missing')
        print('plate_number', c.get('plate_number'))
        print('plate_readable', c.get('plate_readable'))
        print('preset_challan', c.get('preset_challan'))
        print('notes', c.get('notes'))
    # Print list of files to collect
    files = []
    for c in challans:
        pdf = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'processed_challans', f"challan_{c.get('challan_number')}.pdf")
        if os.path.exists(pdf):
            files.append(pdf)
        dip = c.get('detected_image_path')
        if dip and os.path.exists(dip):
            files.append(dip)
    print('FILES_TO_COLLECT_START')
    for f in files:
        print(f)
    print('FILES_TO_COLLECT_END')

if __name__ == '__main__':
    asyncio.get_event_loop().run_until_complete(main())
