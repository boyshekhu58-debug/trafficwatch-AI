# TrafficWatch-AI

A comprehensive traffic monitoring and violation detection system focused on improving road safety. The app uses YOLOv8 object detection and tracking to automatically identify traffic violations in video footage, including helmet violations, overspeeding,triple riding.

> *“Every frame we analyze is a chance to save a life.”* — We don’t detect violations to punish people — we do it to protect them.

## 🚀 Quick Start (One Command)

After installation, start both servers with a single command:

**Windows PowerShell:**
```powershell
.\start.ps1
```

**Windows Command Prompt:**
```cmd
start.bat
```

This will start both the backend (port 8000) and frontend (port 3000) servers automatically!

## Features

- 🎥 **Video Upload & Processing**: Upload traffic videos and process them with AI-powered detection
- 🚦 **Violation Detection**: Automatically detect multiple types of traffic violations:
  - No helmet violations (riders without helmets)
  - Overspeeding (vehicles exceeding speed limits)
- 📊 **Real-time Analytics**: View statistics and violation reports with detailed breakdowns
- 🎯 **Calibration System**: Configure speed limits and reference distances for accurate speed calculations
- 🔐 **User Authentication**: Secure authentication using Google  Emergent Auth
- 📱 **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS

## Tech Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **YOLOv8 (Ultralytics)**: State-of-the-art object detection and tracking
- **OpenCV**: Video processing and computer vision
- **MongoDB**: Database for storing videos, violations, and user data
- **Motor**: Async MongoDB driver
- **WebSockets**: Real-time communication support

### Frontend
- **React 19**: Modern React with hooks
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **Axios**: HTTP client for API requests
- **React Router**: Client-side routing

## Project Structure

```
trafficwatch-AI/
├── backend/
│   ├── server.py              # FastAPI application
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Backend environment variables
│   ├── models/
│   │   └── best.pt           # YOLOv8 trained model
│   ├── uploads/              # Uploaded video files
│   └── processed/            # Processed video outputs
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/           # Page components
│   │   └── hooks/           # Custom React hooks
│   ├── package.json         # Node dependencies
│   ├── .env                 # Frontend environment variables
│   └── public/              # Static assets
├── start.ps1                # PowerShell script to start both servers
├── start.bat                # Batch script to start both servers
├── tests/                   # Test files
└── README.md               # This file
```

## Quick Start

**First Time Setup:** Complete the installation steps below (one-time only).

**Every Time You Open the Project:** Just run the start script - no need to reinstall dependencies!

After completing the installation steps below, you can start both servers with a single command:

**Where to Run:**
- **VS Code Integrated Terminal:** 
  - Press `` Ctrl+` `` (backtick key) or go to `View → Terminal`
  - Make sure you're in the project root (you should see `start.ps1` when you type `ls` or `dir`)
  - If not, run: `cd "C:\Users\hp\OneDrive\Attachments\PROJECTS\trafficwatch-AI"`
  
- **Windows File Explorer:**
  - Navigate to the project folder in File Explorer
  - Right-click in the folder → "Open in Terminal" or "Open PowerShell window here"
  
- **Any Terminal:**
  - Navigate to the project root directory first
  - You should see `start.ps1`, `start.bat`, `backend/`, and `frontend/` folders

**Windows (PowerShell):**
```powershell
# First, navigate to project root (if not already there)
cd "C:\Users\hp\OneDrive\Attachments\PROJECTS\trafficwatch-AI"

# Verify you're in the right place (you should see start.ps1)
ls start.ps1

# Then run the script
#Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start.ps1
```

**Windows (Command Prompt):**
```cmd
# Make sure you're in the project root directory (where start.bat is located)
start.bat
```

**Note:** The command must be run from the **project root directory** (the folder containing `start.ps1`, `start.bat`, `backend/`, and `frontend/` folders).

**Manual Start (All Platforms):**
```bash
# Terminal 1 - Backend
cd backend
venv\Scripts\activate  # Windows (only needed if not using start script)
# source venv/bin/activate  # Linux/Mac
uvicorn server:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
yarn start
```

**Note:** The startup scripts automatically handle virtual environment activation, so you don't need to activate it manually when using `start.ps1` or `start.bat`.

The application will be available at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

## Installation

### Prerequisites

Before starting, ensure you have:

- **Python 3.8+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 16+** - [Download Node.js](https://nodejs.org/)
- **MongoDB** - [Download MongoDB](https://www.mongodb.com/try/download/community) or use MongoDB Atlas (cloud)
- **Yarn** - Will be installed automatically via npm
- **YOLOv8 model file** - Should be located at `backend/models/best.pt`

**Quick Prerequisites Check:**
```bash
python --version    # Should be 3.8+
node --version      # Should be 16+
npm --version       # Should be available
```

**MongoDB Check:**
- Windows: Check if MongoDB service is running in Services
- Or verify: `mongod --version` and ensure MongoDB service is started

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
```

3. Activate the virtual environment:

   **On Windows (PowerShell):**
   ```powershell
   venv\Scripts\Activate.ps1
   ```

   **On Windows (Command Prompt):**
   ```cmd
   venv\Scripts\activate.bat
   ```

   **On Unix/Linux/macOS:**
   ```bash
   source venv/bin/activate
   ```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

### OCR (Tesseract) - Optional but required for automatic plate extraction

If you want the application to extract number-plates and auto-generate e-challans, install the Tesseract OCR binary on your system and ensure it's on PATH.

Windows (recommended installer):
- Download and install from https://github.com/UB-Mannheim/tesseract/wiki (choose the appropriate installer)
- After installing, verify in PowerShell:
```powershell
tesseract --version
```

In the backend venv, also install the Python wrapper if not already installed:
```powershell
venv\Scripts\Activate.ps1
pip install pytesseract==0.3.10
python -c "import pytesseract; print(pytesseract.get_tesseract_version())"
```

If `pytesseract.get_tesseract_version()` prints a version, OCR is available and the automatic challan flow will work.

Note on unreadable plates: if the model detects a number-plate bbox but OCR fails to read the text, the system will still issue a preset challan (marked in the DB with `preset_challan: true` and `plate_readable: false`) so enforcement can proceed and manual review can follow.

Detected images & videos:
- When a challan is generated, the system saves the cropped detected image (if available) and embeds it in the generated PDF e-challan.

- Challans are generated automatically only for the following violations: **bike + no_helmet**, **bike + triple riding**, and **overspeeding** (overspeed uses the current calibration / speed limit settings). 
- Aggregated challans: when multiple chargeable violations are detected for the same vehicle/event (for example: multiple `no_helmet` detections plus a `triple_riding` detection), the system now creates a **single aggregated challan** that includes a `breakdown` of each violation and a summed `fine_amount` (e.g., 3 * ₹500 + ₹500 for triple riding = ₹2000). The aggregated challan stores `violation_ids` to link the individual violations.

Detection behavior update:
- **No-helmet and triple-riding are now only triggered by explicit model classes** (`no_helmet`, `triple_riding`, `triple_ride`). The system will no longer infer `no_helmet` from the absence of helmet detections or infer `triple_riding` by heuristics (counting nearby riders). This reduces false positives and ensures that violations and challans are issued only when the model explicitly detects the corresponding class near a bike.

Performance notes:
- Inference now uses a smaller default image size for faster throughput (configurable via the `MODEL_INFER_IMG` env var; default is **512** px). Tune this value based on your hardware (lower = faster, but smaller may reduce accuracy).
- OCR, image writing and PDF generation are offloaded to thread workers to avoid blocking the main event loop and make processing smoother and more responsive.
- For videos you upload, you can extract frames as photos and process them by calling the endpoint:
  - POST `/api/videos/{video_id}/extract_frames?interval_sec=1.0&save_frames=false`  (default extracts one frame per second) — by default frames are saved and processed and marked as internal (`is_video_frame`) and are excluded from the Photos section. Set `save_frames=false` to process frames transiently (they will not be stored in the Photos collection or saved to disk).

5. Create a `.env` file in the `backend` directory:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trafficwatch
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

6. Ensure the YOLOv8 model file (`best.pt`) is in `backend/models/` directory

**Note:** If the `.env` file doesn't exist, create it manually. The backend requires these environment variables to run.

### Frontend Setup

1. Install Yarn (if not already installed):
   
   **Using npm (comes with Node.js):**
   ```bash
   npm install -g yarn
   ```
   
   **Or use npm directly** (alternative to yarn):
   ```bash
   npm install
   ```

2. Navigate to the frontend directory:
```bash
cd frontend
```

3. Install dependencies:
```bash
yarn install
```

   **Note:** If you prefer npm, you can use `npm install` instead of `yarn install`.

4. Create a `.env` file in the `frontend` directory:
```env
REACT_APP_BACKEND_URL=http://localhost:8000
REACT_APP_ENABLE_VISUAL_EDITS=false
ENABLE_HEALTH_CHECK=false
```

**Note:** If the `.env` file doesn't exist, create it manually. The frontend requires `REACT_APP_BACKEND_URL` to connect to the backend.

## When Do I Need to Install Dependencies?

**Short Answer:** Only once, or when dependencies change.

### ✅ You DON'T need to reinstall if:
- You're just opening the project to work on it
- You're starting the servers (the startup scripts handle everything)
- You haven't updated `requirements.txt` or `package.json`

### 🔄 You DO need to reinstall if:
- **First time setup** - Initial installation
- **Dependencies changed** - Someone updated `requirements.txt` or `package.json`
- **Virtual environment deleted** - If you deleted the `venv` folder
- **Node modules deleted** - If you deleted `frontend/node_modules` folder

### Quick Check:
- **Backend:** If `backend/venv` folder exists, dependencies are installed ✅
- **Frontend:** If `frontend/node_modules` folder exists, dependencies are installed ✅

**The startup scripts (`start.ps1` or `start.bat`) automatically use the installed dependencies, so you can just run them every time!**

## Running the Application

### Option 1: Quick Start (Recommended)

Use the provided startup scripts to run both servers with one command:

**Where to Run the Command:**
- **VS Code Integrated Terminal:** Press `` Ctrl+` `` (backtick) or go to `View → Terminal`, then navigate to project root
- **Windows File Explorer:** Right-click the project folder → "Open in Terminal" or "Open PowerShell window here"
- **Any Terminal:** Make sure you're in the **project root directory** (where `start.ps1` and `start.bat` files are located)

**Important:** You must be in the project root directory (the folder containing `backend/`, `frontend/`, `start.ps1`, etc.)

**Windows PowerShell:**
```powershell
# Navigate to project root if not already there
cd "C:\Users\hp\OneDrive\Attachments\PROJECTS\trafficwatch-AI"

# Then run the script
.\start.ps1
```

**Windows Command Prompt:**
```cmd
# Navigate to project root if not already there
cd "C:\Users\hp\OneDrive\Attachments\PROJECTS\trafficwatch-AI"

# Then run the script
start.bat
```

This will:
- Check if MongoDB is running
- Check if dependencies are installed
- Start the backend server on port 8000 (in a new window)
- Start the frontend server on port 3000 (in a new window)

### Option 2: Manual Start

If you prefer to run servers manually or need to run them separately:

**Backend Server:**
```bash
cd backend
# Activate virtual environment first
venv\Scripts\activate  # Windows PowerShell
# venv\Scripts\activate.bat  # Windows CMD
# source venv/bin/activate  # Linux/Mac

uvicorn server:app --reload --port 8000
```

**Frontend Server (in a new terminal):**
```bash
cd frontend
yarn start
```

### Access Points

Once both servers are running:
- **Frontend Application:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Documentation:** http://localhost:8000/docs

## API Endpoints

### Authentication
- `POST /api/auth/session` - Create user session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Videos
- `POST /api/videos/upload` - Upload a video file
- `POST /api/videos/{video_id}/process` - Process uploaded video
- `GET /api/videos` - Get all videos for current user
- `GET /api/videos/{video_id}` - Get specific video details
- `GET /api/videos/{video_id}/download` - Download processed video

### Violations
- `GET /api/violations` - Get violations (optionally filtered by video_id)

### Calibration
- `POST /api/calibration` - Create/update calibration zone
- `GET /api/calibration` - Get calibration settings

### Statistics
- `GET /api/stats` - Get user statistics (total videos, violations, etc.)

## Usage

1. **Authentication**: Log in using Google Emergent Auth
2. **Upload Video**: Upload a traffic video from the dashboard
3. **Calibrate** (Optional): Set up calibration zones with reference distances and speed limits
4. **Process Video**: Start processing the uploaded video to detect violations
5. **View Results**: Review detected violations, download processed videos, and view statistics

## Configuration

### Calibration Setup

For accurate speed detection, you need to calibrate the system:
1. Define a reference distance in meters (e.g., a known road segment)
2. Mark two points on the video that represent this distance
3. Set the speed limit for the monitored area

The system uses pixel-to-meter conversion to calculate vehicle speeds based on movement between frames.

## Development

### Backend Testing
```bash
cd backend
pytest
```

### Frontend Testing
```bash
cd frontend
yarn test
```

## UI Text & Branding

- **Hero quote** on the landing page is:
  - *“Every frame we analyze is a chance to save a life.”* — editable in `frontend/src/pages/LandingPage.js` (look for the hero paragraph).

## License & Credits

This project was originally developed as TrafficWatch-AI. Branding and attribution have been updated — see the **UI Text & Branding** section above for change locations.

## Support

For issues and questions, please open an issue or contact the development team.
