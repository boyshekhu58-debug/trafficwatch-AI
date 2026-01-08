# Video Worker

This repository includes a simple video worker that polls MongoDB for uploaded videos and processes them using the local YOLO model.

Requirements:
- `MONGO_URL` and `DB_NAME` environment variables must be set
- If using S3, configure `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in environment
- **Dependencies:** Install Python deps in `backend` with `pip install -r requirements.txt` (this includes `pymongo`, `boto3`, `opencv-python`, etc.)

Run the worker:

```bash
python backend/process_video_worker.py
```

Behavior:
- The worker picks a single document with `status: 'uploaded'` and atomically sets it to `processing`.
- It downloads the input (from S3 or local uploads folder), processes using `video_processing.py`, uploads the processed artifact to `processed_videos/{video_id}_processed.mp4` (S3 or local processed folder), and updates the video document with `status`, `processed_path`, `total_violations`, `fps`, and `duration`.

Notes:
- This is intentionally a lightweight worker that avoids adding external brokers. For production-grade systems, consider using SQS, Redis + RQ, or Celery for job orchestration and retries.
