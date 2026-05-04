#!/bin/bash

echo ""
echo "========================================"
echo "Bus Escolar - Sistema de Transporte"
echo "========================================"
echo ""

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no está instalado"
    echo "Descargalo desde: https://nodejs.org"
    exit 1
fi

# Verificar si las dependencias están instaladas
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
    echo ""
fi

# Verificar si la BD existe
if [ ! -f "database/transporte_escolar.db" ]; then
    echo "Inicializando base de datos..."
    npm run init-db
    echo ""
fi

echo "Iniciando servidor..."
echo ""
echo "✓ Servidor ejecutándose en http://localhost:3000"
echo "✓ Presiona Ctrl+C para detener"
echo ""

npm start
