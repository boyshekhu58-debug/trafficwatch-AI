import asyncio
import os
import io
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from server import db, build_styled_challan_pdf

async def main():
    doc = await db.challans.find_one({'detected_image_path': {'$exists': True}}, {'_id':0})
    if not doc:
        print('No challan with image found')
        return
    buf = build_styled_challan_pdf(doc)
    out = f"processed_challans/sample_styled_{doc['challan_number']}.pdf"
    with open(out, 'wb') as f:
        f.write(buf.getvalue())
    print('Wrote', out)

if __name__ == '__main__':
    asyncio.run(main())