#!/bin/bash

# Colores para mejor visualización
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Función para imprimir mensajes con formato
print_message() {
    echo -e "${BLUE}==>${NC} $1"
}

print_title() {
    echo -e "\n${PURPLE}===== $1 =====${NC}\n"
}

print_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

print_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

# Función para verificar la instalación de Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js no está instalado. Por favor instala Node.js v14 o superior."
        echo "Puedes descargarlo desde: https://nodejs.org/"
        exit 1
    fi

    # Verificar versión de Node.js
    node_version=$(node -v | cut -d "v" -f 2 | cut -d "." -f 1)
    if [ "$node_version" -lt 14 ]; then
        print_warning "Estás usando Node.js v$(node -v). Recomendamos usar v14 o superior."
        read -p "¿Deseas continuar de todos modos? (s/n): " continue_anyway
        if [[ $continue_anyway != "s" && $continue_anyway != "S" ]]; then
            exit 1
        fi
    else
        print_success "Node.js v$(node -v) detectado correctamente."
    fi
}

# Función para verificar la instalación de npm
check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "npm no está instalado."
        exit 1
    else
        print_success "npm v$(npm -v) detectado correctamente."
    fi
}

# Función para instalar dependencias
install_dependencies() {
    print_title "Instalando dependencias"
    print_message "Esto puede tomar un momento..."

    npm install

    if [ $? -eq 0 ]; then
        print_success "Dependencias instaladas correctamente."
    else
        print_error "Error al instalar dependencias."
        exit 1
    fi
}

# Función para configurar el archivo .env
setup_env() {
    print_title "Configuración del archivo .env"

    if [ -f .env ]; then
        print_warning "Ya existe un archivo .env."
        read -p "¿Deseas crear uno nuevo? (s/n): " create_new_env
        if [[ $create_new_env != "s" && $create_new_env != "S" ]]; then
            print_message "Usando el archivo .env existente."

            # Ejecutar automáticamente la prueba
            print_message "Ejecutando prueba de configuración..."
            node test.js

            return
        fi
    fi

    print_message "Ejecutando el asistente de configuración..."
    node setup.js

    # Ejecutar automáticamente la prueba después de crear el .env
    print_message "Ejecutando prueba de configuración..."
    node test.js
}

# Función para explicar la diferencia entre modos
explain_modes() {
    clear
    echo -e "${BLUE}===== MODOS DE EJECUCIÓN DISPONIBLES =====${NC}"
    echo
    echo -e "${YELLOW}1. MODO INMEDIATO${NC}"
    echo "   - Comienza a intentar inmediatamente"
    echo "   - Realiza intentos continuos cada segundo"
    echo "   - Utiliza timeout para detener los intentos"
    echo "   - Mejor para máxima velocidad de intentos"
    echo
    echo -e "${YELLOW}2. MODO PROGRAMADO${NC}"
    echo "   - Espera hasta una hora específica para comenzar"
    echo "   - Realiza intentos cada 5 segundos"
    echo "   - Utiliza un número limitado de intentos"
    echo "   - Mejor cuando conoces la hora exacta"
    echo
    echo -e "${YELLOW}3. MODO AVANZADO${NC}"
    echo "   - Similar al modo programado, pero con más opciones"
    echo "   - Permite múltiples transacciones concurrentes"
    echo "   - Optimización de gas price para cada intento"
    echo "   - Mejor para usuarios experimentados"
    echo
    echo -e "${YELLOW}4. MODO MULTIWALLET${NC}"
    echo "   - Utiliza múltiples wallets simultáneamente"
    echo "   - Puede comenzar inmediatamente o a una hora específica"
    echo "   - Intenta continuamente con todas las wallets disponibles"
    echo "   - Estadísticas detalladas por wallet"
    echo "   - Requiere archivo wallets.json con claves privadas"
    echo "   - Máxima probabilidad de éxito en ventas competitivas"
    echo
    echo -e "${YELLOW}5. TEST DE GAS${NC}"
    echo "   - Prueba la configuración de gas para evitar errores"
    echo "   - Verifica compatibilidad con transacciones EIP-1559"
    echo "   - Asegura que no haya problemas con maxFeePerGas/maxPriorityFeePerGas"
    echo "   - Recomendado ejecutar antes de usar los scripts en una nueva red"
    echo
    read -p "Presiona ENTER para volver al menú principal"
}

# Función para configurar el modo multiwallet
setup_multiwallet() {
    print_title "Configuración de Multiwallet"

    if [ ! -f wallets.json ]; then
        if [ -f wallets.json.example ]; then
            print_message "No se encontró el archivo wallets.json pero existe wallets.json.example."
            print_message "Vamos a crear tu archivo de carteras."

            cp wallets.json.example wallets.json.temp
            print_message "Se ha creado un archivo temporal con el siguiente formato:"
            cat wallets.json.temp

            read -p "¿Cuántas carteras deseas configurar? " num_wallets

            # Crear array para almacenar las carteras
            echo "[" > wallets.json

            for (( i=1; i<=$num_wallets; i++ )); do
                print_message "Configurando cartera $i de $num_wallets"
                read -p "Etiqueta para la cartera $i: " wallet_label

                # Leer clave privada de manera segura
                wallet_key=""
                while [ -z "$wallet_key" ]; do
                    echo "Ingresa la clave privada para la cartera $i (la entrada estará oculta):"
                    read -s wallet_key

                    # Verificar formato
                    if [[ ! "$wallet_key" =~ ^(0x)?[0-9a-fA-F]{64}$ ]]; then
                        print_error "Formato de clave privada inválido. Debe tener 64 caracteres hexadecimales (con o sin 0x)."
                        wallet_key=""
                    fi
                done

                # Asegurarse de que la clave tenga el prefijo 0x
                if [[ ! "$wallet_key" =~ ^0x ]]; then
                    wallet_key="0x$wallet_key"
                fi

                # Añadir a wallets.json
                echo "  {" >> wallets.json
                echo "    \"label\": \"$wallet_label\"," >> wallets.json
                echo "    \"privateKey\": \"$wallet_key\"" >> wallets.json

                # Si no es la última cartera, añadir coma
                if [ $i -lt $num_wallets ]; then
                    echo "  }," >> wallets.json
                else
                    echo "  }" >> wallets.json
                fi
            done

            echo "]" >> wallets.json
            rm wallets.json.temp

            print_success "Archivo wallets.json creado con $num_wallets carteras."
        else
            print_error "No se encontró el archivo wallets.json ni wallets.json.example."
            print_message "Creando un archivo wallets.json básico con tu clave privada de .env"

            # Extraer clave privada del .env
            if [ -f .env ]; then
                PRIVATE_KEY=$(grep "PRIVATE_KEY" .env | cut -d= -f2)

                # Crear wallets.json con una sola cartera
                echo "[" > wallets.json
                echo "  {" >> wallets.json
                echo "    \"label\": \"Wallet Principal\"," >> wallets.json
                echo "    \"privateKey\": \"$PRIVATE_KEY\"" >> wallets.json
                echo "  }" >> wallets.json
                echo "]" >> wallets.json

                print_success "Archivo wallets.json creado con 1 cartera."
            else
                print_error "No se pudo crear el archivo wallets.json. No existe archivo .env."
                return
            fi
        fi
    else
        print_message "El archivo wallets.json ya existe."
        read -p "¿Deseas usar el archivo existente o crear uno nuevo? (e/n): " use_existing_file

        if [[ "$use_existing_file" != "e" && "$use_existing_file" != "E" ]]; then
            # Hacer backup del archivo existente
            mv wallets.json wallets.json.backup
            print_message "Se ha hecho un backup del archivo existente como wallets.json.backup"

            # Volver a llamar a esta función para crear un nuevo archivo
            setup_multiwallet
            return
        fi
    fi

    print_message "Ejecutando modo multiwallet..."
    npm run multiwallet
}

# Función para ejecutar el script seleccionado
run_script() {
    clear
    print_title "Ejecución del Script"

    echo -e "${BLUE}¿Qué modo deseas ejecutar?${NC}"
    echo "1. Modo Básico"
    echo "2. Modo Avanzado"
    echo "3. Modo Inmediato (recomendado si no conoces la hora exacta)"
    echo "4. Modo Multiwallet (máxima probabilidad de éxito)"
    echo "5. Probar configuración"
    echo "6. Probar configuración de gas"
    echo "7. Ver información sobre modos"
    echo "8. Salir"

    read -p "Selecciona una opción (1-8): " script_option

    case $script_option in
        1)
            print_message "Ejecutando modo básico..."
            npm run start
            ;;
        2)
            print_message "Ejecutando modo avanzado..."
            npm run advanced
            ;;
        3)
            print_message "Ejecutando modo inmediato..."
            npm run immediate
            ;;
        4)
            setup_multiwallet
            ;;
        5)
            print_message "Probando configuración..."
            npm run test
            ;;
        6)
            print_message "Probando configuración de gas..."
            node test-gas.js
            read -p "Presiona ENTER para continuar..." continue_key
            run_script
            ;;
        7)
            explain_modes
            run_script
            ;;
        8)
            print_message "Saliendo..."
            exit 0
            ;;
        *)
            print_error "Opción inválida. Saliendo..."
            exit 1
            ;;
    esac
}

# Función principal
main() {
    clear
    print_title "Script de Contribución AVAX First-Come-First-Serve"
    print_message "Este asistente te guiará a través del proceso de configuración y ejecución."

    # Verificar requisitos
    print_title "Verificando requisitos"
    check_node
    check_npm

    # Instalar dependencias
    install_dependencies

    # Configurar archivo .env
    setup_env

    # Ejecutar el script
    run_script
}

# Ejecutar función principal
main