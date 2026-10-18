@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 o superior desde https://nodejs.org
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])>=24)process.exit(0);process.exit(1)"
if errorlevel 1 (
  echo Necesitas Node.js 24 o superior.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd start
pause
