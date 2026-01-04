# Start script for TrafficWatch-21
# This script starts both backend and frontend servers in separate windows

Write-Host "Starting TrafficWatch-21..." -ForegroundColor Cyan
Write-Host ""

# Check if MongoDB is running
Write-Host "Checking MongoDB..." -ForegroundColor Yellow
try {
    $mongoCheck = Test-NetConnection -ComputerName localhost -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($mongoCheck) {
        Write-Host "[OK] MongoDB is running" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] MongoDB is not running on port 27017" -ForegroundColor Yellow
        Write-Host "   Please start MongoDB before running the application" -ForegroundColor Yellow
        Write-Host "   You can start it from Services or run: net start MongoDB" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARNING] Could not check MongoDB status" -ForegroundColor Yellow
}

Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if backend virtual environment exists
if (-not (Test-Path "$scriptDir\backend\venv\Scripts\python.exe")) {
    Write-Host "[ERROR] Backend virtual environment not found!" -ForegroundColor Red
    Write-Host "   Please run the installation steps first:" -ForegroundColor Yellow
    Write-Host "   1. cd backend" -ForegroundColor White
    Write-Host "   2. python -m venv venv" -ForegroundColor White
    Write-Host "   3. venv\Scripts\Activate.ps1" -ForegroundColor White
    Write-Host "   4. pip install -r requirements.txt" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check if frontend node_modules exists
if (-not (Test-Path "$scriptDir\frontend\node_modules")) {
    Write-Host "[ERROR] Frontend dependencies not installed!" -ForegroundColor Red
    Write-Host "   Please run: cd frontend && yarn install" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Start Backend Server in new window
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptDir\backend'; Write-Host 'Backend Server Starting...' -ForegroundColor Green; .\venv\Scripts\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000"

# Wait a moment for backend to initialize
Start-Sleep -Seconds 3

# Start Frontend Server in new window
Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptDir\frontend'; Write-Host 'Frontend Server Starting...' -ForegroundColor Green; yarn start"

Write-Host ""
Write-Host "[SUCCESS] Both servers are starting in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "Access Points:" -ForegroundColor Cyan
Write-Host "   Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "   API Docs:     http://localhost:8000/docs" -ForegroundColor White
Write-Host "   Frontend App: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Tip: Close the server windows to stop the servers" -ForegroundColor Yellow
Write-Host ""

