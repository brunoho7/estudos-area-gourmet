@echo off
setlocal
chcp 65001 >nul
title Area Gourmet - Reservas
cd /d "%~dp0"

set "NODE_CMD="
where node >nul 2>nul
if not errorlevel 1 set "NODE_CMD=node"

if not defined NODE_CMD (
    if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (
        set "NODE_CMD=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    )
)

if not defined NODE_CMD (
    echo.
    echo  Node.js nao foi encontrado neste computador.
    echo  Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo   AREA GOURMET - RESERVAS DO CONDOMINIO
echo  ==========================================
echo.
echo  Iniciando o servidor em http://localhost:3000
echo  O navegador abrira automaticamente em 2 segundos.
echo  Mantenha esta janela aberta. Para encerrar, use Ctrl+C.
echo.

if not "%AG_NO_BROWSER%"=="1" (
    start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
)
"%NODE_CMD%" server.js

echo.
echo  Servidor encerrado.
pause
