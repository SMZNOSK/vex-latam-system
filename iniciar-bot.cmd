@echo off
rem Ejecutar una copia permite actualizar este archivo sin alterar el script en uso.
if defined VEX_LAUNCH_COPY goto :launch
setlocal
set "VEX_LAUNCH_DIR=%~dp0"
set "VEX_LAUNCH_COPY=%TEMP%\vex-iniciar-%RANDOM%-%RANDOM%.cmd"
copy /Y "%~f0" "%VEX_LAUNCH_COPY%" >nul || exit /b 1
call "%VEX_LAUNCH_COPY%" %*
set "VEX_LAUNCH_RESULT=%errorlevel%"
del "%VEX_LAUNCH_COPY%" >nul 2>nul
exit /b %VEX_LAUNCH_RESULT%

:launch
setlocal EnableExtensions DisableDelayedExpansion
title VEX LATAM SYSTEM V1 - Inicio del bot
cd /d "%VEX_LAUNCH_DIR%"
if errorlevel 1 goto :error
echo VEX LATAM SYSTEM V1 - Preparacion e inicio
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 o superior desde https://nodejs.org
  echo Si acabas de instalarlo, cierra esta ventana y vuelve a abrir el archivo.
  goto :error
)
node -e "if(Number(process.versions.node.split('.')[0])>=24)process.exit(0);process.exit(1)"
if errorlevel 1 (
  echo Necesitas Node.js 24 o superior.
  goto :error
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo No encuentro npm. Reinstala Node.js incluyendo npm y vuelve a intentarlo.
  goto :error
)
if not exist package-lock.json (
  echo Falta package-lock.json. Copia la carpeta completa del proyecto.
  goto :error
)
if not exist scripts\prepare-browser.js (
  echo Falta scripts\prepare-browser.js. Copia la carpeta completa del proyecto.
  goto :error
)
if not exist .env (
  if not exist .env.example (
    echo Falta .env.example. Copia la carpeta completa del proyecto.
    goto :error
  )
  copy /-Y .env.example .env <nul >nul
  if errorlevel 1 goto :error
  echo Se creo .env. Copia en el tu configuracion del bot anterior,
  echo o completa DISCORD_TOKEN y DISCORD_GUILD_ID antes de volver a iniciar.
  echo El token se guarda solo en .env; no lo compartas por chat.
  goto :error
)
node --env-file=.env -e "process.exit(process.env.DISCORD_TOKEN?.trim()?0:1)"
if errorlevel 1 (
  echo Falta DISCORD_TOKEN o no se pudo leer .env. Revisa ese archivo.
  goto :error
)
rem Comprobar el bloqueo antes de modificar dependencias usadas por un bot activo.
node -e "const fs=require('node:fs');if(fs.existsSync('data/bot.lock')){try{const r=JSON.parse(fs.readFileSync('data/bot.lock','utf8'));if(!Number.isInteger(r.pid)||r.pid<=0)process.exit(2);try{process.kill(r.pid,0);process.exit(3)}catch(e){if(e.code!=='ESRCH')process.exit(3)}}catch{process.exit(2)}}"
if errorlevel 3 (
  echo El bot ya esta ejecutandose en esta laptop. No hace falta abrir otra copia.
  pause
  exit /b 0
)
if errorlevel 1 (
  echo No pude comprobar data\bot.lock. Deten el bot y revisa ese archivo.
  goto :error
)
if not defined VEX_UPDATE_DONE (
  echo Comprobando actualizaciones del repositorio...
  node scripts/update-repository.js
  if errorlevel 10 (
    echo Reiniciando el arrancador actualizado...
    set "VEX_UPDATE_DONE=1"
    set "VEX_REFRESH_DEPS=1"
    set "VEX_LAUNCH_COPY="
    call "%VEX_LAUNCH_DIR%iniciar-bot.cmd" %*
    exit /b
  )
)
echo [1/4] Comprobando paqueterias...
if defined VEX_REFRESH_DEPS goto :install
call npm.cmd ls --depth=0 >nul 2>nul
if errorlevel 1 goto :install
node --input-type=module -e "await import('discord.js');await import('playwright');await import('sharp');" >nul 2>nul
if errorlevel 1 goto :install
echo Paqueterias listas.
goto :browser

:install
echo Instalando las versiones del proyecto. Espera a que termine...
call npm.cmd ci --no-fund --no-audit
if errorlevel 1 (
  echo No se pudieron instalar las paqueterias. Revisa internet y el error anterior.
  goto :error
)
node --input-type=module -e "await import('discord.js');await import('playwright');await import('sharp');" >nul 2>nul
if errorlevel 1 (
  echo Las paqueterias no funcionan en esta laptop. Revisa tu version de Windows y Node.js.
  goto :error
)

:browser
echo [2/4] Comprobando navegador para las tarjetas...
node --env-file=.env scripts/prepare-browser.js
if errorlevel 1 goto :error
echo [3/4] Comprobando archivos de la V1...
node scripts/check.js
if errorlevel 1 goto :error
if /I "%~1"=="--pruebas" (
  node --env-file=.env scripts/start.js --test --check
) else (
  node --env-file=.env scripts/start.js --check
)
if errorlevel 1 goto :error
if /I "%~1"=="--preparar" (
  echo Preparacion completada. No se inicio el bot.
  pause
  exit /b 0
)
echo [4/4] Conectando el bot a Discord...
echo Deja esta ventana abierta. Ctrl+C permite detener el bot.
echo Usa una sola laptop para ejecutar este bot.
echo.
if /I "%~1"=="--pruebas" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows-job.ps1 -TestServer
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows-job.ps1
)
if errorlevel 1 goto :error
pause
exit /b 0

:error
echo.
echo No se completo el inicio. Corrige lo indicado y vuelve a abrir iniciar-bot.cmd.
pause
exit /b 1
