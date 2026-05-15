@echo off
setlocal
set "APP_ROOT=%~dp0"
set "ENTRY=%APP_ROOT%Main\src\index.js"

if not exist "%ENTRY%" (
  echo CipherBrowse launcher error:
  echo Could not find "%ENTRY%"
  echo Keep the Main folder beside this .cmd file.
  exit /b 1
)

node "%ENTRY%" %*
