@echo off
cd /d "%~dp0"
title De Alleseter
python launch.py
echo.
echo (The launcher stopped. Close this window or press any key.)
pause > nul
