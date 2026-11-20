@echo off
REM PonchoStudio: crea el entorno virtual e instala lo necesario.
REM Usa Python 3.12 si esta; si no, el Python 3 mas nuevo del lanzador "py" (3.13/3.14 sirven).
cd /d "%~dp0"
echo Creando entorno virtual en .venv ...
py -3.12 -m venv .venv 2>nul
if not exist ".venv\Scripts\python.exe" py -3 -m venv .venv 2>nul
if not exist ".venv\Scripts\python.exe" python -m venv .venv 2>nul
if not exist ".venv\Scripts\python.exe" (
  echo No encontre Python 3. Instalalo desde python.org y vuelve a intentar.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" --version
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements-dev.txt
if errorlevel 1 (
  echo Fallo la instalacion. Revisa tu internet.
  pause
  exit /b 1
)
if not exist ".env" copy env.ejemplo .env >nul
echo.
echo Listo. Pon tus llaves en .env (o en la app: Ajustes, Pegar mis llaves) y abre ABRIR.bat
if not "%1"=="--sin-pausa" pause
