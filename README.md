# 📦 Domotix - Inventaire Domotique Vocal Intelligent pour ZimaOS

Application locale d'inventaire domotique intelligente par commande vocale (Faster-Whisper, Ollama avec modèles comme `gemma3:4b`, et Piper-TTS), stockée dans une base **SQLite** persistante et exécutable sous **ZimaOS** via **Docker**.

---

## 🏗️ Architecture & Composants

1. **Backend** : Python 3.11 avec FastAPI, Uvicorn et SQLAlchemy.
2. **Base de données** : SQLite local avec mode WAL (`/data/inventory.db`) persistant dans un volume Docker.
3. **Frontend** : Single Page Application (SPA) responsive mobile-first (HTML5, TailwindCSS, Lucide Icons, Web Audio API).
4. **Services d'IA Locaux** :
   - **Ollama API** (`http://ollama:11434` ou `http://host.docker.internal:11434`) : Extraction sémantique structurée au format JSON (Pièce, Emplacement, Contenant, Objets). Modèles supportés : `gemma3:4b`, `llama3:8b`, `mistral`, etc.
   - **Faster-Whisper API** (`http://faster-whisper:9000`) : Retranscription vocale (Speech-to-Text).
   - **Piper-TTS API** (`http://piper:5000`) : Synthèse vocale française (Text-to-Speech) pour la lecture des résultats de recherche.

---

## 🚀 Déploiement rapide sous ZimaOS

### Méthode 1 : Via l'interface ZimaOS (Custom App)
1. Ouvrez votre tableau de bord **ZimaOS**.
2. Cliquez sur **App Store** > **Custom Install** (ou **Installer une application personnalisée**).
3. Collez le contenu de `docker-compose.yml` ou configurez le conteneur :
   - Image : construite localement ou `domotix:latest`
   - Ports : `8000:8000`
   - Volumes : `/DATA/AppData/domotix/data:/data`
4. Cliquez sur **Démarrer**.

### Méthode 2 : En ligne de commande SSH sous ZimaOS
```bash
# 1. Créez un dossier pour Domotix
mkdir -p /DATA/AppData/domotix
cd /DATA/AppData/domotix

# 2. Copiez l'ensemble des fichiers du projet dans ce dossier :
# - docker-compose.yml
# - Dockerfile
# - requirements.txt
# - database.py
# - models.py
# - ollama_service.py
# - speech_service.py
# - main.py
# - templates/index.html

# 3. Lancez le conteneur Docker en arrière-plan
docker compose up -d --build

# 4. Vérifiez les logs
docker compose logs -f domotix
```

Accédez à l'application depuis n'importe quel smartphone ou PC sur votre réseau local :  
👉 **`http://<IP_DE_VOTRE_ZIMAOS>:8000`**

---

## 🎙️ Exemples d'utilisation vocale

### 1. Ajout d'inventaire
> *"Je suis dans le garage devant l'étagère à côté de l'entrée, dans la caisse en carton Action 02 j'ai du ruban de masquage, un rouleau à peinture et un masque FP2."*

- **Résultat extrait automatiquement par Ollama** :
  - **Pièce** : `Garage`
  - **Emplacement** : `Étagère à côté de l'entrée`
  - **Contenant** : `Caisse en carton Action 02`
  - **Objets** : `["ruban de masquage", "rouleau à peinture", "masque FP2"]`
- Si l'option de validation est active dans les réglages, une fenêtre modale vous permet de vérifier ou d'ajuster les éléments avant l'enregistrement définitif.

### 2. Recherche d'objets
> *"Je cherche une paire de ciseau et du ruban de masquage."*

- Le backend interroge SQLite de façon insensible à la casse et partielle.
- Réponse vocale générée par Piper-TTS et lue à voix haute :
  > *"Pour 'paire de ciseau' : paire de ciseaux dans Cuisine > Tiroir. Pour 'ruban de masquage' : ruban de masquage dans Garage > Étagère à côté de l'entrée > Caisse en carton Action 02."*

---

## ⚙️ Configuration & Réglages

Accessible directement depuis l'onglet **Réglages** de l'interface :
- **URL Ollama** : adresse de votre conteneur Ollama (ex: `http://ollama:11434` ou `http://192.168.1.X:11434`).
- **Bouton de test** : diagnostic de connexion immédiat avec retour visuel (Pastille verte / rouge).
- **Sélecteur de modèle** : bouton pour interroger l'API `/api/tags` d'Ollama et lister dynamiquement les modèles installés.
- **Toggle Validation** : Activer / désactiver la modale de confirmation avant ajout.
- **Export / Import** : Sauvegardes instantanées au format JSON et tableur CSV.
