@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 resources\run_A2CA.py
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python resources\run_A2CA.py
  goto :end
)
echo.
echo The A2CA local launcher requires Python 3.10 or newer.
echo Install Python from https://www.python.org/downloads/ and run this file again.
echo The precomputed Alignment + Tree workflow can still be opened directly with run_A2CA_offline.html.
echo.
pause
:end
endlocal
