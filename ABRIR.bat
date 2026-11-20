@echo off
REM PonchoStudio: abre la app en http://localhost:8010
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Primero corre INSTALAR.bat
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m app
pause
