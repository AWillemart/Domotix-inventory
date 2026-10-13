# Dockerfile pour Domotix - Inventaire Domotique Vocal (ZimaOS / Docker)
FROM python:3.11-slim

# Empêcher Python d'écrire des fichiers .pyc et forcer l'affichage immédiat des logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL="sqlite:////data/inventory.db"

# Installation des dépendances système nécessaires (curl pour healthcheck, ffmpeg pour l'audio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Création du dossier persistant pour la base SQLite
RUN mkdir -p /data

# Installation des paquets Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copie du code source de l'application
COPY . .

# Exposer le port de l'application FastAPI
EXPOSE 8000

# Vérification de santé du conteneur
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Démarrage de l'application FastAPI avec Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
