@echo off
cd /d "%~dp0"
echo.
echo   Vorm Jr. App Server (LAN)
echo   =========================
echo   Serving this folder on port 8000.
echo   On the iPhone / iPad, open the same laptop IP shown by
echo   upload-server.py, but with :8000 instead of :8080.
echo.
echo   Example:  http://192.168.0.39:8000
echo.
echo   Press Ctrl+C to stop.
echo.
python -m http.server 8000 --bind 0.0.0.0
