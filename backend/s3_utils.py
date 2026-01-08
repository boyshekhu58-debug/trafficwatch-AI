import os
import logging
from pathlib import Path
from urllib.parse import urlparse

try:
    import boto3  # type: ignore
    from botocore.exceptions import ClientError  # type: ignore
    BOTO3_AVAILABLE = True
except Exception:
    boto3 = None
    ClientError = Exception
    BOTO3_AVAILABLE = False

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
# Local fallback directories (used when S3 not configured)
LOCAL_UPLOADS = ROOT_DIR / "uploads"
LOCAL_PROCESSED = ROOT_DIR / "processed"
LOCAL_UPLOADS.mkdir(exist_ok=True)
LOCAL_PROCESSED.mkdir(exist_ok=True)

S3_BUCKET = os.environ.get('S3_BUCKET') or os.environ.get('AWS_S3_BUCKET')
S3_REGION = os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION')
S3_ENABLED = bool(S3_BUCKET) and BOTO3_AVAILABLE


def get_s3_client():
    if not S3_ENABLED:
        return None
    session = boto3.session.Session()
    client = session.client('s3', region_name=S3_REGION)
    return client


def generate_presigned_put_url(key: str, content_type: str = None, expires_in: int = 3600):
    """Generate a presigned PUT URL for direct upload to S3."""
    if not S3_ENABLED:
        # For local mode, return a local file path where frontend can upload via the server's old endpoint
        path = LOCAL_UPLOADS / key
        return {"upload_url": None, "object_key": str(path), "s3_url": None, "expires_in": expires_in}

    client = get_s3_client()
    params = {'Bucket': S3_BUCKET, 'Key': key}
    if content_type:
        params['ContentType'] = content_type
    try:
        url = client.generate_presigned_url('put_object', Params=params, ExpiresIn=expires_in)
        return {"upload_url": url, "object_key": key, "s3_url": f"s3://{S3_BUCKET}/{key}", "expires_in": expires_in}
    except ClientError as e:
        logger.exception('Failed to generate presigned URL: %s', e)
        raise


def generate_presigned_get_url(key: str, expires_in: int = 3600):
    if not S3_ENABLED:
        path = LOCAL_PROCESSED / key
        return None if not path.exists() else str(path)

    client = get_s3_client()
    try:
        url = client.generate_presigned_url('get_object', Params={'Bucket': S3_BUCKET, 'Key': key}, ExpiresIn=expires_in)
        return url
    except ClientError as e:
        logger.exception('Failed to generate presigned GET URL: %s', e)
        return None


def download_file(key: str, local_path: str):
    """Download S3 object to local_path. If S3 not enabled and key is local path, copy instead."""
    if S3_ENABLED:
        client = get_s3_client()
        client.download_file(S3_BUCKET, key, local_path)
        return local_path
    else:
        # Treat key as relative path under LOCAL_UPLOADS
        src = LOCAL_UPLOADS / key
        if not src.exists():
            raise FileNotFoundError(f"Local upload not found: {src}")
        dest = Path(local_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        from shutil import copyfile

        copyfile(src, dest)
        return str(dest)


def upload_file(local_path: str, key: str):
    """Upload a local file to S3 (or move to local processed folder when S3 disabled)."""
    if S3_ENABLED:
        client = get_s3_client()
        client.upload_file(local_path, S3_BUCKET, key)
        return f"s3://{S3_BUCKET}/{key}"
    else:
        dest = LOCAL_PROCESSED / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        from shutil import copyfile

        copyfile(local_path, dest)
        return str(dest)


def parse_s3_url(s3_url: str):
    """Parse s3://bucket/key into (bucket, key)"""
    if not s3_url.startswith('s3://'):
        raise ValueError('Not an s3 url')
    parts = s3_url[5:].split('/', 1)
    return parts[0], parts[1] if len(parts) > 1 else ''
