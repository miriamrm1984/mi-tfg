@echo off
echo.
echo ========================================
echo Bus Escolar - Sistema de Transporte
echo ========================================
echo.

REM Verificar si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js no está instalado
    echo Descargalo desde: https://nodejs.org
    pause
    exit /b 1
)

REM Verificar si las dependencias están instaladas
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    echo.
)

REM Verificar si la BD existe
if not exist "database\transporte_escolar.db" (
    echo Inicializando base de datos...
    call npm run init-db
    echo.
)

echo Iniciando servidor...
echo.
echo ✓ Servidor ejecutándose en http://localhost:3000
echo ✓ Presiona Ctrl+C para detener
echo.

call npm start

pause
