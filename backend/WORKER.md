# Video Worker

This repository includes a simple video worker that polls MongoDB for uploaded videos and processes them using the local YOLO model.

Requirements:
- `MONGO_URL` and `DB_NAME` environment variables must be set
- **Dependencies:** Install Python deps in `backend` with `pip install -r requirements.txt` (this includes `pymongo`, `opencv-python`, etc.)

**Note:** S3 support has been removed. The worker reads videos from the local `backend/uploads` folder and writes processed outputs to `backend/processed`. For cloud-hosted media, install and configure the Cloudinary SDK.

Cloudinary configuration:
- To enable automatic uploads of processed media to Cloudinary, set the following environment variables in `backend/.env` or in your deployment environment (an example is available at `backend/.env.example`):

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Once configured, processed videos will be uploaded to Cloudinary (and the DB will store the Cloudinary secure URL).

Run the worker:

```bash
python backend/process_video_worker.py
```

Behavior:
- The worker picks a single document with `status: 'uploaded'` and atomically sets it to `processing`.
- It downloads the input (from local `backend/uploads`), processes using `video_processing.py`, uploads the processed artifact to Cloudinary when configured, and updates the video document with `status`, `processed_path`, `total_violations`, `fps`, and `duration`.

Disable worker (optional):
- If you deploy only the frontend or do not want the background worker to start in a given environment, set the environment variable `VIDEO_WORKER_ENABLED=false` before starting the worker. The script will exit immediately and not print the startup loop message.


Notes:
- This is intentionally a lightweight worker that avoids adding external brokers. For production-grade systems, consider using SQS, Redis + RQ, or Celery for job orchestration and retries.
