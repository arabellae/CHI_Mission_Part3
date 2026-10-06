@echo off
rem Starts the site on this computer and opens it in your browser. Close this window to stop it.
cd /d "%~dp0"
echo Starting the site at http://localhost:8000/
echo Close this window to stop the site.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000/"
where python >nul 2>nul && (python -m http.server 8000) || (py -m http.server 8000)
