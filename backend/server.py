from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect, Cookie, Response, Query
from fastapi.responses import StreamingResponse, FileResponse
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from io import BytesIO
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import cv2
import numpy as np
from ultralytics import YOLO
import asyncio
import json
import base64
from collections import defaultdict, deque
import requests
import shutil
import re
import functools

# Optional OCR support for number plate extraction
try:
    import pytesseract
    # Configure Tesseract path for Windows
    import platform
    if platform.system() == 'Windows':
        tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    OCR_AVAILABLE = True
except Exception:
    pytesseract = None
    OCR_AVAILABLE = False

# Optional async file streaming support (improves first-byte latency for large files / cloud-backed drives)
try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except Exception:
    aiofiles = None
    AIOFILES_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _clean_plate_text(text: str) -> Optional[str]:
    if not text:
        return None
    # Keep only alphanumeric and space/hyphen
    cleaned = re.sub(r'[^A-Za-z0-9\- ]', '', text).strip()
    # Normalize multiple spaces/hyphens
    cleaned = re.sub(r'\s+', ' ', cleaned)
    # Remove leading/trailing spaces but keep internal spaces
    cleaned = cleaned.strip()
    
    if len(cleaned) >= 4:
        cleaned = cleaned.upper()
        # Log the raw cleaned text for debugging
        logger.debug(f'Cleaned plate text: "{text}" -> "{cleaned}"')
        return cleaned
    return None


def _validate_indian_plate_format(text: str) -> bool:
    """Validate if text matches common Indian license plate formats.
    Formats: XX ## XX #### or XX##XX#### (with/without spaces)
    """
    if not text:
        return False
    # Remove spaces for validation
    no_spaces = re.sub(r'\s+', '', text)
    # Pattern: 2 letters, 2 digits, 1-2 letters, 3-4 digits
    pattern = r'^[A-Z]{2}\d{2}[A-Z]{1,2}\d{3,4}$'
    return bool(re.match(pattern, no_spaces))


def extract_plate_text(frame: Any, bbox: tuple) -> Optional[str]:
    """Crop bbox from frame and run OCR to extract plate text. Returns cleaned string or None."""
    if not OCR_AVAILABLE:
        logger.warning('pytesseract not available; skipping OCR')
        return None
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]
    x1c, y1c = max(0, x1), max(0, y1)
    x2c, y2c = min(w, x2), min(h, y2)
    crop = frame[y1c:y2c, x1c:x2c]
    if crop.size == 0:
        return None
    try:
        # 1) Preprocess: convert to gray
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        
        # Always upscale to improve OCR accuracy - target at least 400px width
        target_width = 400
        current_width = gray.shape[1]
        if current_width < target_width:
            scale = target_width / current_width
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        # Optimized: Only try 3 best preprocessing strategies (reduced from 7 for speed)
        preprocessed_images = []
        
        # Strategy 1: OTSU threshold (good for high contrast plates) - FASTEST
        _, th2 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        preprocessed_images.append(('th2', th2))
        
        # Strategy 2: Bilateral filter + adaptive threshold (good for noisy images)
        denoised = cv2.bilateralFilter(gray, 9, 75, 75)
        th1 = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 31, 5)
        preprocessed_images.append(('th1', th1))
        
        # Strategy 3: Contrast enhancement + threshold (for low contrast)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        _, th3 = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        preprocessed_images.append(('th3', th3))
        
        # Optimized: Only try 2 best PSM modes (reduced from 5 for speed)
        # PSM 6 (uniform block) often works best for Indian license plates
        psm_modes = [
            ('6', '--psm 6'),  # Single uniform block (best for Indian plates)
            ('7', '--psm 7'),  # Single text line (second best)
        ]
        
        # Try with whitelist first (faster, more accurate for plates)
        whitelist_config = "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- "
        
        # Try each preprocessing + PSM combination with early exit for good results
        best_result = None
        best_confidence = 0
        all_attempts = []
        CONFIDENCE_THRESHOLD = 70  # Early exit if we get high confidence
        
        for img_name, processed_img in preprocessed_images:
            for psm_name, psm_config in psm_modes:
                try:
                    config = f"{psm_config} --oem 3 {whitelist_config}"
                    # Get both text and confidence data
                    raw = pytesseract.image_to_string(processed_img, config=config)
                    data = pytesseract.image_to_data(processed_img, config=config, output_type=pytesseract.Output.DICT)
                    
                    # Calculate average confidence for the text
                    confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                    
                    cleaned = _clean_plate_text(raw)
                    
                    # Early exit if we get a high-confidence valid result
                    if cleaned and _validate_indian_plate_format(cleaned) and avg_confidence >= CONFIDENCE_THRESHOLD:
                        logger.info(f'OCR early exit: "{cleaned}" (confidence: {avg_confidence:.1f}) from {len(all_attempts) + 1} attempts')
                        return cleaned
                    if cleaned and len(cleaned) >= 4:
                        all_attempts.append((cleaned, avg_confidence, f'{img_name}+PSM{psm_name}'))
                        logger.debug(f'OCR attempt: {img_name} + PSM {psm_name} -> raw: "{raw}" cleaned: "{cleaned}" confidence: {avg_confidence:.1f}')
                        
                        # Prefer results that match Indian plate format, then by confidence
                        is_valid_format = _validate_indian_plate_format(cleaned)
                        score = avg_confidence + (20 if is_valid_format else 0)  # Bonus for valid format
                        
                        if score > best_confidence:
                            best_result = cleaned
                            best_confidence = score
                            if is_valid_format:
                                logger.debug(f'Found valid Indian plate format: {cleaned}')
                except Exception as e:
                    logger.debug(f'OCR attempt failed: {img_name} + PSM {psm_name}: {e}')
                    continue
        
        # If we got a result, log all attempts and return the best one
        if best_result:
            logger.info(f'OCR success: "{best_result}" (confidence: {best_confidence:.1f}) from {len(all_attempts)} attempts')
            if len(all_attempts) > 1:
                logger.debug(f'All OCR attempts: {all_attempts}')
            return best_result
        
        # Fallback: Try without whitelist (slower but might catch edge cases)
        # Optimized: Only try first 2 preprocessing strategies and first 2 PSM modes for speed
        for img_name, processed_img in preprocessed_images[:2]:
            for psm_name, psm_config in psm_modes[:2]:
                try:
                    config = f"{psm_config} --oem 3"
                    raw = pytesseract.image_to_string(processed_img, config=config)
                    data = pytesseract.image_to_data(processed_img, config=config, output_type=pytesseract.Output.DICT)
                    confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                    
                    cleaned = _clean_plate_text(raw)
                    if cleaned and len(cleaned) >= 4:
                        logger.info(f'OCR success (no whitelist) with {img_name} + PSM {psm_name}: "{cleaned}" (confidence: {avg_confidence:.1f})')
                        logger.debug(f'Raw OCR output: "{raw}"')
                        
                        # Prefer results that match Indian plate format
                        is_valid_format = _validate_indian_plate_format(cleaned)
                        score = avg_confidence + (20 if is_valid_format else 0)
                        
                        if score > best_confidence:
                            best_result = cleaned
                            best_confidence = score
                            if is_valid_format:
                                logger.debug(f'Found valid Indian plate format (no whitelist): {cleaned}')
                except Exception as e:
                    logger.debug(f'OCR fallback attempt failed: {img_name} + PSM {psm_name}: {e}')
                    continue
        
        if best_result:
            return best_result
        
        # Log all failed attempts for debugging
        logger.warning(f'OCR failed to extract plate text after trying {len(all_attempts)} strategies')
        if all_attempts:
            logger.debug(f'All OCR attempts (even low confidence): {all_attempts}')
        return None
    except Exception as e:
        logger.exception('OCR failed: %s', e)
        return None


def try_ocr_full_image_for_plate(image_path: str) -> Optional[str]:
    """Fallback OCR: run plate OCR on the detected image when no plate text was stored.

    Heuristic: many plates in bike/car rear views sit near the lower-middle of the crop,
    so we first OCR a central-bottom region, then fall back to the full image.
    """
    if not OCR_AVAILABLE:
        return None
    if not image_path or not os.path.exists(image_path):
        return None
    img = cv2.imread(image_path)
    if img is None:
        return None
    h, w = img.shape[:2]

    # 1) Try a heuristic ROI around the lower-middle area where plates typically appear
    x1 = int(0.2 * w)
    x2 = int(0.8 * w)
    y1 = int(0.4 * h)
    y2 = int(0.95 * h)
    text = extract_plate_text(img, (x1, y1, x2, y2))
    if text:
        return text

    # 2) Fall back to full image OCR
    return extract_plate_text(img, (0, 0, w, h))


async def create_challan_for_violation(violation_id: str, user_id: str, violation_type: str, plate_text: Optional[str], plate_detected: bool = False, detected_image: Optional[Any] = None):
    """Create a Challan record linked to a violation and update the violation with plate info.

    detected_image may be an OpenCV/numpy image or bytes; if provided, it will be saved to disk
    and the path stored in the challan document as `detected_image_path`.
    """
    # Use the centralized fine amount function for consistency
    fine = get_fine_amount(violation_type)
    challan = Challan(
        user_id=user_id,
        violation_id=violation_id,
        challan_number=f"CHAL-{str(uuid.uuid4())[:8].upper()}",
        fine_amount=fine
    )
    challan_dict = challan.model_dump()
    # Add optional data so challan document is self-contained
    if plate_text:
        challan_dict['plate_number'] = plate_text
        challan_dict['plate_readable'] = True
    elif plate_detected:
        # plate bbox was detected but OCR failed -> issue a preset challan and mark unreadable
        challan_dict['plate_number'] = None
        challan_dict['plate_readable'] = False
        challan_dict['preset_challan'] = True
        challan_dict['notes'] = 'Number plate detected but OCR unreadable; issued preset challan.'

    # Save detected image if provided
    saved_image_path = None
    if detected_image is not None:
        try:
            img_name = f"{challan.challan_number}.jpg"
            img_path = PROCESSED_CHALLANS_DIR / img_name
            loop = asyncio.get_running_loop()
            if hasattr(detected_image, 'dtype'):
                # Run cv2.imwrite in thread pool
                await loop.run_in_executor(None, functools.partial(cv2.imwrite, str(img_path), detected_image))
            else:
                # Write bytes in thread pool
                await loop.run_in_executor(None, lambda: open(str(img_path), 'wb').write(detected_image))
            challan_dict['detected_image_path'] = str(img_path)
            saved_image_path = str(img_path)
        except Exception:
            logger.exception('Failed to save detected image for challan')

    # If plate was detected but OCR failed initially, retry OCR on the saved image
    # This helps catch cases where the plate is clearly visible but initial OCR failed
    if plate_detected and not plate_text and saved_image_path and os.path.exists(saved_image_path):
        logger.info(f'Retrying OCR on saved image for challan {challan.challan_number}')
        retry_plate_text = try_ocr_full_image_for_plate(saved_image_path)
        if retry_plate_text:
            logger.info(f'OCR retry successful! Extracted plate: {retry_plate_text}')
            plate_text = retry_plate_text
            challan_dict['plate_number'] = plate_text
            challan_dict['plate_readable'] = True
            challan_dict['preset_challan'] = False
            challan_dict['notes'] = 'Number plate successfully extracted on retry.'

    challan_dict['violation_type'] = violation_type
    challan_dict['generated_at'] = challan_dict['generated_at'].isoformat()
    await db.challans.insert_one(challan_dict)

    # Persist a styled PDF copy of the challan immediately so e-challan is available on detection
    try:
        loop = asyncio.get_running_loop()
        # Build PDF in thread pool (may be CPU heavy)
        pdf_buf = await loop.run_in_executor(None, functools.partial(build_styled_challan_pdf, challan_dict))
        pdf_path = PROCESSED_CHALLANS_DIR / f"{challan_dict['challan_number']}.pdf"
        # Write PDF in thread pool
        await loop.run_in_executor(None, lambda: open(str(pdf_path), 'wb').write(pdf_buf.getvalue()))
        # Store the file path in the challan document for easy access
        await db.challans.update_one({'id': challan_dict['id']}, {'$set': {'pdf_path': str(pdf_path)}})
    except Exception:
        logger.exception('Failed to generate styled challan PDF on creation')

    # Update violation with plate and challan reference (if possible)
    update = {'challan_number': challan_dict['challan_number']}
    if plate_text:
        update['plate_number'] = plate_text
        update['plate_readable'] = True
    elif plate_detected:
        update['plate_number'] = None
        update['plate_readable'] = False
    if challan_dict.get('detected_image_path'):
        update['detected_image_path'] = challan_dict['detected_image_path']
    if 'pdf_path' in locals():
        update['pdf_path'] = str(pdf_path)
    await db.violations.update_one({'id': violation_id}, {'$set': update})
    logger.info(f"Created challan {challan_dict['challan_number']} for violation {violation_id} (plate={plate_text})")
    return challan_dict

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Load YOLO model
MODEL_PATH = ROOT_DIR / "models" / "best.pt"
model = YOLO(str(MODEL_PATH))

# Model inference configuration (smaller size for faster throughput)
MODEL_INFER_IMG = int(os.environ.get('MODEL_INFER_IMG', '512'))
logger.info(f"Model inference image size set to {MODEL_INFER_IMG}px")

# Lightweight wrapper for model prediction with tuned defaults for speed
def model_predict(frame_or_batch, **kwargs):
    base = {'verbose': False, 'imgsz': MODEL_INFER_IMG, 'conf': 0.35}
    base.update(kwargs)
    return model.predict(frame_or_batch, **base)

# Create directories for uploads and processed videos/images
UPLOADS_DIR = ROOT_DIR / "uploads"
PROCESSED_DIR = ROOT_DIR / "processed"
PHOTOS_DIR = ROOT_DIR / "photos"
PROCESSED_PHOTOS_DIR = ROOT_DIR / "processed_photos"
PROCESSED_CHALLANS_DIR = ROOT_DIR / "processed_challans"
UPLOADS_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)
PHOTOS_DIR.mkdir(exist_ok=True)
PROCESSED_PHOTOS_DIR.mkdir(exist_ok=True)
PROCESSED_CHALLANS_DIR.mkdir(exist_ok=True)

# Extract clean class names from model (handle metadata in names)
MODEL_CLASS_NAMES = model.names
CLASS_NAMES: Dict[int, str] = {}
for idx, name in MODEL_CLASS_NAMES.items():
    # Names may be in the form "prefix-type-cleanname" or other variants.
    if '-' in name:
        parts = name.split('-')
        # Prefer the 3rd segment if present, otherwise take the last part
        clean_name = parts[2].strip() if len(parts) > 2 else parts[-1].strip()
    else:
        clean_name = name
    CLASS_NAMES[idx] = clean_name

logger.info(f"Loaded YOLOv8 model with classes: {CLASS_NAMES}")


# --- Simple API endpoints for frontend selectors ---
@app.get("/api/models")
async def get_models():
    """Return available model files in the `models/` directory for frontend selectors.

    The frontend expects a list of objects with `id` and `name` fields. We list
    all model files (e.g. `.pt`, `.pth`, `.onnx`) from the models directory and
    fall back to the currently loaded model if nothing else is found.
    """
    try:
        models_dir = ROOT_DIR / 'models'
        model_files = []
        if models_dir.exists():
            for i, p in enumerate(sorted(models_dir.iterdir())):
                if p.is_file() and p.suffix.lower() in ('.pt', '.pth', '.onnx', '.ptl'):
                    model_files.append({"id": i, "name": p.name})

        # Fallback to the currently loaded model if the models folder is empty
        if not model_files and MODEL_PATH.exists():
            model_files.append({"id": 0, "name": MODEL_PATH.name})

        return {"status": "ok", "models": model_files}
    except Exception as e:
        logger.exception('Failed to list models: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cameras")
async def get_cameras():
    """Return configured camera list. Reads from cameras.json if present; otherwise returns a sensible default."""
    try:
        cameras_file = ROOT_DIR / 'cameras.json'
        if cameras_file.exists():
            with open(cameras_file, 'r', encoding='utf-8') as f:
                cameras = json.load(f)
                # Expecting a list of {id, name, url} objects
                return {"status": "ok", "cameras": cameras}

        # Fallback defaults
        default_cameras = [
            {"id": "cam1", "name": "Camera 1", "url": None},
            {"id": "cam2", "name": "Camera 2", "url": None},
            {"id": "rtsp1", "name": "RTSP Stream 1", "url": None}
        ]
        return {"status": "ok", "cameras": default_cameras}
    except Exception as e:
        logger.exception('Failed to list cameras: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


# Serve a short notification audio (wav) for frontend to play when notification.mp3 isn't present
@app.get("/notification.wav")
async def notification_wav():
    """Return a short notification wav generated from embedded base64 fallback."""
    try:
        # Base64 data for a short 0.5s wav (same as fallback used in frontend)
        b64 = (
            "UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBh"
            "NjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQ"
            "AoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8OUKjk8LZjHAY4kdfyzHksBSR3x/DdkEA"
            "KFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDlCo5PC2YxwGOJHX8sx5LAUkd8fw3ZBAC"
        )
        data = base64.b64decode(b64)
        return StreamingResponse(BytesIO(data), media_type="audio/wav")
    except Exception as e:
        logger.exception('Failed to serve notification audio: %s', e)
        raise HTTPException(status_code=500, detail='Audio not available')

# Tracking data
tracker_data = defaultdict(lambda: {'positions': deque(maxlen=30), 'speeds': deque(maxlen=10), 'class': None})

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Define Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Violation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    video_id: Optional[str] = None
    photo_id: Optional[str] = None
    violation_type: str  # 'no_helmet', 'wrong_way', 'overspeeding'
    timestamp: float  # Frame timestamp in seconds
    track_id: int
    speed: Optional[float] = None
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Video(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    filename: str
    original_path: str
    processed_path: Optional[str] = None
    status: str  # 'uploading', 'processing', 'completed', 'failed'
    total_violations: int = 0
    duration: float = 0.0
    fps: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Photo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    filename: str
    original_path: str
    processed_path: Optional[str] = None
    status: str  # 'uploaded', 'processing', 'completed', 'failed'
    total_violations: int = 0
    width: int = 0
    height: int = 0
    is_video_frame: bool = False
    source_video_id: Optional[str] = None
    source_frame_timestamp: Optional[float] = None
    uploaded_via: Optional[str] = None  # 'upload' or 'video'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CalibrationZone(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    reference_distance: float  # meters
    pixel_points: List[List[float]]  # [[x1, y1], [x2, y2]] for reference line
    speed_limit: float  # km/h
    direction_zone: Optional[List[List[float]]] = None  # Polygon points for direction
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Challan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    violation_id: str
    challan_number: str
    fine_amount: float
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Auth helper functions
async def get_current_user(session_token: Optional[str] = None) -> Optional[User]:
    if not session_token:
        return None
    
    session = await db.user_sessions.find_one({"session_token": session_token})
    if not session:
        return None
    
    # Check expiry
    expires_at = session['expires_at']
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    
    # Ensure expires_at has timezone info
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": session_token})
        return None
    
    user = await db.users.find_one({"id": session['user_id']}, {"_id": 0})
    if user:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        return User(**user)
    return None

# Auth endpoints
@api_router.post("/auth/session")
async def create_session(session_id: str, response: Response):
    """Process session_id from Emergent Auth and create user session"""
    try:
        # Call Emergent Auth API
        headers = {"X-Session-ID": session_id}
        auth_response = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers=headers
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session ID")
        
        user_data = auth_response.json()
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": user_data['email']}, {"_id": 0})
        if not existing_user:
            # Create new user
            new_user = User(
                email=user_data['email'],
                name=user_data['name'],
                picture=user_data.get('picture')
            )
            user_dict = new_user.model_dump()
            user_dict['created_at'] = user_dict['created_at'].isoformat()
            await db.users.insert_one(user_dict)
            user_id = new_user.id
        else:
            user_id = existing_user['id']
        
        # Create session
        session_token = user_data['session_token']
        session = UserSession(
            user_id=user_id,
            session_token=session_token,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7)
        )
        
        session_dict = session.model_dump()
        session_dict['expires_at'] = session_dict['expires_at'].isoformat()
        session_dict['created_at'] = session_dict['created_at'].isoformat()
        await db.user_sessions.insert_one(session_dict)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=7 * 24 * 60 * 60,
            path="/"
        )
        
        return {"success": True, "user_id": user_id}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

@api_router.post("/auth/logout")
async def logout(session_token: Optional[str] = Cookie(None), response: Response = None):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"success": True}

# Video upload and processing
@api_router.post("/videos/upload")
async def upload_video(file: UploadFile = File(...), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Save uploaded file
    video_id = str(uuid.uuid4())
    file_extension = Path(file.filename).suffix
    file_path = UPLOADS_DIR / f"{video_id}{file_extension}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get video properties
    cap = cv2.VideoCapture(str(file_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    cap.release()
    
    # Create video record
    video = Video(
        id=video_id,
        user_id=user.id,
        filename=file.filename,
        original_path=str(file_path),
        status="uploaded",
        duration=duration,
        fps=fps
    )
    
    video_dict = video.model_dump()
    video_dict['created_at'] = video_dict['created_at'].isoformat()
    await db.videos.insert_one(video_dict)
    
    return video

@api_router.post("/videos/{video_id}/process")
async def process_video(video_id: str, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get video
    video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Start processing in background
    asyncio.create_task(process_video_background(video_id, user.id))
    
    return {"status": "processing", "video_id": video_id}

async def process_video_background(video_id: str, user_id: str):
    """Process video with YOLOv8 and detect violations"""
    try:
        # Update status
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"status": "processing"}}
        )
        
        video = await db.videos.find_one({"id": video_id}, {"_id": 0})
        input_path = video['original_path']
        output_path = str(PROCESSED_DIR / f"{video_id}_processed.mp4")
        
        # Open video
        cap = cv2.VideoCapture(input_path)
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        frame_idx = 0
        violations_count = 0
        tracker_data = defaultdict(lambda: {'positions': deque(maxlen=30), 'class': None, 'violations': set()})
        
        # Get calibration (default if none exists). Use the most recently saved calibration for the user.
        calibration = await db.calibration_zones.find_one({"user_id": user_id}, {"_id": 0}, sort=[("created_at", -1)])
        pixels_per_meter = 50  # Default
        speed_limit = 60  # km/h
        
        if calibration and calibration.get('reference_distance'):
            ref_points = calibration['pixel_points']
            pixel_distance = np.sqrt((ref_points[1][0] - ref_points[0][0])**2 + 
                                    (ref_points[1][1] - ref_points[0][1])**2)
            # Ensure reference_distance is a positive number set by the user (avoid silent defaulting)
            try:
                ref_dist = float(calibration['reference_distance'])
                if ref_dist > 0:
                    pixels_per_meter = pixel_distance / ref_dist
                    speed_limit = calibration.get('speed_limit', 60)
                    logger.info(f"Using calibration for user {user_id}: reference_distance={ref_dist}, pixels_per_meter={pixels_per_meter:.2f}, speed_limit={speed_limit}")
                else:
                    logger.warning(f"Invalid calibration.reference_distance ({ref_dist}) for user {user_id}; using default")
            except Exception as e:
                logger.warning(f"Error parsing calibration.reference_distance for user {user_id}: {e}; using default")
        
        # Frame skipping for faster processing: process every 3rd frame
        # This speeds up processing ~3x while maintaining good tracking accuracy
        FRAME_SKIP = 3
        frames_to_write = []
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Skip frames for faster processing (but still write all frames to output)
            if frame_idx % FRAME_SKIP != 0:
                # Still write the frame to output video, but skip detection
                frames_to_write.append((frame_idx, frame.copy()))
                frame_idx += 1
                continue
            
            # Run YOLOv8 detection with tracking (only on sampled frames)
            results = model.track(frame, persist=True, verbose=False)
            
            # Collect all detections in this frame for violation detection
            frame_detections = {
                'helmets': [],
                'no_helmets': [],
                'vehicles': [],
                'riders': []
            }
            
            if results[0].boxes is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                classes = results[0].boxes.cls.cpu().numpy().astype(int)
                confidences = results[0].boxes.conf.cpu().numpy()
                
                # Collect all detections in this frame
                for box, cls, conf in zip(boxes, classes, confidences):
                    x1, y1, x2, y2 = box
                    class_name = CLASS_NAMES.get(int(cls), 'unknown').lower()
                    center_x = (x1 + x2) / 2
                    center_y = (y1 + y2) / 2
                    
                    # Categorize detections
                    if 'helmet' in class_name and 'no' not in class_name:
                        frame_detections['helmets'].append({
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'center': [center_x, center_y],
                            'confidence': float(conf)
                        })
                    elif 'no_helmet' in class_name or 'nohelmet' in class_name or class_name == 'no helmet':
                        frame_detections['no_helmets'].append({
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'center': [center_x, center_y],
                            'confidence': float(conf)
                        })
                    elif class_name in ['bike', 'motorcycle', 'bicycle', 'vehicle', 'car', 'auto']:
                        frame_detections['vehicles'].append({
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'center': [center_x, center_y],
                            'confidence': float(conf)
                        })
                    elif class_name == 'rider':
                        frame_detections['riders'].append({
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'center': [center_x, center_y],
                            'confidence': float(conf)
                        })
            
            if results[0].boxes is not None and results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)
                classes = results[0].boxes.cls.cpu().numpy().astype(int)
                confidences = results[0].boxes.conf.cpu().numpy()
                
                for box, track_id, cls, conf in zip(boxes, track_ids, classes, confidences):
                    x1, y1, x2, y2 = box
                    class_name = CLASS_NAMES.get(int(cls), 'unknown')
                    
                    # Calculate center
                    center_x = (x1 + x2) / 2
                    center_y = (y1 + y2) / 2
                    
                    # Update tracker
                    tracker_data[track_id]['positions'].append((center_x, center_y, frame_idx))
                    tracker_data[track_id]['class'] = class_name
                    
                    # Calculate speed if enough positions
                    speed = None
                    if len(tracker_data[track_id]['positions']) >= 5:
                        positions = list(tracker_data[track_id]['positions'])
                        first_pos = positions[0]
                        last_pos = positions[-1]
                        
                        distance_pixels = np.sqrt((last_pos[0] - first_pos[0])**2 + 
                                                (last_pos[1] - first_pos[1])**2)
                        distance_meters = distance_pixels / pixels_per_meter
                        time_diff = (last_pos[2] - first_pos[2]) / fps
                        
                        if time_diff > 0:
                            speed = (distance_meters / time_diff) * 3.6  # m/s to km/h
                    
                    # Detect violations - can have multiple violations per track
                    violations_to_save = []
                    
                    # No helmet detection - only consider for bike-like vehicles
                    class_name_lower = class_name.lower()
                    is_bike = any(k in class_name_lower for k in ('bike', 'motor', 'scooter'))
                    
                    if is_bike and 'no_helmet' not in tracker_data[track_id]['violations']:
                        # First, check for explicit 'no_helmet' detections near this bike
                        found_no_helmet = False
                        for nh in frame_detections['no_helmets']:
                            try:
                                dist = np.sqrt((center_x - nh['center'][0])**2 + (center_y - nh['center'][1])**2)
                            except Exception:
                                dist = float('inf')

                            # Try IoU between vehicle bbox and head bbox as well (helps when head bbox is above vehicle center)
                            iou_val = 0.0
                            try:
                                bx1, by1, bx2, by2 = [float(x1), float(y1), float(x2), float(y2)]
                                nhbx = nh.get('bbox') or nh.get('bbox', [0,0,0,0])
                                xA = max(bx1, nhbx[0])
                                yA = max(by1, nhbx[1])
                                xB = min(bx2, nhbx[2])
                                yB = min(by2, nhbx[3])
                                interW = max(0, xB - xA)
                                interH = max(0, yB - yA)
                                interArea = interW * interH
                                areaV = max(0, bx2 - bx1) * max(0, by2 - by1)
                                areaNH = max(0, nhbx[2] - nhbx[0]) * max(0, nhbx[3] - nhbx[1])
                                denom = areaV + areaNH - interArea
                                if denom > 0:
                                    iou_val = interArea / denom
                            except Exception:
                                iou_val = 0.0

                            # Match if IoU significant OR centers are reasonably close
                            if iou_val > 0.01 or dist < 200:
                                found_no_helmet = True
                                violations_to_save.append('no_helmet')
                                tracker_data[track_id]['violations'].add('no_helmet')
                                break
                        
                        # Note: do NOT infer no_helmet from absence of helmet; only explicit 'no_helmet' detections create a no_helmet violation
                        # This avoids false positives where small/occluded helmets may not be reliably detected.

                        # Triple-riding detection: require explicit 'triple' class near bike to avoid false positives
                        try:
                            for obj in detected_objects:
                                oname = obj['class'].lower()
                                if any(k in oname for k in ('triple', 'triple_riding', 'triple_ride')):
                                    # check proximity
                                    dist_r = np.sqrt((center_x - obj['center'][0])**2 + (center_y - obj['center'][1])**2)
                                    if dist_r < 300 and 'triple_riding' not in tracker_data[track_id]['violations']:
                                        violations_to_save.append('triple_riding')
                                        tracker_data[track_id]['violations'].add('triple_riding')
                                        break
                        except Exception:
                            pass
                    
                    # Overspeeding detection - use user-set speed limits (supports per-vehicle limits)
                    user_settings = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
                    # Prefer calibration speed_limit when available; otherwise fall back to user settings or default
                    calib_speed_limit = calibration.get('speed_limit') if calibration else None
                    base_limit = calib_speed_limit if calib_speed_limit else (user_settings.get('speed_limit', 20) if user_settings else 20)
                    bike_limit = user_settings.get('bike_speed_limit', base_limit) if user_settings else base_limit
                    car_limit = user_settings.get('car_speed_limit', base_limit) if user_settings else base_limit
                    # Choose limit based on detected class
                    if any(k in class_name_lower for k in ('bike', 'motor', 'scooter')):
                        limit = bike_limit
                    elif any(k in class_name_lower for k in ('car', 'auto', 'vehicle')):
                        limit = car_limit
                    else:
                        limit = base_limit
                    if calib_speed_limit:
                        logger.debug(f"Using calibration speed_limit={calib_speed_limit} as base limit for user {user_id}")
                    if speed and speed > limit and 'overspeeding' not in tracker_data[track_id]['violations']:
                        violations_to_save.append('overspeeding')
                        tracker_data[track_id]['violations'].add('overspeeding')
                    
                    # Save violations to database (can save multiple violations per detection)
                    for violation_type in violations_to_save:
                        violation = Violation(
                            user_id=user_id,
                            video_id=video_id,
                            photo_id=None,
                            violation_type=violation_type,
                            timestamp=frame_idx / fps,
                            track_id=int(track_id),
                            speed=speed,
                            confidence=float(conf),
                            bbox=[float(x1), float(y1), float(x2), float(y2)]
                        )
                        
                        violation_dict = violation.model_dump()
                        violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                        res = await db.violations.insert_one(violation_dict)
                        violation_id = violation_dict['id']
                        # Attempt to extract number plate & save a cropped photo, then create a challan for EVERY violation (fire-and-forget)
                        plate_text = None
                        plate_detected = False
                        crop = None

                        # If any plate-like boxes exist in this frame, try OCR on them
                        try:
                            if results[0].boxes is not None:
                                for pbox, pcls in zip(results[0].boxes.xyxy.cpu().numpy(), results[0].boxes.cls.cpu().numpy().astype(int)):
                                    pname = CLASS_NAMES.get(int(pcls), '').lower()
                                    if 'plate' in pname or 'number' in pname or 'license' in pname:
                                        plate_detected = True
                                        x1p, y1p, x2p, y2p = [int(v) for v in pbox]
                                        try:
                                            loop = asyncio.get_running_loop()
                                            plate_text = await loop.run_in_executor(None, functools.partial(extract_plate_text, frame, (x1p, y1p, x2p, y2p)))
                                            if plate_text:
                                                break
                                        except Exception:
                                            plate_text = None
                        except Exception:
                            # Non-fatal: continue without plate info
                            logger.debug('Plate detection attempt failed')

                        # Save a cropped photo for this violation (so video frames appear as photos)
                        try:
                            vx1, vy1, vx2, vy2 = [int(v) for v in (x1, y1, x2, y2)]
                            h, w = frame.shape[:2]
                            vx1, vy1 = max(0, vx1), max(0, vy1)
                            vx2, vy2 = min(w, vx2), min(h, vy2)
                            crop = frame[vy1:vy2, vx1:vx2]
                            photo_id = str(uuid.uuid4())
                            photo_path = PHOTOS_DIR / f"{photo_id}.jpg"
                            cv2.imwrite(str(photo_path), crop)
                            photo = Photo(
                                id=photo_id,
                                user_id=user_id,
                                filename=f"{photo_id}.jpg",
                                original_path=str(photo_path),
                                processed_path=str(photo_path),
                                status='completed',
                                width=int(vx2 - vx1) if vx2>vx1 else 0,
                                height=int(vy2 - vy1) if vy2>vy1 else 0
                            )
                            photo_dict = photo.model_dump()
                            photo_dict['created_at'] = photo_dict['created_at'].isoformat()
                            await db.photos.insert_one(photo_dict)
                            await db.violations.update_one({'id': violation_id}, {'$set': {'photo_id': photo_id}})
                        except Exception:
                            logger.exception('Failed to save violation photo')

                        # Fallback OCR: if plate not found yet and we saved a crop with a detected plate indicator, try heuristic OCR on the saved crop
                        try:
                            if not plate_text and plate_detected and 'photo_path' in locals() and os.path.exists(str(photo_path)):
                                fallback = try_ocr_full_image_for_plate(str(photo_path))
                                if fallback:
                                    plate_text = fallback
                        except Exception:
                            logger.debug('Fallback OCR failed or not available')

                        # Create challan for specific violation types (non-blocking)
                        if violation_type in ('no_helmet', 'triple_riding', 'overspeeding'):
                            try:
                                asyncio.create_task(create_challan_for_violation(violation_id, user_id, violation_type, plate_text, plate_detected=plate_detected, detected_image=crop if crop is not None else None))
                            except Exception:
                                await create_challan_for_violation(violation_id, user_id, violation_type, plate_text, plate_detected=plate_detected, detected_image=crop if crop is not None else None)

                        violations_count += 1
                    
                    # Draw on frame - use red if any violations detected
                    has_violations = len(violations_to_save) > 0
                    color = (0, 0, 255) if has_violations else (0, 255, 0)
                    cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                    
                    label = f"{class_name} #{track_id}"
                    if speed:
                        label += f" {speed:.1f}km/h"
                    if violations_to_save:
                        violation_labels = [v.upper() for v in violations_to_save]
                        label += f" [{', '.join(violation_labels)}]"
                    
                    cv2.putText(frame, label, (int(x1), int(y1) - 10),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Write processed frame
            out.write(frame)
            
            # Write any skipped frames that came before this one
            while frames_to_write and frames_to_write[0][0] < frame_idx:
                _, skipped_frame = frames_to_write.pop(0)
                out.write(skipped_frame)
            
            frame_idx += 1
        
        # Write any remaining skipped frames at the end
        while frames_to_write:
            _, skipped_frame = frames_to_write.pop(0)
            out.write(skipped_frame)
        
        cap.release()
        out.release()
        
        # Update video status
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {
                "status": "completed",
                "processed_path": output_path,
                "total_violations": violations_count
            }}
        )
        
    except Exception as e:
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"status": "failed"}}
        )
        logger.error(f"Error processing video: {str(e)}")

@api_router.get("/videos")
async def get_videos(date: Optional[str] = None, session_token: Optional[str] = Cookie(None)):
    """Get videos with optional date filtering"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    query = {"user_id": user.id}
    
    # Date filtering: if date is provided (YYYY-MM-DD format), filter by that date
    if date:
        try:
            date_prefix = date if isinstance(date, str) else datetime.fromisoformat(str(date)).strftime('%Y-%m-%d')
            query["created_at"] = {
                "$regex": f"^{date_prefix}",
                "$options": "i"
            }
        except Exception as e:
            logger.warning(f"Invalid date format: {date}, error: {e}")
    
    videos = await db.videos.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return videos

@api_router.get("/videos/{video_id}")
async def get_video(video_id: str, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@api_router.get("/videos/{video_id}/download")
async def download_processed_video(video_id: str, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
    if not video or not video.get('processed_path'):
        raise HTTPException(status_code=404, detail="Processed video not found")
    
    file_path = Path(video['processed_path'])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Processed video file missing on disk")
    headers = {
        "Content-Disposition": f'attachment; filename="processed_{video["filename"]}"',
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
    }
    if AIOFILES_AVAILABLE:
        async def file_iter(path, chunk_size: int = 4 * 1024 * 1024):
            async with aiofiles.open(path, "rb") as f:
                while True:
                    chunk = await f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(file_iter(file_path), media_type="video/mp4", headers=headers)
    else:
        resp = FileResponse(str(file_path), media_type="video/mp4", filename=f"processed_{video['filename']}")
        resp.headers.update(headers)
        return resp


@api_router.post("/videos/{video_id}/extract_frames")
async def extract_frames(video_id: str, interval_sec: float = 1.0, save_frames: bool = Query(True), session_token: Optional[str] = Cookie(None)):
    """Extract frames every `interval_sec` seconds from a video and either save them as photos (save_frames=True) or process transiently without saving (save_frames=False)."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    input_path = video['original_path']
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, int(fps * float(interval_sec)))

    frame_idx = 0
    saved = 0
    processed = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % step == 0:
                timestamp = frame_idx / (fps or 1)
                if save_frames:
                    # save frame as photo
                    photo_id = str(uuid.uuid4())
                    photo_path = PHOTOS_DIR / f"{photo_id}.jpg"
                    cv2.imwrite(str(photo_path), frame)
                    # create photo record
                    h, w = frame.shape[:2]
                    photo = Photo(
                        id=photo_id,
                        user_id=user.id,
                        filename=f"frame_{frame_idx}.jpg",
                        original_path=str(photo_path),
                        processed_path=None,
                        status='uploaded',
                        width=w,
                        height=h,
                        is_video_frame=True,
                        source_video_id=video_id,
                        source_frame_timestamp=timestamp,
                        uploaded_via="video"
                    )
                    p = photo.model_dump()
                    p['created_at'] = p['created_at'].isoformat()
                    await db.photos.insert_one(p)
                    # process asynchronously
                    asyncio.create_task(process_photo_background(photo_id, user.id))
                    saved += 1
                else:
                    # Process frame transiently (do not insert into photos collection)
                    # Run detection and violation/challan creation in background
                    asyncio.create_task(process_frame_transient(frame.copy(), user.id, video_id=video_id, timestamp=timestamp))
                    processed += 1
            frame_idx += 1
        cap.release()
    except Exception as e:
        logger.exception('Error extracting frames: %s', e)
        cap.release()
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "saved": saved, "processed": processed}


async def process_frame_transient(frame: Any, user_id: str, video_id: Optional[str] = None, timestamp: float = 0.0):
    """Process a single video-extracted frame without saving it as a Photo record. Violations and challans are still created and stored."""
    try:
        # Run YOLOv8 detection
        results = model_predict(frame)
        violations_count = 0
        detected_objects = []

        if results and results[0].boxes is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confidences = results[0].boxes.conf.cpu().numpy()

            vehicles = []
            helmets = []
            no_helmets = []
            phones = []

            for box, cls, conf in zip(boxes, classes, confidences):
                x1, y1, x2, y2 = box
                class_name = CLASS_NAMES.get(int(cls), 'unknown')
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2

                detected_objects.append({
                    'class': class_name,
                    'bbox': [float(x1), float(y1), float(x2), float(y2)],
                    'confidence': float(conf),
                    'center': [float(center_x), float(center_y)]
                })

                cname = class_name.lower()
                if any(k in cname for k in ('bike', 'motor', 'scooter')):
                    vehicles.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf), 'class': class_name})
                elif 'helmet' in cname and 'no' not in cname:
                    helmets.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})
                elif 'no_helmet' in cname or 'nohelmet' in cname or cname == 'no helmet':
                    no_helmets.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})
                elif any(k in cname for k in ('phone', 'cell', 'mobile')):
                    phones.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})

            plates = []
            for obj in detected_objects:
                cname = obj['class'].lower()
                if 'plate' in cname or 'number' in cname or 'license' in cname:
                    plates.append(obj)

            for vehicle in vehicles:
                violation_type = None

                # Match no_helmet to vehicle using IoU + center distance
                def bbox_iou(b1, b2):
                    x1 = max(b1[0], b2[0])
                    y1 = max(b1[1], b2[1])
                    x2 = min(b1[2], b2[2])
                    y2 = min(b1[3], b2[3])
                    inter_w = max(0, x2 - x1)
                    inter_h = max(0, y2 - y1)
                    inter_area = inter_w * inter_h
                    area1 = max(0, b1[2] - b1[0]) * max(0, b1[3] - b1[1])
                    area2 = max(0, b2[2] - b2[0]) * max(0, b2[3] - b2[1])
                    denom = area1 + area2 - inter_area
                    return (inter_area / denom) if denom > 0 else 0.0

                nh_found = False
                try:
                    for nh in no_helmets:
                        try:
                            dist = np.sqrt((vehicle['center'][0] - nh['center'][0])**2 + (vehicle['center'][1] - nh['center'][1])**2)
                        except Exception:
                            dist = float('inf')
                        iou_val = 0.0
                        try:
                            iou_val = bbox_iou(vehicle['bbox'], nh['bbox'])
                        except Exception:
                            iou_val = 0.0
                        if iou_val > 0.01 or dist < 150:
                            violation_type = 'no_helmet'
                            nh_found = True
                            break
                        for obj in detected_objects:
                            oname = obj['class'].lower()
                            if any(k in oname for k in ('triple', 'triple_riding', 'triple_ride')):
                                dist_r = np.sqrt((vehicle['center'][0] - obj['center'][0])**2 + (vehicle['center'][1] - obj['center'][1])**2)
                                if dist_r < 300:
                                    violation_type = 'triple_riding'
                                    break
                except Exception:
                    pass

                if (violation_type is None or violation_type == 'no_helmet') and violation_type != 'triple_riding':
                    for ph in phones:
                        distp = np.sqrt((vehicle['center'][0] - ph['center'][0])**2 + (vehicle['center'][1] - ph['center'][1])**2)
                        if distp < 150:
                            violation_type = 'cell_phone'
                            break

                if violation_type:
                    violation = Violation(
                        user_id=user_id,
                        video_id=video_id,
                        photo_id=None,
                        violation_type=violation_type,
                        timestamp=timestamp,
                        track_id=0,
                        speed=None,
                        confidence=vehicle.get('confidence', 0.0),
                        bbox=vehicle['bbox']
                    )

                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    await db.violations.insert_one(violation_dict)
                    violations_count += 1

                    plate_text = None
                    plate_detected = False
                    crop = None
                    if plates:
                        plate_detected = True
                        best = None
                        best_dist = float('inf')
                        for p in plates:
                            pdist = np.sqrt((vehicle['center'][0] - p['center'][0])**2 + (vehicle['center'][1] - p['center'][1])**2)
                            if pdist < best_dist:
                                best_dist = pdist
                                best = p
                        if best and best_dist < 300:
                            bx1, by1, bx2, by2 = [int(v) for v in best['bbox']]
                            try:
                                loop = asyncio.get_running_loop()
                                plate_text = await loop.run_in_executor(None, functools.partial(extract_plate_text, frame, (bx1, by1, bx2, by2)))
                            except Exception:
                                plate_text = None

                    # Try to create challan with cropped image if plate present
                    if plate_detected:
                        try:
                            vx1, vy1, vx2, vy2 = [int(v) for v in vehicle['bbox']]
                            h, w = frame.shape[:2]
                            x1 = max(0, vx1 - 20)
                            y1 = max(0, vy1 - 20)
                            x2 = min(w, vx2 + 20)
                            y2 = min(h, vy2 + 20)
                            crop = frame[y1:y2, x1:x2]
                        except Exception:
                            crop = None

                    # Create challan only for specific violation types (non-blocking)
                    if violation_type in ('no_helmet', 'triple_riding', 'overspeeding'):
                        try:
                            asyncio.create_task(create_challan_for_violation(violation_dict['id'], user_id, violation_type, plate_text, plate_detected, detected_image=crop))
                        except Exception:
                            logger.exception('Failed to create challan for transient frame')

        logger.info(f'Processed transient frame for video {video_id}: violations={violations_count}')
    except Exception as e:
        logger.exception('Error processing transient frame: %s', e)

@api_router.get("/violations")
async def get_violations(
    video_id: Optional[str] = None, 
    photo_id: Optional[str] = None, 
    date: Optional[str] = None,
    limit: int = 1000,
    skip: int = 0,
    session_token: Optional[str] = Cookie(None)
):
    """Get violations with optional date filtering and pagination for performance"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    query = {"user_id": user.id}
    if video_id:
        query["video_id"] = video_id
    if photo_id:
        query["photo_id"] = photo_id
    
    # Date filtering: if date is provided (YYYY-MM-DD format), filter by that date
    if date:
        try:
            # Parse date string (YYYY-MM-DD) and create date range for the entire day
            if isinstance(date, str):
                # Parse YYYY-MM-DD format
                year, month, day = map(int, date.split('-'))
                target_date = datetime(year, month, day, tzinfo=timezone.utc)
            else:
                target_date = datetime.fromisoformat(str(date)).replace(tzinfo=timezone.utc)
            
            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            # MongoDB query for ISO string dates stored as strings
            # Match dates that start with the date string (YYYY-MM-DD)
            date_prefix = date if isinstance(date, str) else target_date.strftime('%Y-%m-%d')
            query["created_at"] = {
                "$regex": f"^{date_prefix}",
                "$options": "i"
            }
        except Exception as e:
            logger.warning(f"Invalid date format: {date}, error: {e}")
    
    violations = await db.violations.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return violations

class CalibrationRequest(BaseModel):
    name: str
    reference_distance: float
    pixel_points: List[List[float]]
    speed_limit: float

class SpeedLimitRequest(BaseModel):
    speed_limit: float

@api_router.post("/calibration")
async def create_calibration(
    request: CalibrationRequest,
    session_token: Optional[str] = Cookie(None)
):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    calibration = CalibrationZone(
        user_id=user.id,
        name=request.name,
        reference_distance=request.reference_distance,
        pixel_points=request.pixel_points,
        speed_limit=request.speed_limit
    )
    
    calib_dict = calibration.model_dump()
    calib_dict['created_at'] = calib_dict['created_at'].isoformat()
    # Upsert the calibration for this user so there's a single authoritative record
    await db.calibration_zones.update_one({"user_id": user.id}, {"$set": calib_dict}, upsert=True)
    # Fetch and return the saved calibration to ensure the client receives the canonical persisted values
    saved = await db.calibration_zones.find_one({"user_id": user.id}, {"_id": 0})
    logger.info(f"Saved calibration for user {user.id}: {saved}")
    return saved

@api_router.get("/calibration")
async def get_calibration(session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Return the latest calibration record for this user if present (avoid returning older defaults)
    calibration = await db.calibration_zones.find_one({"user_id": user.id}, {"_id": 0}, sort=[("created_at", -1)])
    if calibration:
        logger.info(f"Returning calibration for user {user.id}: reference_distance={calibration.get('reference_distance')}")
    return calibration if calibration else None

class SpeedLimitRequest(BaseModel):
    speed_limit: float

@api_router.post("/speed-limit")
async def set_speed_limit(
    request: SpeedLimitRequest,
    session_token: Optional[str] = Cookie(None)
):
    """Set speed limit for video violation detection"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if request.speed_limit <= 0:
        raise HTTPException(status_code=400, detail="Speed limit must be greater than 0")
    
    # Store speed limit in user settings collection
    await db.user_settings.update_one(
        {"user_id": user.id},
        {"$set": {"speed_limit": request.speed_limit, "user_id": user.id, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {"speed_limit": request.speed_limit, "message": "Speed limit updated successfully"}

@api_router.get("/speed-limit")
async def get_speed_limit(session_token: Optional[str] = Cookie(None)):
    """Get current speed limit for video violation detection"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    settings = await db.user_settings.find_one({"user_id": user.id}, {"_id": 0})
    if settings and 'speed_limit' in settings:
        return {"speed_limit": settings['speed_limit']}
    
    # Default to 20 km/h if not set
    return {"speed_limit": 20}

# Photo upload and processing
@api_router.post("/photos/upload")
async def upload_photo(file: UploadFile = File(...), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPG, PNG, BMP, WEBP")
    
    # Save uploaded file
    photo_id = str(uuid.uuid4())
    file_path = PHOTOS_DIR / f"{photo_id}{file_extension}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get image properties
    img = cv2.imread(str(file_path))
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    height, width = img.shape[:2]
    
    # Create photo record
    photo = Photo(
        id=photo_id,
        user_id=user.id,
        filename=file.filename,
        original_path=str(file_path),
        status="uploaded",
        width=width,
        height=height,
        uploaded_via="upload"
    )
    
    photo_dict = photo.model_dump()
    photo_dict['created_at'] = photo_dict['created_at'].isoformat()
    await db.photos.insert_one(photo_dict)
    
    return photo

@api_router.post("/photos/{photo_id}/process")
async def process_photo(photo_id: str, sync: bool = Query(False), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get photo
    photo = await db.photos.find_one({"id": photo_id, "user_id": user.id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    if sync:
        # Run processing and return violations + challans for immediate inspection
        await process_photo_background(photo_id, user.id)
        violations = await db.violations.find({'photo_id': photo_id, 'user_id': user.id}, {'_id':0}).sort('created_at', -1).to_list(100)
        challans = await db.challans.find({'user_id': user.id, 'violation_id': {'$in': [v['id'] for v in violations]}}, {'_id':0}).to_list(100)
        return {'status': 'completed', 'photo_id': photo_id, 'violations': violations, 'challans': challans}

    # Default: run in background
    asyncio.create_task(process_photo_background(photo_id, user.id))
    return {"status": "processing", "photo_id": photo_id}

async def process_photo_background(photo_id: str, user_id: str):
    """Process photo with YOLOv8 and detect violations"""
    try:
        # Update status
        await db.photos.update_one(
            {"id": photo_id},
            {"$set": {"status": "processing"}}
        )
        
        photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
        input_path = photo['original_path']
        output_path = str(PROCESSED_PHOTOS_DIR / f"{photo_id}_processed.jpg")
        
        # Load image
        frame = cv2.imread(input_path)
        if frame is None:
            raise ValueError("Could not load image")
        
        # Run YOLOv8 detection (use smaller img size + lower verbosity for speed)
        results = model_predict(frame)
        
        violations_count = 0
        detected_objects = []
        
        if results[0].boxes is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)
            confidences = results[0].boxes.conf.cpu().numpy()
            
            # Group detections by class for violation detection
            vehicles = []
            helmets = []
            no_helmets = []
            phones = []

            for box, cls, conf in zip(boxes, classes, confidences):
                x1, y1, x2, y2 = box
                class_name = CLASS_NAMES.get(int(cls), 'unknown')
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2

                detected_objects.append({
                    'class': class_name,
                    'bbox': [float(x1), float(y1), float(x2), float(y2)],
                    'confidence': float(conf),
                    'center': [float(center_x), float(center_y)]
                })

                cname = class_name.lower()
                # Vehicles: look for keywords 'bike', 'motor', 'scooter'
                if any(k in cname for k in ('bike', 'motor', 'scooter')):
                    vehicles.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf), 'class': class_name})
                elif 'helmet' in cname and 'no' not in cname:
                    helmets.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})
                elif 'no_helmet' in cname or 'nohelmet' in cname or cname == 'no helmet':
                    no_helmets.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})
                elif any(k in cname for k in ('phone', 'cell', 'mobile')):
                    phones.append({'bbox': [float(x1), float(y1), float(x2), float(y2)], 'center':[float(center_x), float(center_y)], 'confidence': float(conf)})
            
            # Build plate list for OCR
            plates = []
            for obj in detected_objects:
                cname = obj['class'].lower()
                if 'plate' in cname or 'number' in cname or 'license' in cname:
                    plates.append(obj)

            # Classes-only rule: if any vehicle-like object and any explicit 'no_helmet' detection exist
            # then create violations based on classes (no IoU/distance gating). Create one violation per
            # detected no_helmet and attempt OCR using the nearest plate to that no_helmet.
            classes_only_nohelmet_handled = False
            if vehicles and no_helmets:
                created_local_violations = []
                for nh in no_helmets:
                    violation = Violation(
                        user_id=user_id,
                        video_id=None,
                        violation_type='no_helmet',
                        timestamp=0.0,
                        track_id=0,
                        speed=None,
                        confidence=float(nh.get('confidence', 0.0)),
                        bbox=nh.get('bbox')
                    )
                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    violation_dict['photo_id'] = photo_id
                    await db.violations.insert_one(violation_dict)

                    # Attempt nearest-plate OCR relative to the no_helmet detection
                    plate_text = None
                    plate_detected = False
                    try:
                        if plates:
                            best = None
                            best_dist = float('inf')
                            for p in plates:
                                pdist = np.sqrt((nh['center'][0] - p['center'][0])**2 + (nh['center'][1] - p['center'][1])**2)
                                if pdist < best_dist:
                                    best_dist = pdist
                                    best = p
                            if best and best_dist < 300:
                                bx1, by1, bx2, by2 = [int(v) for v in best['bbox']]
                                loop = asyncio.get_running_loop()
                                try:
                                    plate_text = await loop.run_in_executor(None, functools.partial(extract_plate_text, frame, (bx1, by1, bx2, by2)))
                                    if plate_text:
                                        plate_detected = True
                                except Exception:
                                    plate_text = None
                    except Exception:
                        plate_text = None

                    # Crop around the no_helmet bbox for challan image
                    try:
                        x1, y1, x2, y2 = [int(v) for v in nh.get('bbox', [0,0,0,0])]
                        h, w = frame.shape[:2]
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        crop = frame[y1:y2, x1:x2]
                    except Exception:
                        crop = None

                    created_local_violations.append({'id': violation_dict['id'], 'type': 'no_helmet', 'plate_text': plate_text, 'plate_detected': plate_detected, 'crop': crop})
                    violations_count += 1

                    # Immediate challan creation (non-blocking)
                    try:
                        asyncio.create_task(create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop))
                    except Exception:
                        await create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop)

                if 'created_violations' not in locals():
                    created_violations = []
                created_violations.extend(created_local_violations)
                # Prevent duplicate per-vehicle matching/creation later in the loop
                no_helmets = []
                classes_only_nohelmet_handled = True

            # Classes-only rule: if any vehicle-like object and any explicit 'no_helmet' detection exist
            # then create violations based on classes (no IoU/distance gating). This prevents missing
            # violations due to bbox offsets. We create one violation per detected no_helmet object
            # and attempt OCR using the nearest plate to that no_helmet.
            classes_only_nohelmet_handled = False
            if vehicles and no_helmets:
                created_local_violations = []
                for nh in no_helmets:
                    violation = Violation(
                        user_id=user_id,
                        video_id=None,
                        violation_type='no_helmet',
                        timestamp=0.0,
                        track_id=0,
                        speed=None,
                        confidence=float(nh.get('confidence', 0.0)),
                        bbox=nh.get('bbox')
                    )
                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    violation_dict['photo_id'] = photo_id
                    await db.violations.insert_one(violation_dict)

                    # Attempt nearest-plate OCR relative to the no_helmet detection
                    plate_text = None
                    plate_detected = False
                    try:
                        if plates:
                            best = None
                            best_dist = float('inf')
                            for p in plates:
                                pdist = np.sqrt((nh['center'][0] - p['center'][0])**2 + (nh['center'][1] - p['center'][1])**2)
                                if pdist < best_dist:
                                    best_dist = pdist
                                    best = p
                            if best and best_dist < 300:
                                bx1, by1, bx2, by2 = [int(v) for v in best['bbox']]
                                loop = asyncio.get_running_loop()
                                try:
                                    plate_text = await loop.run_in_executor(None, functools.partial(extract_plate_text, frame, (bx1, by1, bx2, by2)))
                                    if plate_text:
                                        plate_detected = True
                                except Exception:
                                    plate_text = None
                    except Exception:
                        plate_text = None

                    # Crop around the no_helmet bbox for challan image
                    try:
                        x1, y1, x2, y2 = [int(v) for v in nh.get('bbox', [0,0,0,0])]
                        h, w = frame.shape[:2]
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        crop = frame[y1:y2, x1:x2]
                    except Exception:
                        crop = None

                    created_local_violations.append({'id': violation_dict['id'], 'type': 'no_helmet', 'plate_text': plate_text, 'plate_detected': plate_detected, 'crop': crop})
                    violations_count += 1

                    # Immediate challan creation (non-blocking)
                    try:
                        asyncio.create_task(create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop))
                    except Exception:
                        await create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop)

                if 'created_violations' not in locals():
                    created_violations = []
                created_violations.extend(created_local_violations)
                # Prevent duplicate per-vehicle matching/creation later in the loop
                no_helmets = []
                classes_only_nohelmet_handled = True

            # Detect violations for each vehicle-like detection
            for vehicle in vehicles:
                violation_type = None

                # Prefer explicit 'no_helmet' detections near vehicle — create one violation PER detected no_helmet (per rider)
                nh_matches = []
                # Helper: compute IoU between two bboxes [x1,y1,x2,y2]
                def bbox_iou(b1, b2):
                    x1 = max(b1[0], b2[0])
                    y1 = max(b1[1], b2[1])
                    x2 = min(b1[2], b2[2])
                    y2 = min(b1[3], b2[3])
                    inter_w = max(0, x2 - x1)
                    inter_h = max(0, y2 - y1)
                    inter_area = inter_w * inter_h
                    area1 = max(0, b1[2] - b1[0]) * max(0, b1[3] - b1[1])
                    area2 = max(0, b2[2] - b2[0]) * max(0, b2[3] - b2[1])
                    denom = area1 + area2 - inter_area
                    return (inter_area / denom) if denom > 0 else 0.0

                for nh in no_helmets:
                    try:
                        dist = np.sqrt((vehicle['center'][0] - nh['center'][0])**2 + (vehicle['center'][1] - nh['center'][1])**2)
                    except Exception:
                        dist = float('inf')

                    # Prefer bbox overlap (IoU) as it's more reliable when head bbox is slightly apart from vehicle center
                    iou_val = 0.0
                    try:
                        iou_val = bbox_iou(vehicle['bbox'], nh['bbox'])
                    except Exception:
                        iou_val = 0.0

                    # Match if IoU significant OR centers are reasonably close
                    if iou_val > 0.01 or dist < 250:
                        nh_matches.append(nh)

                # Triple-riding detection: require explicit 'triple' class (e.g., 'triple_riding' or 'triple_ride') near the vehicle
                triple_present = False
                try:
                    for obj in detected_objects:
                        oname = obj['class'].lower()
                        if any(k in oname for k in ('triple', 'triple_riding', 'triple_ride')):
                            dist_r = np.sqrt((vehicle['center'][0] - obj['center'][0])**2 + (vehicle['center'][1] - obj['center'][1])**2)
                            if dist_r < 300:
                                triple_present = True
                                break
                except Exception:
                    # Fail-safe: do not break processing on heuristic errors
                    pass

                # Phone use detection: look for nearby phone-like objects
                phone_match = None
                for ph in phones:
                    distp = np.sqrt((vehicle['center'][0] - ph['center'][0])**2 + (vehicle['center'][1] - ph['center'][1])**2)
                    if distp < 150:
                        phone_match = ph
                        break

                # Prepare crop around vehicle bbox (if possible)
                try:
                    vx1, vy1, vx2, vy2 = [int(v) for v in vehicle['bbox']]
                    h, w = frame.shape[:2]
                    vx1, vy1 = max(0, vx1), max(0, vy1)
                    vx2, vy2 = min(w, vx2), min(h, vy2)
                    crop = frame[vy1:vy2, vx1:vx2]
                except Exception:
                    crop = None

                created_local_violations = []

                # Create a violation for each no_helmet detection matched
                for nh in nh_matches:
                    violation = Violation(
                        user_id=user_id,
                        video_id=None,  # No video for photos
                        violation_type='no_helmet',
                        timestamp=0.0,
                        track_id=0,
                        speed=None,
                        confidence=float(nh.get('confidence', 0.0)),
                        bbox=nh.get('bbox', vehicle['bbox'])
                    )
                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    violation_dict['photo_id'] = photo_id
                    await db.violations.insert_one(violation_dict)

                    # Attempt to find nearest plate and OCR it for challan creation
                    plate_text = None
                    plate_detected = False
                    try:
                        if plates:
                            best = None
                            best_dist = float('inf')
                            for p in plates:
                                pdist = np.sqrt((vehicle['center'][0] - p['center'][0])**2 + (vehicle['center'][1] - p['center'][1])**2)
                                if pdist < best_dist:
                                    best_dist = pdist
                                    best = p
                            if best and best_dist < 300:
                                bx1, by1, bx2, by2 = [int(v) for v in best['bbox']]
                                loop = asyncio.get_running_loop()
                                try:
                                    plate_text = await loop.run_in_executor(None, functools.partial(extract_plate_text, frame, (bx1, by1, bx2, by2)))
                                    if plate_text:
                                        plate_detected = True
                                except Exception:
                                    plate_text = None
                    except Exception:
                        plate_text = None

                    created_local_violations.append({'id': violation_dict['id'], 'type': 'no_helmet', 'plate_text': plate_text, 'plate_detected': plate_detected, 'crop': crop})
                    violations_count += 1

                    # Create challan immediately for this violation (non-blocking)
                    try:
                        asyncio.create_task(create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop))
                    except Exception:
                        await create_challan_for_violation(violation_dict['id'], user_id, 'no_helmet', plate_text, plate_detected=plate_detected, detected_image=crop)

                # Create triple_riding violation if present
                if triple_present:
                    violation = Violation(
                        user_id=user_id,
                        video_id=None,
                        violation_type='triple_riding',
                        timestamp=0.0,
                        track_id=0,
                        speed=None,
                        confidence=0.0,
                        bbox=vehicle['bbox']
                    )
                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    violation_dict['photo_id'] = photo_id
                    await db.violations.insert_one(violation_dict)
                    created_local_violations.append({'id': violation_dict['id'], 'type': 'triple_riding', 'plate_text': None, 'plate_detected': False, 'crop': crop})
                    violations_count += 1

                # Phone violation if present
                if phone_match:
                    violation = Violation(
                        user_id=user_id,
                        video_id=None,
                        violation_type='cell_phone',
                        timestamp=0.0,
                        track_id=0,
                        speed=None,
                        confidence=float(phone_match.get('confidence', 0.0)),
                        bbox=phone_match.get('bbox')
                    )
                    violation_dict = violation.model_dump()
                    violation_dict['created_at'] = violation_dict['created_at'].isoformat()
                    violation_dict['photo_id'] = photo_id
                    await db.violations.insert_one(violation_dict)
                    created_local_violations.append({'id': violation_dict['id'], 'type': 'cell_phone', 'plate_text': None, 'plate_detected': False, 'crop': crop})
                    violations_count += 1

                # If any chargeable violations were created for this vehicle, record them for aggregation
                if created_local_violations:
                    if 'created_violations' not in locals():
                        created_violations = []
                    created_violations.extend(created_local_violations)

                # Draw on frame
                color = (0, 0, 255) if violation_type else (0, 255, 0)
                x1, y1, x2, y2 = vehicle['bbox']
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)

                label = vehicle.get('class', 'vehicle')
                if violation_type:
                    label += f" [{violation_type.upper()}]"

                cv2.putText(frame, label, (int(x1), int(y1) - 10),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            # Draw other objects
            for obj in detected_objects:
                # Skip vehicle-like classes already drawn above
                if any(k in obj['class'].lower() for k in ('bike', 'motor', 'scooter')):
                    continue
                x1, y1, x2, y2 = obj['bbox']
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                cv2.putText(frame, obj['class'], (int(x1), int(y1) - 10),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        

        # Save processed photo to disk
        try:
            cv2.imwrite(output_path, frame)
        except Exception:
            pass

        # Update photo status
        await db.photos.update_one(
            {"id": photo_id},
            {"$set": {
                "status": "completed",
                "processed_path": output_path,
                "total_violations": violations_count
            }}
        )

    except Exception as e:
        await db.photos.update_one(
            {"id": photo_id},
            {"$set": {"status": "failed"}}
        )
        logger.error(f"Error processing photo: {str(e)}")

@api_router.get("/photos")
async def get_photos(
    date: Optional[str] = None,
    video_id: Optional[str] = Query(None),
    is_video_frame: Optional[bool] = Query(None),
    include_video_frames: bool = Query(False),
    session_token: Optional[str] = Cookie(None)
):
    """Get photos with optional date filtering, or restrict to frames from a specific video.
    By default `include_video_frames` is False and extracted frames are excluded from the Photos listing."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    query = {"user_id": user.id}
    
    # Date filtering: if date is provided (YYYY-MM-DD format), filter by that date
    if date:
        try:
            date_prefix = date if isinstance(date, str) else datetime.fromisoformat(str(date)).strftime('%Y-%m-%d')
            query["created_at"] = {
                "$regex": f"^{date_prefix}",
                "$options": "i"
            }
        except Exception as e:
            logger.warning(f"Invalid date format: {date}, error: {e}")

    # Optional: filter to frames from a specific video
    if video_id:
        # Attempt to match explicit source_video_id OR legacy frames named 'frame_*' within the video's time window
        video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
        conds = []
        # match explicit source_video_id
        conds.append({"source_video_id": video_id})

        video_frame_cond = {"is_video_frame": True}
        if video:
            try:
                # compute time window using video's created_at and duration (+30s buffer)
                start_iso = video.get('created_at')
                if isinstance(start_iso, datetime):
                    start_iso = start_iso.isoformat()
                duration = float(video.get('duration') or 0)
                end_dt = (datetime.fromisoformat(start_iso) + timedelta(seconds=int(duration) + 30))
                end_iso = end_dt.isoformat()
                # legacy frames detection by filename prefix and created_at range
                filename_cond = {"filename": {"$regex": r"^frame_"}, "created_at": {"$gte": start_iso, "$lte": end_iso}}
                # also match is_video_frame true within the video's time window (covers saved frames without source_video_id)
                video_frame_cond["created_at"] = {"$gte": start_iso, "$lte": end_iso}
            except Exception:
                filename_cond = {"filename": {"$regex": r"^frame_"}}

        else:
            filename_cond = {"filename": {"$regex": r"^frame_"}}

        conds.append(filename_cond)
        conds.append(video_frame_cond)
        # Use OR to return either explicit frames or legacy-named frames for this video
        query["$or"] = conds
    else:
        # When not filtering by video, respect explicit include_video_frames flag
        if include_video_frames:
            if is_video_frame is not None:
                query["is_video_frame"] = is_video_frame
        else:
            # By default exclude known video-extracted frames from the Photos listing
            # This prevents frames from appearing on the Upload Photos page
            query["$nor"] = [
                {"is_video_frame": True},
                {"source_video_id": {"$exists": True, "$nin": [None, ""]}},
                {"filename": {"$regex": r"^frame_"}}
            ]

    photos = await db.photos.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return photos

@api_router.get("/photos/{photo_id}")
async def get_photo(photo_id: str, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    photo = await db.photos.find_one({"id": photo_id, "user_id": user.id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


@api_router.get("/frames")
async def get_frames(video_id: Optional[str] = Query(None), session_token: Optional[str] = Cookie(None)):
    """Return only auto-extracted frames for a specific video. Uses source_video_id, is_video_frame timestamp matching, and legacy filename matching."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id query parameter is required")

    video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
    conds = []
    # frames explicitly linked to the video
    conds.append({"source_video_id": video_id})
    # match flagged frames or legacy named frames within time window
    video_frame_cond = {"is_video_frame": True}

    if video:
        try:
            start_iso = video.get('created_at')
            if isinstance(start_iso, datetime):
                start_iso = start_iso.isoformat()
            duration = float(video.get('duration') or 0)
            end_dt = (datetime.fromisoformat(start_iso) + timedelta(seconds=int(duration) + 30))
            end_iso = end_dt.isoformat()
            filename_cond = {"filename": {"$regex": r"^frame_"}, "created_at": {"$gte": start_iso, "$lte": end_iso}}
            video_frame_cond["created_at"] = {"$gte": start_iso, "$lte": end_iso}
        except Exception:
            filename_cond = {"filename": {"$regex": r"^frame_"}}
    else:
        filename_cond = {"filename": {"$regex": r"^frame_"}}

    conds.append(filename_cond)
    conds.append(video_frame_cond)

    query = {"user_id": user.id, "$or": conds}
    frames = await db.photos.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return frames


@api_router.post("/frames/migrate")
async def migrate_frames(video_id: Optional[str] = Query(None), dry_run: bool = Query(True), session_token: Optional[str] = Cookie(None)):
    """Detect untagged extracted frames and attach them to videos by matching their created_at to a video's time window.
    If dry_run=true, returns a report of matches without modifying DB. If dry_run=false, updates matched photos setting source_video_id and is_video_frame=True."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    videos = []
    if video_id:
        video = await db.videos.find_one({"id": video_id, "user_id": user.id}, {"_id": 0})
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        videos = [video]
    else:
        videos = await db.videos.find({"user_id": user.id}, {"_id": 0}).to_list(200)

    report = []
    total_to_update = 0
    for v in videos:
        start_iso = v.get('created_at')
        if isinstance(start_iso, datetime):
            start_iso = start_iso.isoformat()
        duration = float(v.get('duration') or 0)
        try:
            end_iso = (datetime.fromisoformat(start_iso) + timedelta(seconds=int(duration) + 30)).isoformat()
        except Exception:
            # fallback: use start only
            end_iso = start_iso

        # Find candidate photos that are not currently marked as frames
        photo_filter = {
            "user_id": user.id,
            "$and": [
                {"$or": [
                    {"is_video_frame": {"$exists": False}},
                    {"is_video_frame": False}
                ]},
                {"$or": [
                    {"source_video_id": {"$exists": False}},
                    {"source_video_id": None}
                ]}
            ],
            "created_at": {"$gte": start_iso, "$lte": end_iso}
        }

        candidates = await db.photos.find(photo_filter, {"_id": 0}).to_list(200)
        report.append({"video_id": v['id'], "video_filename": v.get('filename'), "found": len(candidates), "examples": [c['id'] for c in candidates[:5]]})

        if not dry_run and candidates:
            ids = [c['id'] for c in candidates]
            res = await db.photos.update_many({"id": {"$in": ids}}, {"$set": {"source_video_id": v['id'], "is_video_frame": True}})
            total_to_update += res.modified_count

    return {"dry_run": dry_run, "report": report, "updated": total_to_update}

@api_router.get("/photos/{photo_id}/download")
async def download_processed_photo(photo_id: str, type: str = Query("processed"), session_token: Optional[str] = Cookie(None)):
    """Download a photo file. By default returns the processed image. Pass ?type=original to get the original uploaded file."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    photo = await db.photos.find_one({"id": photo_id, "user_id": user.id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if type == 'original':
        if not photo.get('original_path'):
            raise HTTPException(status_code=404, detail="Original photo not found")
        file_path = Path(photo['original_path'])
        disp_name = photo.get('filename', f'{photo_id}')
    else:
        if not photo.get('processed_path'):
            raise HTTPException(status_code=404, detail="Processed photo not found")
        file_path = Path(photo['processed_path'])
        disp_name = f"processed_{photo.get('filename', photo_id)}"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo file missing on disk")
    headers = {
        "Content-Disposition": f'attachment; filename="{disp_name}"',
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
    }
    if AIOFILES_AVAILABLE:
        async def file_iter(path, chunk_size: int = 1024 * 1024):
            async with aiofiles.open(path, "rb") as f:
                while True:
                    chunk = await f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(file_iter(file_path), media_type="image/jpeg", headers=headers)
    else:
        resp = FileResponse(str(file_path), media_type="image/jpeg", filename=disp_name)
        resp.headers.update(headers)
        return resp

@api_router.get("/stats")
async def get_stats(session_token: Optional[str] = Cookie(None)):
    """Get user statistics - optimized for fast loading"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Use parallel queries for better performance
    total_videos, total_photos, total_violations, total_challans, violations_by_type = await asyncio.gather(
        db.videos.count_documents({"user_id": user.id}),
        db.photos.count_documents({"user_id": user.id}),
        db.violations.count_documents({"user_id": user.id}),
        db.challans.count_documents({"user_id": user.id}),
        db.violations.aggregate([
            {"$match": {"user_id": user.id}},
            {"$group": {"_id": "$violation_type", "count": {"$sum": 1}}}
        ]).to_list(10)
    )
    
    return {
        "total_videos": total_videos,
        "total_photos": total_photos,
        "total_violations": total_violations,
        "total_challans": total_challans,
        "violations_by_type": {item['_id']: item['count'] for item in violations_by_type}
    }



@api_router.get("/challans")
async def list_challans(
    limit: int = 100, 
    skip: int = 0, 
    date: Optional[str] = None,
    session_token: Optional[str] = Cookie(None)
):
    """List challans for the current user with optional date filtering and pagination"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    query = {"user_id": user.id}
    
    # Date filtering: if date is provided (YYYY-MM-DD format), filter by that date
    if date:
        try:
            # Parse date string (YYYY-MM-DD) and create date range for the entire day
            if isinstance(date, str):
                # Parse YYYY-MM-DD format
                year, month, day = map(int, date.split('-'))
                target_date = datetime(year, month, day, tzinfo=timezone.utc)
            else:
                target_date = datetime.fromisoformat(str(date)).replace(tzinfo=timezone.utc)
            
            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            # MongoDB query for ISO string dates stored as strings
            # Match dates that start with the date string (YYYY-MM-DD)
            date_prefix = date if isinstance(date, str) else target_date.strftime('%Y-%m-%d')
            query["generated_at"] = {
                "$regex": f"^{date_prefix}",
                "$options": "i"
            }
        except Exception as e:
            logger.warning(f"Invalid date format: {date}, error: {e}")

    docs = await db.challans.find(query, {"_id": 0}).sort("generated_at", -1).skip(skip).limit(limit).to_list(length=limit)

    # Best-effort enrichment: if plate is missing but we have a detected image, try OCR once
    updated_docs = []
    for doc in docs:
        if not doc.get('plate_number') and doc.get('detected_image_path'):
            plate = try_ocr_full_image_for_plate(doc.get('detected_image_path'))
            if plate:
                doc['plate_number'] = plate
                doc['plate_readable'] = True
                # This is no longer a generic preset challan if we could read the plate
                if doc.get('preset_challan'):
                    doc['preset_challan'] = False
                await db.challans.update_one(
                    {"id": doc.get('id')},
                    {"$set": {"plate_number": plate, "plate_readable": True, "preset_challan": doc.get('preset_challan', False)}}
                )
        updated_docs.append(doc)

    return updated_docs


@api_router.get("/challans/{challan_id}")
async def get_challan(challan_id: str, session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = await db.challans.find_one({"id": challan_id, "user_id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Challan not found")

    # Same enrichment as list: if no stored plate, try OCR on detected image now
    if not doc.get('plate_number') and doc.get('detected_image_path'):
        plate = try_ocr_full_image_for_plate(doc.get('detected_image_path'))
        if plate:
            doc['plate_number'] = plate
            doc['plate_readable'] = True
            if doc.get('preset_challan'):
                doc['preset_challan'] = False
            await db.challans.update_one(
                {"id": doc.get('id')},
                {"$set": {"plate_number": plate, "plate_readable": True, "preset_challan": doc.get('preset_challan', False)}}
            )

    return doc


def build_styled_challan_pdf(challan_doc: Dict[str, Any], violation: Optional[Dict[str, Any]] = None) -> BytesIO:
    """Return a BytesIO containing a styled E-Challan PDF with optional header image and bilingual/two-column receipt layout."""
    buffer = BytesIO()
    doc_pdf = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=28, leftMargin=28,
                               topMargin=28, bottomMargin=28)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, alignment=TA_CENTER, spaceAfter=6)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=11, alignment=TA_CENTER, spaceAfter=4)
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=10, spaceAfter=2)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8)

    elements = []

    # Optional header image (logo or sample image)
    header_image_path = os.environ.get('CHALLAN_HEADER_IMAGE') or str(ROOT_DIR / 'assets' / 'header.png')
    if header_image_path and os.path.exists(header_image_path):
        try:
            # Draw image left and title right in a table
            img = Image(header_image_path, width=1.6*inch, height=1.0*inch)
            header_table = Table([ [img, Paragraph('<b>Traffic Police</b><br/>ई-चालान / E-CHALLAN', ParagraphStyle('h', parent=styles['Heading2'], fontSize=14))] ], colWidths=[1.6*inch, 6.8*inch])
            header_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
            elements.append(header_table)
        except Exception:
            logger.exception('Failed to include header image')
    else:
        elements.append(Paragraph('Traffic Police', title_style))
        elements.append(Paragraph('ई-चालान / E-CHALLAN', subtitle_style))

    elements.append(Spacer(1, 0.08*inch))

    # Try to enrich plate number from violation / detected image if missing
    if not challan_doc.get('plate_number'):
        if violation and violation.get('plate_number'):
            challan_doc['plate_number'] = violation['plate_number']
            challan_doc['plate_readable'] = True
        else:
            plate_from_img = try_ocr_full_image_for_plate(challan_doc.get('detected_image_path', ''))
            if plate_from_img:
                challan_doc['plate_number'] = plate_from_img
                challan_doc['plate_readable'] = True

    # Top summary – English-only, government-style layout
    challan_no = challan_doc.get('challan_number', 'N/A')
    fine_amt = challan_doc.get('fine_amount', 0.0)
    # Get violation_type from challan_doc, fallback to violation parameter if not present
    violation_type = challan_doc.get('violation_type')
    if not violation_type and violation:
        violation_type = violation.get('violation_type', 'N/A')
    if not violation_type:
        violation_type = 'N/A'
    violation_text = format_violation_type(violation_type)

    # Incident date/time – prefer violation time, fallback to challan generated time
    incident_dt = None
    if violation and violation.get('created_at'):
        created_at = violation['created_at']
        if isinstance(created_at, str):
            try:
                incident_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except Exception:
                incident_dt = None
        elif isinstance(created_at, datetime):
            incident_dt = created_at
    if incident_dt is None:
        gen = challan_doc.get('generated_at')
        if isinstance(gen, str):
            try:
                incident_dt = datetime.fromisoformat(gen.replace('Z', '+00:00'))
            except Exception:
                incident_dt = datetime.now(timezone.utc)
        else:
            incident_dt = datetime.now(timezone.utc)
    if incident_dt.tzinfo is None:
        incident_dt = incident_dt.replace(tzinfo=timezone.utc)
    date_str = incident_dt.strftime("%d-%m-%Y %H:%M:%S")

    # High-level summary row
    summary_table = Table([
        [
            Paragraph('<b>Challan No.</b>', label_style),
            challan_no,
            Paragraph('<b>Date & Time of Offence</b>', label_style),
            date_str,
        ],
        [
            Paragraph('<b>Offence Description</b>', label_style),
            violation_text,
            Paragraph('<b>Total Fine (Rs.)</b>', label_style),
            f"{fine_amt:.2f}",
        ],
    ], colWidths=[1.6*inch, 2.8*inch, 2.2*inch, 1.6*inch])
    summary_table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8fafc')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.12*inch))

    # Include the detected image prominently (if present) – centre of page
    detected_image_path = challan_doc.get('detected_image_path')
    if detected_image_path and os.path.exists(detected_image_path):
        try:
            elements.append(Image(detected_image_path, width=6.5*inch))
            elements.append(Spacer(1, 0.12*inch))
        except Exception:
            logger.exception('Failed to include detected image in styled PDF')

    # Vehicle / owner details area – two-column English layout
    violator_name = challan_doc.get('violator_name') or 'N/A'
    if challan_doc.get('plate_number'):
        plate_num = challan_doc['plate_number']
    elif challan_doc.get('preset_challan'):
        plate_num = 'PRESET'
    else:
        plate_num = 'UNKNOWN'

    vehicle_table = Table([
        [
            Paragraph('<b>Vehicle Number</b>', label_style),
            plate_num,
            Paragraph('<b>Vehicle Class</b>', label_style),
            violation.get('vehicle_class', 'N/A') if violation else 'N/A',
        ],
        [
            Paragraph('<b>Owner Name</b>', label_style),
            violator_name,
            Paragraph('<b>Owner Contact</b>', label_style),
            challan_doc.get('owner_contact', 'N/A'),
        ],
    ], colWidths=[1.4*inch, 2.4*inch, 1.4*inch, 2.4*inch])
    vehicle_table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(vehicle_table)
    elements.append(Spacer(1, 0.12*inch))

    # Payment instructions and footer (English only)
    pay_text = (
        "This is an electronically generated traffic e-challan based on camera / image evidence. "
        "Please pay the fine within 30 days from the date of issue. Failure to pay may result in "
        "additional penalties and legal proceedings as per the applicable Motor Vehicle Act provisions."
    )
    elements.append(Paragraph(f"<b>Instructions:</b><br/>{pay_text}", small_style))
    elements.append(Spacer(1, 0.08*inch))

    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.grey)
    elements.append(Paragraph('This is a system-generated document. No signature required. | यह एक सिस्टम जनित दस्तावेज है।', footer_style))

    doc_pdf.build(elements)
    buffer.seek(0)
    return buffer


@api_router.get("/challans/{challan_id}/download")
async def download_challan(challan_id: str, session_token: Optional[str] = Cookie(None)):
    """Download styled challan PDF by challan id"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = await db.challans.find_one({"id": challan_id, "user_id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Challan not found")

    # Fetch violation if available to enrich the PDF
    violation = None
    if doc.get('violation_id'):
        violation = await db.violations.find_one({"id": doc['violation_id'], "user_id": user.id}, {"_id": 0})

    buffer = build_styled_challan_pdf(doc, violation=violation)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=challan_{doc.get('challan_number','')}.pdf"})

@api_router.get("/challans/{challan_id}/image")
async def get_challan_image(challan_id: str, session_token: Optional[str] = Cookie(None)):
    """Return the detected image (if any) for a challan"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = await db.challans.find_one({"id": challan_id, "user_id": user.id}, {"_id": 0})
    if not doc or not doc.get('detected_image_path'):
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = doc.get('detected_image_path')
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(image_path, media_type="image/jpeg", filename=os.path.basename(image_path))

@api_router.get("/challans/{violation_id}/generate_styled")
async def generate_styled_challan(violation_id: str, session_token: Optional[str] = Cookie(None)):
    """Generate a styled e-challan PDF for manual download (includes detected image prominently)."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    violation = await db.violations.find_one({"id": violation_id, "user_id": user.id}, {"_id": 0})
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    existing_challan = await db.challans.find_one({"violation_id": violation_id, "user_id": user.id}, {"_id": 0})
    if not existing_challan:
        fine_amount = get_fine_amount(violation['violation_type'])
        challan = Challan(
            user_id=user.id,
            violation_id=violation_id,
            challan_number=f"CHAL-{str(uuid.uuid4())[:8].upper()}",
            fine_amount=fine_amount
        )
        challan_dict = challan.model_dump()
        challan_dict['violation_type'] = violation['violation_type']  # Add violation_type to challan
        challan_dict['generated_at'] = challan_dict['generated_at'].isoformat()
        await db.challans.insert_one(challan_dict)
        challan_doc = challan_dict
    else:
        challan_doc = existing_challan
        # Ensure violation_type is set even for existing challans
        if 'violation_type' not in challan_doc:
            challan_doc['violation_type'] = violation.get('violation_type', 'N/A')

    challan_doc['violation'] = violation
    buffer = build_styled_challan_pdf(challan_doc, violation=violation)
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=challan_{violation_id[:8]}.pdf"})

@api_router.get("/analytics")
async def get_analytics(session_token: Optional[str] = Cookie(None)):
    """Get analytics data for charts - violations per month and upload timeline (optimized)"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Optimize: Limit to recent data for better performance (last 6 months)
    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    six_months_ago_str = six_months_ago.isoformat()
    
    # Get violations with date filter for better performance
    violations = await db.violations.find(
        {
            "user_id": user.id,
            "created_at": {"$gte": six_months_ago_str}
        },
        {"_id": 0, "created_at": 1, "violation_type": 1, "video_id": 1, "photo_id": 1}
    ).sort("created_at", 1).to_list(5000)  # Reduced from 10000
    
    # Get all videos and photos (these are typically fewer)
    videos = await db.videos.find(
        {"user_id": user.id},
        {"_id": 0, "id": 1, "filename": 1, "created_at": 1, "total_violations": 1}
    ).sort("created_at", 1).to_list(500)  # Reduced from 1000
    
    photos = await db.photos.find(
        {"user_id": user.id},
        {"_id": 0, "id": 1, "filename": 1, "created_at": 1, "total_violations": 1}
    ).sort("created_at", 1).to_list(500)  # Reduced from 1000
    
    # Group violations by month
    violations_by_month = {}
    for violation in violations:
        created_at = violation.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        
        month_key = created_at.strftime("%Y-%m")
        month_name = created_at.strftime("%B %Y")
        
        if month_key not in violations_by_month:
            violations_by_month[month_key] = {
                "month": month_name,
                "month_key": month_key,
                "total": 0,
                "no_helmet": 0,
                "overspeeding": 0,
                "wrong_way": 0
            }
        
        violations_by_month[month_key]["total"] += 1
        violation_type = violation.get('violation_type', 'unknown')
        if violation_type in ['no_helmet', 'overspeeding', 'wrong_way']:
            violations_by_month[month_key][violation_type] += 1
    
    # Create timeline of uploads and violations
    timeline = []
    
    # Add video uploads to timeline
    for video in videos:
        created_at = video.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        
        timeline.append({
            "date": created_at.isoformat(),
            "timestamp": created_at.timestamp(),
            "type": "video_upload",
            "label": video.get('filename', 'Unknown Video'),
            "violations": video.get('total_violations', 0)
        })
    
    # Add photo uploads to timeline
    for photo in photos:
        created_at = photo.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        
        timeline.append({
            "date": created_at.isoformat(),
            "timestamp": created_at.timestamp(),
            "type": "photo_upload",
            "label": photo.get('filename', 'Unknown Photo'),
            "violations": photo.get('total_violations', 0)
        })
    
    # Sort timeline by date
    timeline.sort(key=lambda x: x["timestamp"])
    
    # Calculate cumulative violations over time
    cumulative_violations = []
    running_total = 0
    
    for item in timeline:
        running_total += item["violations"]
        cumulative_violations.append({
            "date": item["date"],
            "timestamp": item["timestamp"],
            "cumulative": running_total,
            "type": item["type"],
            "label": item["label"],
            "violations": item["violations"]
        })
    
    # Convert violations_by_month to list sorted by month_key
    monthly_data = sorted(violations_by_month.values(), key=lambda x: x["month_key"])
    
    return {
        "monthly_violations": monthly_data,
        "timeline": timeline,
        "cumulative_violations": cumulative_violations
    }

def get_fine_amount(violation_type: str) -> float:
    """Get fine amount for violation type"""
    fine_map = {
        'no_helmet': 500.0,
        'cell_phone': 1000.0,
        'phone': 1000.0,
        'mobile': 1000.0,
        'overspeeding': 1500.0,
        'wrong_way': 2000.0
    }
    return fine_map.get(violation_type, 500.0)

def format_violation_type(violation_type: str) -> str:
    """Format violation type for display"""
    return violation_type.replace('_', ' ').title()

@api_router.get("/challans/{violation_id}/generate")
async def generate_challan(violation_id: str, session_token: Optional[str] = Cookie(None)):
    """Generate PDF e-challan for a violation"""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get violation
    violation = await db.violations.find_one({"id": violation_id, "user_id": user.id}, {"_id": 0})
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    # Get video/photo info if available
    video_name = "N/A"
    if violation.get('video_id'):
        video = await db.videos.find_one({"id": violation['video_id']}, {"_id": 0})
        if video:
            video_name = video.get('filename', 'Unknown')
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=72, leftMargin=72,
                           topMargin=72, bottomMargin=18)
    
    # Container for the 'Flowable' objects
    elements = []
    
    # Define styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=12,
        spaceBefore=12
    )
    
    # Title
    title = Paragraph("E-CHALLAN", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.2*inch))
    
    # Challan Number
    challan_number = f"CH-{violation_id[:8].upper()}"
    
    # Check if challan already exists, if not create a new record
    existing_challan = await db.challans.find_one({"violation_id": violation_id, "user_id": user.id}, {"_id": 0})
    if not existing_challan:
        fine_amount = get_fine_amount(violation['violation_type'])
        challan = Challan(
            user_id=user.id,
            violation_id=violation_id,
            challan_number=challan_number,
            fine_amount=fine_amount
        )
        challan_dict = challan.model_dump()
        challan_dict['violation_type'] = violation['violation_type']  # Add violation_type to challan
        challan_dict['generated_at'] = challan_dict['generated_at'].isoformat()
        await db.challans.insert_one(challan_dict)
        challan_doc = challan_dict
    else:
        challan_doc = existing_challan
        # Ensure violation_type is set even for existing challans
        if 'violation_type' not in challan_doc:
            challan_doc['violation_type'] = violation.get('violation_type', 'N/A')
    
    challan_para = Paragraph(f"<b>Challan Number:</b> {challan_number}", styles['Normal'])
    elements.append(challan_para)
    elements.append(Spacer(1, 0.1*inch))

    # include detected image if available
    detected_image_path = challan_doc.get('detected_image_path')
    if detected_image_path and os.path.exists(detected_image_path):
        try:
            elements.append(Spacer(1, 0.1*inch))
            elements.append(Image(detected_image_path, width=4*inch))
            elements.append(Spacer(1, 0.1*inch))
        except Exception:
            logger.exception('Failed to include detected image in PDF')

    # Date and Time
    violation_date = violation.get('created_at', datetime.now(timezone.utc))
    if isinstance(violation_date, str):
        try:
            violation_date = datetime.fromisoformat(violation_date.replace('Z', '+00:00'))
        except:
            violation_date = datetime.now(timezone.utc)
    elif not isinstance(violation_date, datetime):
        violation_date = datetime.now(timezone.utc)
    
    # Ensure timezone aware
    if violation_date.tzinfo is None:
        violation_date = violation_date.replace(tzinfo=timezone.utc)
    
    date_str = violation_date.strftime("%d %B %Y, %I:%M %p")
    date_para = Paragraph(f"<b>Date & Time:</b> {date_str}", styles['Normal'])
    elements.append(date_para)
    elements.append(Spacer(1, 0.3*inch))
    
    # Violation Details Table
    violation_type = format_violation_type(violation['violation_type'])
    fine_amount = get_fine_amount(violation['violation_type'])
    
    # Handle timestamp display
    timestamp_str = 'N/A'
    if violation.get('timestamp') is not None:
        timestamp_str = f"{violation['timestamp']:.2f} seconds"
    
    # Get plate number from violation or challan
    plate_number = violation.get('plate_number') or challan_doc.get('plate_number') or 'N/A'
    
    violation_data = [
        ['Violation Type', violation_type],
        ['Vehicle Number', plate_number],
        ['Track ID', f"#{violation['track_id']}"],
        ['Video/Photo', video_name],
        ['Timestamp', timestamp_str],
        ['Speed', f"{violation['speed']:.1f} km/h" if violation.get('speed') else 'N/A'],
        ['Confidence', f"{(violation['confidence'] * 100):.1f}%"],
        ['Fine Amount', f"₹{fine_amount:.2f}"]
    ]
    
    violation_table = Table(violation_data, colWidths=[2*inch, 4*inch])
    violation_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#f8fafc')),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    elements.append(Paragraph("Violation Details", heading_style))
    elements.append(violation_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Instructions
    instructions = Paragraph(
        "<b>Instructions:</b><br/>"
        "1. This is an electronically generated challan.<br/>"
        "2. Please pay the fine amount within 30 days from the date of issue.<br/>"
        "3. Failure to pay may result in additional penalties.<br/>"
        "4. For queries, contact the traffic department.",
        styles['Normal']
    )
    elements.append(instructions)
    elements.append(Spacer(1, 0.3*inch))
    
    # Footer
    footer = Paragraph(
        "<i>This is a system-generated document. No signature required.</i>",
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, 
                      textColor=colors.grey, alignment=TA_CENTER)
    )
    elements.append(footer)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=challan_{violation_id[:8]}.pdf"
        }
    )

# Include the router in the main app
app.include_router(api_router)

# Create useful indexes for date-based queries to support calendar views
@app.on_event("startup")
async def create_indexes():
    try:
        await db.videos.create_index([('user_id', 1), ('created_at', 1)])
        await db.photos.create_index([('user_id', 1), ('created_at', 1)])
        await db.violations.create_index([('user_id', 1), ('created_at', 1)])
        await db.challans.create_index([('user_id', 1), ('generated_at', 1)])
        logger.info('Created indexes for date-based queries')
    except Exception:
        logger.exception('Failed to create indexes at startup')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@api_router.get('/calendar')
async def get_calendar(start: Optional[str] = None, end: Optional[str] = None, session_token: Optional[str] = Cookie(None)):
    """Return daily counts for videos/photos/violations/challans between start and end dates (YYYY-MM-DD). Limits range to 90 days."""
    user = await get_current_user(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Default: last 30 days
    try:
        if end:
            end_dt = datetime.fromisoformat(end)
        else:
            end_dt = datetime.now(timezone.utc)
        if start:
            start_dt = datetime.fromisoformat(start)
        else:
            start_dt = end_dt - timedelta(days=29)
        # normalize to dates
        start_date = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = end_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid date format. Use YYYY-MM-DD')

    # Limit range to avoid heavy queries
    max_days = 90
    days = (end_date - start_date).days + 1
    if days > max_days:
        raise HTTPException(status_code=400, detail=f'Date range too large (max {max_days} days)')

    results = []
    cur = start_date
    while cur <= end_date:
        date_prefix = cur.strftime('%Y-%m-%d')
        videos_count = await db.videos.count_documents({'user_id': user.id, 'created_at': {'$regex': f'^{date_prefix}', '$options': 'i'}})
        photos_count = await db.photos.count_documents({'user_id': user.id, 'created_at': {'$regex': f'^{date_prefix}', '$options': 'i'}})
        violations_count = await db.violations.count_documents({'user_id': user.id, 'created_at': {'$regex': f'^{date_prefix}', '$options': 'i'}})
        challans_count = await db.challans.count_documents({'user_id': user.id, 'generated_at': {'$regex': f'^{date_prefix}', '$options': 'i'}})

        results.append({
            'date': date_prefix,
            'videos': videos_count,
            'photos': photos_count,
            'violations': violations_count,
            'challans': challans_count
        })
        cur = cur + timedelta(days=1)

    return results

# Logging already configured above

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.delete("/api/photos/clear")
async def clear_photos():
    """Delete all photo records and remove stored photo files (careful: irreversible)."""
    try:
        # Remove DB records
        await db.photos.delete_many({})

        # Try to remove files if directories are configured
        try:
            if 'PHOTOS_DIR' in globals():
                for f in Path(PHOTOS_DIR).glob('*'):
                    try:
                        f.unlink()
                    except Exception:
                        pass
            if 'PROCESSED_PHOTOS_DIR' in globals():
                for f in Path(PROCESSED_PHOTOS_DIR).glob('*'):
                    try:
                        f.unlink()
                    except Exception:
                        pass
        except Exception:
            # Non-fatal file cleanup errors
            logger.exception('Error while cleaning photo files')

        return {"status": "ok", "deleted": True}
    except Exception as e:
        logger.exception('Failed to clear photos: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/videos/clear")
async def clear_videos():
    """Delete all video records and remove stored video files (careful: irreversible)."""
    try:
        await db.videos.delete_many({})
        try:
            if 'VIDEOS_DIR' in globals():
                for f in Path(VIDEOS_DIR).glob('*'):
                    try:
                        f.unlink()
                    except Exception:
                        pass
            if 'PROCESSED_VIDEOS_DIR' in globals():
                for f in Path(PROCESSED_VIDEOS_DIR).glob('*'):
                    try:
                        f.unlink()
                    except Exception:
                        pass
        except Exception:
            logger.exception('Error while cleaning video files')
        return {"status": "ok", "deleted": True}
    except Exception as e:
        logger.exception('Failed to clear videos: %s', e)
        raise HTTPException(status_code=500, detail=str(e))
