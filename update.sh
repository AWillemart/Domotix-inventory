#!/bin/bash
# ==============================================================================
# Script de mise à jour Domotix en 1 clic pour ZimaOS / Linux
# Récupère la dernière version depuis GitHub et relance les conteneurs
# ==============================================================================
set -e

echo "🚀 [Domotix] Recherche et application des mises à jour..."

# 1. Mise à jour des sources Git si le dossier .git existe
if [ -d ".git" ]; then
    echo "📦 Récupération du code source depuis GitHub..."
    git pull origin main || true
fi

# 2. Détection de Docker (avec ou sans sudo)
DOCKER_CMD="docker"
if ! docker info &> /dev/null; then
    if command -v sudo &> /dev/null && sudo docker info &> /dev/null; then
        DOCKER_CMD="sudo docker"
    fi
fi

# 3. Pull de la dernière image Docker GHCR et redémarrage
if $DOCKER_CMD compose version &> /dev/null; then
    echo "⬇️ Téléchargement des dernières images Docker..."
    $DOCKER_CMD compose pull || true
    echo "🔄 Redémarrage avec la nouvelle version..."
    $DOCKER_CMD compose up -d --build
elif command -v docker-compose &> /dev/null; then
    echo "⬇️ Téléchargement des dernières images Docker..."
    docker-compose pull || true
    echo "🔄 Redémarrage avec la nouvelle version..."
    docker-compose up -d --build
else
    echo "🔄 Recompilation et redémarrage du conteneur domotix..."
    $DOCKER_CMD build -t domotix .
    $DOCKER_CMD restart domotix-inventory || true
fi

echo ""
echo "=========================================================="
echo "🎉 Mise à jour de Domotix terminée avec succès !"
echo "👉 Vos données dans /data/inventory.db sont préservées."
echo "=========================================================="
