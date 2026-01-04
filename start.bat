@echo off
REM Simple batch file to start both servers
echo Starting TrafficWatch-21...
echo.

REM Check if backend virtual environment exists
if not exist "backend\venv\Scripts\python.exe" (
    echo ERROR: Backend virtual environment not found!
    echo Please run the installation steps first:
    echo   1. cd backend
    echo   2. python -m venv venv
    echo   3. venv\Scripts\activate.bat
    echo   4. pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo ERROR: Frontend dependencies not installed!
    echo Please run: cd frontend ^&^& yarn install
    echo.
    pause
    exit /b 1
)

REM Start backend in new window
start "Backend Server" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000"

REM Wait a moment
timeout /t 3 /nobreak >nul

REM Start frontend in new window
start "Frontend Server" cmd /k "cd frontend && yarn start"

echo.
echo Backend API:  http://localhost:8000
echo Frontend App: http://localhost:3000
echo.
echo Both servers are starting in separate windows.
echo Close the windows to stop the servers.
pause

