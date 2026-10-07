@echo off
cd /d "%~dp0"
echo Slot3R local preview: http://127.0.0.1:8765
echo Keep this window open while previewing. Press Ctrl+C to stop.
python -m http.server 8765 --bind 127.0.0.1 --directory .
pause
