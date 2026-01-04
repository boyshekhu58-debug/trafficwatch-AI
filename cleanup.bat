@echo off
echo ============================================================
echo TrafficAI Cleanup Script
echo ============================================================
echo.
echo This will clean up:
echo   - Python cache files (__pycache__)
echo   - Old processed videos/photos (older than 30 days)
echo   - Build artifacts
echo   - Test reports
echo.
pause

python cleanup.py

pause

