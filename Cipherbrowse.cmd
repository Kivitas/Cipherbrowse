@echo off
setlocal
set "APP_ROOT=%~dp0"
set "ENTRY=%APP_ROOT%Main\src\index.js"

:: 1. Check if Node.js is installed globally in the system PATH
set "NODE_CMD=node"
node -v >nul 2>nul
if %ERRORLEVEL% equ 0 goto :RUN

:: 2. Check if Node.js is cached in the user profile
set "LOCAL_NODE_DIR=%USERPROFILE%\.cipherbrowse\bin"
set "NODE_CMD=%LOCAL_NODE_DIR%\node.exe"
if exist "%NODE_CMD%" goto :RUN

:: 3. Check if Node.js is cached in the project directory
set "PROJECT_NODE_DIR=%APP_ROOT%Main\.cipherbrowse\bin"
set "NODE_CMD=%PROJECT_NODE_DIR%\node.exe"
if exist "%NODE_CMD%" goto :RUN

:: 4. If Node is not found, attempt to download it automatically
echo =====================================================================
echo Node.js is required to run CipherBrowse v1.0.2, but was not found.
echo =====================================================================
echo.
echo We will automatically download a portable, lightweight Node.js
echo binary (v18.20.3, ~30MB) so you can run the app without installing
echo anything globally.
echo.

:: Check if curl is available
where curl >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo ERROR: 'curl' was not found on your system.
  echo Please download and install Node.js manually from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Downloading Node.js... Please wait.
mkdir "%LOCAL_NODE_DIR%" >nul 2>nul
curl -L -o "%LOCAL_NODE_DIR%\node.exe" "https://nodejs.org/dist/v18.20.3/win-x64/node.exe"

if %ERRORLEVEL% equ 0 (
  set "NODE_CMD=%LOCAL_NODE_DIR%\node.exe"
  goto :DOWNLOAD_OK
)

echo.
echo Retrying download to local project directory...
mkdir "%PROJECT_NODE_DIR%" >nul 2>nul
curl -L -o "%PROJECT_NODE_DIR%\node.exe" "https://nodejs.org/dist/v18.20.3/win-x64/node.exe"

if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Failed to download Node.js.
  echo Please check your internet connection or download Node.js manually.
  echo.
  pause
  exit /b 1
)

set "NODE_CMD=%PROJECT_NODE_DIR%\node.exe"

:DOWNLOAD_OK
echo Download complete!
echo.


:RUN
:: Verify index.js exists
if not exist "%ENTRY%" (
  echo CipherBrowse launcher error:
  echo Could not find "%ENTRY%"
  echo Keep the Main folder beside this .cmd file.
  echo.
  pause
  exit /b 1
)

:: Run the application using the determined Node binary
"%NODE_CMD%" "%ENTRY%" %*

:: If Node exited with an error, pause so the user can read the error trace
if %ERRORLEVEL% neq 0 (
  echo.
  echo [CipherBrowse v1.0.2 exited with error code %ERRORLEVEL%]
  echo.
  rem Detect if launched from Windows Explorer [double-clicked]
  echo %cmdcmdline% | findstr /i /c:"/c" >nul
  if %ERRORLEVEL% equ 0 (
    echo Press any key to close this window...
    pause >nul
  )
)



