"""Simple worker that polls MongoDB for videos with status 'uploaded' and processes them.
Usage: python process_video_worker.py
"""
import os
import time
import tempfile
import logging
from pathlib import Path
# Ensure .env is loaded when running the worker directly
try:
    from dotenv import load_dotenv  # type: ignore
    ROOT_DIR = Path(__file__).parent
    load_dotenv(ROOT_DIR / '.env')
except Exception:
    # dotenv is optional in some environments (e.g., container env vars will be used)
    pass

# pymongo might not be installed in developer environments; provide a helpful runtime error
try:
    from pymongo import MongoClient  # type: ignore
except Exception:
    import logging as _logging
    _logging.error("Missing dependency: 'pymongo'. Install it with `pip install pymongo` or `pip install -r requirements.txt` in the backend venv.")
    raise

from datetime import datetime
# S3 support removed; legacy s3:// URLs will be mapped to local files

import video_processing
import shutil

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

if not MONGO_URL or not DB_NAME:
    logger.error('MONGO_URL and DB_NAME must be set in environment')
    raise SystemExit(1)

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

POLL_INTERVAL = int(os.environ.get('VIDEO_WORKER_POLL_INTERVAL', '5'))


def process_job(video_doc):
    video_id = video_doc['id']
    user_id = video_doc['user_id']
    original_path = video_doc.get('original_path')

    logger.info(f'Starting processing job for video {video_id} (path={original_path})')

    tmpdir = Path(tempfile.mkdtemp(prefix=f'videoproc_{video_id}_'))
    try:
        # Download input
        if original_path and original_path.startswith('s3://'):
            # Handle legacy s3 URLs by mapping to local paths under backend directory
            # s3://bucket/path -> backend/path
            parsed = original_path[5:].split('/', 1)
            key = parsed[1] if len(parsed) > 1 else ''
            input_src = ROOT_DIR / key
            if not input_src.exists():
                raise FileNotFoundError(f'Input video not found: {input_src}')
            input_local = str(tmpdir / 'input.mp4')
            shutil.copyfile(str(input_src), input_local)
        else:
            # local path - copy
            input_src = Path(original_path)
            if not input_src.exists():
                raise FileNotFoundError(f'Input video not found: {input_src}')
            input_local = str(tmpdir / 'input.mp4')
            shutil.copyfile(str(input_src), input_local)

        # Output path
        output_local = str(tmpdir / 'output_processed.mp4')

        # Simple default calibration - can be extended to fetch per-user calibration
        pixels_per_meter = 50.0
        speed_limit = 60.0

        # Process
        result = video_processing.process_video_file(input_local, output_local, pixels_per_meter, speed_limit, frame_skip=3)

        # Move processed file to backend processed folder
        processed_key = f'processed_videos/{video_id}_processed.mp4'
        dest = ROOT_DIR / processed_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output_local, str(dest))
        processed_path = str(dest)

        # Try uploading processed video to Cloudinary (if configured). If upload succeeds,
        # use the returned secure URL as the processed_path stored in DB.
        try:
            from utils.cloudinary_config import upload_video_to_cloudinary

            cloud_url = upload_video_to_cloudinary(str(dest))
            if cloud_url:
                processed_path = cloud_url
                logger.info('Uploaded processed video to Cloudinary: %s', cloud_url)
        except Exception as e:
            logger.debug('Cloudinary upload not available or failed: %s', e)

        # Update DB
        update = {
            'status': 'completed',
            'processed_path': processed_path,
            'total_violations': int(result.get('violations_count', 0)),
            'duration': float(result.get('duration', 0.0)),
            'fps': float(result.get('fps', 0.0)),
            'processed_at': datetime.utcnow().isoformat()
        }
        db.videos.update_one({'id': video_id}, {'$set': update})

        # Insert a short violation summary into `db.violations` only when the processed file
        # is available via an external URL (e.g., Cloudinary). We store ONLY the URL —
        # never store video files in MongoDB.
        try:
            if isinstance(processed_path, str) and processed_path.startswith(('http://', 'https://')):
                violation_doc = {
                    'video_id': video_id,
                    'user_id': user_id,
                    'media_url': processed_path,
                    'violations': int(result.get('violations_count', 0)),
                    'violation_types': result.get('violation_types', {}),
                    'created_at': datetime.utcnow()
                }
                db.violations.insert_one(violation_doc)
                logger.info('Inserted violation summary for video %s into db.violations', video_id)
            else:
                logger.info('Processed video for %s not uploaded to Cloudinary; skipping db.violations insert', video_id)
        except Exception as e:
            logger.exception('Failed to insert violation summary for video %s: %s', video_id, e)

        logger.info(f'Processing completed for video {video_id} -> {processed_path}')

    except Exception as e:
        logger.exception('Processing failed for video %s: %s', video_id, e)
        db.videos.update_one({'id': video_id}, {'$set': {'status': 'failed', 'error': str(e)}})
    finally:
        # Cleanup
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass


if __name__ == '__main__':
    # Allow disabling the worker in environments where it's not needed (e.g., front-end-only deployments)
    VIDEO_WORKER_ENABLED = os.getenv('VIDEO_WORKER_ENABLED', 'true').lower() in ('1', 'true', 'yes')
    if not VIDEO_WORKER_ENABLED:
        logger.info('Video worker disabled via VIDEO_WORKER_ENABLED env var; exiting without starting the loop.')
        import sys

        sys.exit(0)

    logger.info('Video worker started, polling for uploaded videos...')
    while True:
        try:
            # Atomically pick one uploaded video and mark it processing
            doc = db.videos.find_one_and_update({'status': 'uploaded'}, {'$set': {'status': 'processing', 'processing_started_at': datetime.utcnow().isoformat()}}, sort=[('created_at', 1)])
            if not doc:
                time.sleep(POLL_INTERVAL)
                continue

            process_job(doc)
        except Exception as e:
            logger.exception('Worker loop error: %s', e)
            time.sleep(POLL_INTERVAL)
