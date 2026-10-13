#!/bin/bash
# ==============================================================================
# Script de démarrage universel Domotix pour ZimaOS
# Détection automatique de port libre (évite conflit port 8000) et de Docker
# ==============================================================================
set -e

echo "🚀 [Domotix] Préparation du dossier de persistance..."
mkdir -p data

# 1. Détection de l'accès Docker (avec ou sans sudo)
DOCKER_CMD="docker"
if ! docker info &> /dev/null; then
    if command -v sudo &> /dev/null && sudo docker info &> /dev/null; then
        DOCKER_CMD="sudo docker"
    fi
fi

# 2. Détection automatique d'un port disponible (commence à 8585 pour éviter 8000)
is_port_in_use() {
    local port=$1
    # Test 1 : /dev/tcp natif bash
    if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
        return 0
    fi
    # Test 2 : ss si disponible
    if command -v ss &>/dev/null && ss -tuln 2>/dev/null | grep -q ":$port "; then
        return 0
    fi
    # Test 3 : netstat si disponible
    if command -v netstat &>/dev/null && netstat -tuln 2>/dev/null | grep -q ":$port "; then
        return 0
    fi
    # Test 4 : nc si disponible
    if command -v nc &>/dev/null && nc -z 127.0.0.1 "$port" 2>/dev/null; then
        return 0
    fi
    return 1
}

find_free_port() {
    local p="${PORT:-8585}"
    while [ "$p" -le 8999 ]; do
        if ! is_port_in_use "$p"; then
            echo "$p"
            return
        fi
        echo "⚠️  Port $p déjà utilisé, tentative avec le port suivant..." >&2
        p=$((p + 1))
    done
    echo "8585"
}

APP_PORT=$(find_free_port)
echo "🔌 Port d'écoute libre sélectionné : ${APP_PORT}"

# Arrêter d'anciens conteneurs domotix orphelins si présents
$DOCKER_CMD rm -f domotix-inventory 2>/dev/null || true

# 3. Lancement selon les capacités du système
# Cas A : Docker Compose V2 plugin
if $DOCKER_CMD compose version &> /dev/null; then
    echo "✅ Docker Compose V2 détecté. Lancement..."
    PORT=${APP_PORT} $DOCKER_CMD compose up -d --build

# Cas B : docker-compose autonome
elif command -v docker-compose &> /dev/null; then
    echo "✅ docker-compose standalone détecté. Lancement..."
    if ! docker-compose version &> /dev/null && command -v sudo &> /dev/null; then
        PORT=${APP_PORT} sudo docker-compose up -d --build
    else
        PORT=${APP_PORT} docker-compose up -d --build
    fi

# Cas C : Fallback 100% garanti Docker natif (build & run direct)
else
    echo "⚠️ Docker Compose n'est pas présent sur ce système."
    echo "📦 Lancement direct via Docker natif sur le port ${APP_PORT}..."
    $DOCKER_CMD build -t domotix .
    $DOCKER_CMD run -d \
      --name domotix-inventory \
      --restart unless-stopped \
      -p "${APP_PORT}:8000" \
      -v "$(pwd)/data:/data" \
      -e DATABASE_URL="sqlite:////data/inventory.db" \
      -e OLLAMA_URL="http://ollama:11434" \
      -e WHISPER_URL="http://faster-whisper:9000" \
      -e PIPER_URL="http://piper:5000" \
      domotix
fi

IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "=========================================================="
echo "🎉 Domotix est opérationnel !"
echo "👉 Accédez à l'interface web : http://${IP_ADDR:-localhost}:${APP_PORT}"
echo "=========================================================="
