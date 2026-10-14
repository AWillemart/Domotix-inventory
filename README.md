# 📦 Domotix - Déploiement Local & Serveur ZimaOS

Ce guide vous explique pas à pas comment déployer **Domotix** sur votre serveur local (ZimaOS, CasaOS, Linux, Raspberry Pi, NAS) maintenant que votre compte **GitHub** est relié.

---

## ⚡ En résumé : Vos 3 options de déploiement

| Option | Idéal pour | Commande principale |
| :--- | :--- | :--- |
| **Option 1 : Image Docker (GHCR)** 🚀 | Déploiement instantané sans compiler sur le serveur | `docker compose pull && docker compose up -d` |
| **Option 2 : Dépôt Git direct** 🛠️ | Tests, modifications locales et mises à jour via `git pull` | `./start.sh` ou `docker compose up -d --build` |
| **Option 3 : Interface ZimaOS (UI)** 🖥️ | Installation sans passer par le terminal SSH | Bouton **"Custom App"** / Importer compose |

---

## 🚀 Option 1 : Déploiement via Image Docker préconstruite (Recommandé)

Grâce au fichier `.github/workflows/docker-publish.yml` configuré dans votre dépôt, chaque `git push` sur la branche principale compile automatiquement une image Docker multi-architecture (`linux/amd64` pour PC/ZimaOS et `linux/arm64` pour Raspberry Pi) et la publie sur le registre **GitHub Container Registry (GHCR)**.

### 1. Activer la visibilité publique de l'image (1 fois seulement sur GitHub) :
1. Sur GitHub, ouvrez votre dépôt.
2. Allez dans **Packages** (sur le côté droit de la page d'accueil de votre repo).
3. Cliquez sur le package `domotix`.
4. Dans **Package Settings**, faites défiler vers le bas jusqu'à **Danger Zone** et passez la visibilité en **Public** (cela permet à votre serveur de télécharger l'image sans avoir besoin de mot de passe Docker).

### 2. Lancer sur votre serveur avec Docker Compose :
Sur votre serveur ZimaOS (en SSH ou dans le terminal) :

```bash
mkdir -p ~/AppData/domotix && cd ~/AppData/domotix
```

Créez ou éditez le fichier `docker-compose.yml` :
```yaml
version: "3.8"

services:
  domotix:
    image: ghcr.io/<VOTRE-PSEUDO-GITHUB>/<NOM-DU-REPO>:latest
    container_name: domotix-inventory
    restart: unless-stopped
    ports:
      - "8585:8000"
    volumes:
      - ./data:/data
    environment:
      - DATABASE_URL=sqlite:////data/inventory.db
      - OLLAMA_URL=http://host.docker.internal:11434
      - WHISPER_URL=http://faster-whisper:9000
      - PIPER_URL=http://piper:5000
      - DEFAULT_OLLAMA_MODEL=gemma3:4b
    extra_hosts:
      - "host.docker.internal:host-gateway"
```
*(Remplacez `<VOTRE-PSEUDO-GITHUB>` et `<NOM-DU-REPO>` par vos identifiants GitHub).*

Puis lancez :
```bash
docker compose pull
docker compose up -d
```

### 3. Ou lancer directement avec une commande `docker run` :
```bash
docker run -d \
  --name domotix-inventory \
  --restart unless-stopped \
  -p 8585:8000 \
  -v $(pwd)/data:/data \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=sqlite:////data/inventory.db \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  ghcr.io/<VOTRE-PSEUDO-GITHUB>/<NOM-DU-REPO>:latest
```

---

## 🛠️ Option 2 : Déploiement via Git (Code Source)

Si vous préférez cloner le dépôt et laisser Docker compiler l'application directement sur la machine :

### 1. Sur votre serveur ZimaOS :
```bash
cd ~/AppData
git clone https://github.com/<VOTRE-PSEUDO-GITHUB>/<NOM-DU-REPO>.git domotix
cd domotix
```

### 2. Lancer avec le script intelligent `start.sh` :
Le script vérifie la disponibilité des ports (évite le conflit avec le port 8000 déjà utilisé), crée le dossier `/data` persistant et choisit la meilleure méthode d'exécution :
```bash
chmod +x start.sh
./start.sh
```

### 💡 Note importante pour ZimaOS :
Sur ZimaOS / Alpine / Debian moderne, Docker Compose est installé en tant que sous-commande Docker V2 :
- ❌ **Ne pas utiliser** : `docker-compose` (avec un tiret, car cette ancienne commande v1 n'est pas installée).
- ✅ **Utiliser** : `docker compose` (avec un espace) !

Si vous préférez exécuter la commande manuellement :
```bash
docker compose up -d --build
```

Pour mettre à jour après avoir fait des modifications sur GitHub :
```bash
git pull
docker compose up -d --build
```

---

## 🖥️ Option 3 : Interface Graphique ZimaOS / CasaOS

Vous pouvez installer Domotix sans jamais ouvrir de terminal :
1. Connectez-vous à l'interface web de votre **ZimaOS** (`http://zimaos.local`).
2. Allez dans **App Store**.
3. En haut à droite, cliquez sur **Custom Install** (ou **Installer une application personnalisée**).
4. Cliquez sur **Import** (icône en haut à droite de la fenêtre modale) et collez le contenu du fichier `docker-compose.yml`.
5. Ou renseignez manuellement les champs :
   - **Nom de l'application** : `Domotix`
   - **Image Docker** : `ghcr.io/<VOTRE-PSEUDO-GITHUB>/<NOM-DU-REPO>:latest` (ou construite localement)
   - **Port de l'hôte** : `8585` (ou tout port libre) ➔ **Port du conteneur** : `8000`
   - **Volume hôte** : `/DATA/AppData/domotix/data` ➔ **Conteneur** : `/data`
   - **Variables d'environnement** :
     - `OLLAMA_URL=http://host.docker.internal:11434`
     - `DATABASE_URL=sqlite:////data/inventory.db`
6. Cliquez sur **Enregistrer / Installer**. L'icône Domotix apparaîtra directement sur le bureau ZimaOS !

---

## 🌐 Accès à l'application

Une fois démarré, ouvrez votre navigateur depuis votre téléphone ou PC sur le même réseau :
👉 **`http://<IP_DE_VOTRE_ZIMAOS>:8585`**  
*(Exemple : `http://192.168.1.50:8585` ou `http://zimaos.local:8585`)*

### 🔍 Vérifier l'état et les logs :
```bash
docker compose logs -f domotix
```
Ou dans l'interface ZimaOS : cliquez sur les 3 petits points de l'application Domotix > **Logs**.
