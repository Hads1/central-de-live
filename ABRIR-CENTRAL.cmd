@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instale as dependencias com npm.cmd ci na pasta da Central de Live.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
