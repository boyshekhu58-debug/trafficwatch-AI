import os
import logging

try:
    import cloudinary
    import cloudinary.uploader
except Exception:
    cloudinary = None

logger = logging.getLogger(__name__)

CLOUDINARY_ENABLED = bool(
    os.getenv("CLOUDINARY_CLOUD_NAME") and os.getenv("CLOUDINARY_API_KEY") and os.getenv("CLOUDINARY_API_SECRET")
)

if cloudinary and CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        secure=True,
    )
else:
    if not cloudinary:
        logger.debug("Cloudinary SDK is not installed; cloud uploads will be disabled.")
    else:
        logger.debug("Cloudinary environment variables not set; cloud uploads will be disabled.")


def upload_video_to_cloudinary(file_path: str) -> str | None:
    """Upload a video file to Cloudinary and return the secure URL, or None if disabled/failed."""
    if not CLOUDINARY_ENABLED or not cloudinary:
        logger.debug("Skipping Cloudinary video upload: not configured.")
        return None
    try:
        result = cloudinary.uploader.upload(file_path, resource_type="video", folder="trafficwatch/processed_videos")
        return result.get("secure_url")
    except Exception as e:
        logger.exception("Cloudinary video upload failed: %s", e)
        return None


def upload_image_to_cloudinary(file_path: str) -> str | None:
    """Upload an image file to Cloudinary and return the secure URL, or None if disabled/failed."""
    if not CLOUDINARY_ENABLED or not cloudinary:
        logger.debug("Skipping Cloudinary image upload: not configured.")
        return None
    try:
        result = cloudinary.uploader.upload(file_path, resource_type="image", folder="trafficwatch/processed_images")
        return result.get("secure_url")
    except Exception as e:
        logger.exception("Cloudinary image upload failed: %s", e)
        return None
