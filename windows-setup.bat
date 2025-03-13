@echo off
title Script de Contribución AVAX First-Come-First-Serve

echo.
echo ===== Script de Contribucion AVAX First-Come-First-Serve =====
echo Este asistente te guiara a traves del proceso de configuracion y ejecucion.
echo.

:: Verificar requisitos
echo ===== Verificando requisitos =====
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado. Por favor instala Node.js v14 o superior.
    echo Puedes descargarlo desde: https://nodejs.org/
    pause
    exit /b
)

:: Imprimir versión de Node.js
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo SUCCESS: Node.js %NODE_VERSION% detectado correctamente.

:: Verificar npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm no esta instalado.
    pause
    exit /b
)

:: Imprimir versión de npm
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo SUCCESS: npm v%NPM_VERSION% detectado correctamente.
echo.

:: Instalar dependencias
echo ===== Instalando dependencias =====
echo Esto puede tomar un momento...
echo.

call npm install
if %errorlevel% neq 0 (
    echo ERROR: Error al instalar dependencias.
    pause
    exit /b
)

echo SUCCESS: Dependencias instaladas correctamente.
echo.

:: Configurar archivo .env
echo ===== Configuracion del archivo .env =====
echo.

if exist .env (
    echo WARNING: Ya existe un archivo .env.
    set /p CREATE_NEW_ENV="¿Deseas crear uno nuevo? (s/n): "
    if /i not "%CREATE_NEW_ENV%" == "s" (
        echo Usando el archivo .env existente.

        :: Ejecutar automáticamente la prueba
        echo Ejecutando prueba de configuracion...
        call node test.js

        goto :run_script
    )
)

echo Ejecutando el asistente de configuracion...
call node setup.js

:: Ejecutar automáticamente la prueba después de crear el .env
echo Ejecutando prueba de configuracion...
call node test.js
echo.

:run_script
:: Menú de ejecución
echo ===== Ejecucion del Script =====
echo.
echo Que modo deseas ejecutar?
echo 1. Modo Basico
echo 2. Modo Avanzado
echo 3. Modo Inmediato (recomendado si no conoces la hora exacta)
echo 4. Modo Multiwallet (maxima probabilidad de exito)
echo 5. Probar configuracion
echo 6. Probar configuracion de gas
echo 7. Ver informacion sobre modos
echo 8. Salir
echo.

set /p SCRIPT_OPTION="Selecciona una opcion (1-8): "

if "%SCRIPT_OPTION%"=="1" (
    echo Ejecutando modo basico...
    call npm run start
) else if "%SCRIPT_OPTION%"=="2" (
    echo Ejecutando modo avanzado...
    call npm run advanced
) else if "%SCRIPT_OPTION%"=="3" (
    echo Ejecutando modo inmediato...
    call npm run immediate
) else if "%SCRIPT_OPTION%"=="4" (
    call :setup_multiwallet
) else if "%SCRIPT_OPTION%"=="5" (
    echo Ejecutando prueba de configuracion...
    call npm run test
) else if "%SCRIPT_OPTION%"=="6" (
    echo Probando configuracion de gas...
    call node test-gas.js
    pause
    goto :run_script
) else if "%SCRIPT_OPTION%"=="7" (
    call :explain_modes
    goto :run_script
) else if "%SCRIPT_OPTION%"=="8" (
    echo Saliendo...
    exit /b
) else (
    echo ERROR: Opcion invalida.
    pause
    goto :run_script
)

goto :eof

:setup_multiwallet
echo ===== Configuracion de Multiwallet =====
echo.

if not exist wallets.json (
    if exist wallets.json.example (
        echo No se encontro el archivo wallets.json pero existe wallets.json.example.
        echo Vamos a crear tu archivo de carteras.

        copy wallets.json.example wallets.json.temp
        echo Se ha creado un archivo temporal con el siguiente formato:
        type wallets.json.temp

        set /p NUM_WALLETS="¿Cuantas carteras deseas configurar? "

        echo [ > wallets.json

        for /l %%i in (1, 1, %NUM_WALLETS%) do (
            echo Configurando cartera %%i de %NUM_WALLETS%
            set /p WALLET_LABEL="Etiqueta para la cartera %%i: "

            echo Ingresa la clave privada para la cartera %%i:
            set /p WALLET_KEY="(con o sin 0x): "

            echo   { >> wallets.json
            echo     "label": "%WALLET_LABEL%", >> wallets.json
            echo     "privateKey": "%WALLET_KEY%" >> wallets.json

            if %%i LSS %NUM_WALLETS% (
                echo   }, >> wallets.json
            ) else (
                echo   } >> wallets.json
            )
        )

        echo ] >> wallets.json
        del wallets.json.temp

        echo SUCCESS: Archivo wallets.json creado con %NUM_WALLETS% carteras.
    ) else (
        echo ERROR: No se encontro el archivo wallets.json ni wallets.json.example.
        echo Creando un archivo wallets.json basico con tu clave privada de .env

        if exist .env (
            for /f "tokens=2 delims==" %%a in ('findstr "PRIVATE_KEY" .env') do set PRIVATE_KEY=%%a

            echo [ > wallets.json
            echo   { >> wallets.json
            echo     "label": "Wallet Principal", >> wallets.json
            echo     "privateKey": "%PRIVATE_KEY%" >> wallets.json
            echo   } >> wallets.json
            echo ] >> wallets.json

            echo SUCCESS: Archivo wallets.json creado con 1 cartera.
        ) else (
            echo ERROR: No se pudo crear el archivo wallets.json. No existe archivo .env.
            goto :eof
        )
    )
) else (
    echo El archivo wallets.json ya existe.
    set /p USE_EXISTING_FILE="¿Deseas usar el archivo existente o crear uno nuevo? (e/n): "

    if /i not "%USE_EXISTING_FILE%" == "e" (
        ren wallets.json wallets.json.backup
        echo Se ha hecho un backup del archivo existente como wallets.json.backup

        goto :setup_multiwallet
        exit /b
    )
)

echo Ejecutando modo multiwallet...
call npm run multiwallet
goto :eof

:explain_modes
cls
echo ===== MODOS DE EJECUCION DISPONIBLES =====
echo.
echo 1. MODO INMEDIATO
echo    - Comienza a intentar inmediatamente
echo    - Realiza intentos continuos cada segundo
echo    - Utiliza timeout para detener los intentos
echo    - Mejor para maxima velocidad de intentos
echo.
echo 2. MODO PROGRAMADO
echo    - Espera hasta una hora especifica para comenzar
echo    - Realiza intentos cada 5 segundos
echo    - Utiliza un numero limitado de intentos
echo    - Mejor cuando conoces la hora exacta
echo.
echo 3. MODO AVANZADO
echo    - Similar al modo programado, pero con mas opciones
echo    - Permite multiples transacciones concurrentes
echo    - Optimizacion de gas price para cada intento
echo    - Mejor para usuarios experimentados
echo.
echo 4. MODO MULTIWALLET
echo    - Utiliza multiples wallets simultaneamente
echo    - Puede comenzar inmediatamente o a una hora especifica
echo    - Intenta continuamente con todas las wallets disponibles
echo    - Estadisticas detalladas por wallet
echo    - Requiere archivo wallets.json con claves privadas
echo    - Maxima probabilidad de exito en ventas competitivas
echo.
echo 5. TEST DE GAS
echo    - Prueba la configuracion de gas para evitar errores
echo    - Verifica compatibilidad con transacciones EIP-1559
echo    - Asegura que no haya problemas con maxFeePerGas/maxPriorityFeePerGas
echo    - Recomendado ejecutar antes de usar los scripts en una nueva red
echo.
pause
goto :eof

pause