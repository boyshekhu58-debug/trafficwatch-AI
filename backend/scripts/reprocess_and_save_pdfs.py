import asyncio
import logging
import os
import sys
from io import BytesIO

# Ensure package import
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from server import db, process_photo_background
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('reprocess_and_save_pdfs')

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'processed_challans')
os.makedirs(OUTPUT_DIR, exist_ok=True)

async def main():
    latest = await db.photos.find({}, {"_id":0}).sort('created_at', -1).limit(1).to_list(1)
    if not latest:
        logger.error('No photos found in db.photos')
        return
    photo = latest[0]
    photo_id = photo['id']
    user_id = photo['user_id']
    logger.info(f'Processing photo {photo_id} for user {user_id} (synchronous)')
    await process_photo_background(photo_id, user_id)

    violations = await db.violations.find({'photo_id': photo_id, 'user_id': user_id}, {'_id':0}).sort('created_at', -1).to_list(100)
    challans = await db.challans.find({'user_id': user_id, 'violation_id': {'$in': [v['id'] for v in violations]}}, {'_id':0}).to_list(100)

    logger.info(f'Found {len(violations)} violations for photo {photo_id}')
    for v in violations:
        logger.info(v)

    logger.info(f'Found {len(challans)} challans for photo {photo_id}')
    saved = []
    styles = getSampleStyleSheet()
    for c in challans:
        cid = c.get('id')
        challan_number = c.get('challan_number')
        filename = f"challan_{challan_number}.pdf"
        outpath = os.path.join(OUTPUT_DIR, filename)

        # Build simple PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=72, leftMargin=72,
                               topMargin=72, bottomMargin=18)
        elements = []
        elements.append(Paragraph(f"E-CHALLAN: {challan_number}", styles['Heading1']))
        elements.append(Spacer(1, 0.1*72))
        elements.append(Paragraph(f"Violation ID: {c.get('violation_id')}", styles['Normal']))
        elements.append(Paragraph(f"Plate Number: {c.get('plate_number', 'UNKNOWN')}", styles['Normal']))
        # include detected image if available
        detected_image_path = c.get('detected_image_path')
        if detected_image_path and os.path.exists(detected_image_path):
            try:
                elements.append(Spacer(1, 0.1*72))
                elements.append(Image(detected_image_path, width=4*72))
                elements.append(Spacer(1, 0.1*72))
            except Exception:
                logger.exception('Failed to include detected image in PDF')

        elements.append(Paragraph(f"Fine Amount: ₹{c.get('fine_amount'):.2f}", styles['Normal']))
        elements.append(Spacer(1, 0.2*72))
        elements.append(Paragraph("This is an electronically generated challan.", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        with open(outpath, 'wb') as f:
            f.write(buffer.getvalue())
        saved.append(outpath)
        logger.info(f'Saved challan PDF: {outpath}')

    if not saved:
        logger.warning('No challan PDFs generated')
    else:
        logger.info('Completed: PDFs saved')

if __name__ == '__main__':
    asyncio.get_event_loop().run_until_complete(main())
