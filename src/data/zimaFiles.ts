import templateHtml from '../../templates/index.html?raw';

export interface ZimaFileInfo {
  filename: string;
  role: string;
  language: string;
  content: string;
}

export const ZIMA_PROJECT_FILES: Record<string, ZimaFileInfo> = {
  'docker-compose.yml': {
    filename: 'docker-compose.yml',
    role: 'Configuration Docker Compose avec volume SQLite persistant pour ZimaOS',
    language: 'yaml',
    content: `version: "3.8"

services:
  # =========================================================================
  # Domotix : Application Principale d'Inventaire Domotique Vocal
  # =========================================================================
  domotix:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: domotix-inventory
    restart: unless-stopped
    ports:
      - "\${PORT:-8585}:8000"
    volumes:
      # Volume persistant pour la base de données SQLite
      - ./data:/data
      # OPTIONNEL : Permet la mise à jour 1-clic autonome depuis l'interface web
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - DATABASE_URL=sqlite:////data/inventory.db
      # URLs des microservices IA locaux (adaptables selon votre réseau ZimaOS)
      - OLLAMA_URL=http://ollama:11434
      - WHISPER_URL=http://faster-whisper:9000
      - PIPER_URL=http://piper:5000
      - DEFAULT_OLLAMA_MODEL=gemma3:4b
      # Dépôt GitHub pour les mises à jour dans l'interface
      - GITHUB_REPO=awillemart/domotix-inventory
      - GITHUB_BRANCH=main
    networks:
      - domotix-network
    # Permet de communiquer avec l'hôte ZimaOS si Ollama/Whisper tournent hors Docker
    extra_hosts:
      - "host.docker.internal:host-gateway"

networks:
  domotix-network:
    name: domotix-network
    driver: bridge

volumes:
  data:
    name: domotix_data
`,
  },
  'Dockerfile': {
    filename: 'Dockerfile',
    role: 'Containerisation Python 3.11 avec ffmpeg, curl et FastAPI',
    language: 'dockerfile',
    content: `# Dockerfile pour Domotix - Inventaire Domotique Vocal (ZimaOS / Docker)
FROM python:3.11-slim

# Empêcher Python d'écrire des fichiers .pyc et forcer l'affichage immédiat des logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL="sqlite:////data/inventory.db"

# Installation des dépendances système nécessaires (curl pour healthcheck, ffmpeg pour l'audio)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    ffmpeg \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Création du dossier persistant pour la base SQLite
RUN mkdir -p /data

# Installation des paquets Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \\
    pip install --no-cache-dir -r requirements.txt

# Copie du code source de l'application
COPY . .

# Exposer le port de l'application FastAPI
EXPOSE 8000

# Vérification de santé du conteneur
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/api/health || exit 1

# Démarrage de l'application FastAPI avec Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
  },
  'requirements.txt': {
    filename: 'requirements.txt',
    role: 'Dépendances Python nécessaires (FastAPI, SQLAlchemy, uvicorn, etc.)',
    language: 'text',
    content: `fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
pydantic==2.10.4
python-multipart==0.0.20
requests==2.32.3
httpx==0.28.1
aiofiles==24.1.0
jinja2==3.1.5
`,
  },
  'database.py': {
    filename: 'database.py',
    role: 'Connexion SQLAlchemy SQLite avec mode WAL et initialisation des tables',
    language: 'python',
    content: `import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Chemin par défaut : volume Docker /data ou dossier local ./data
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/inventory.db")

# Assurer que le répertoire parent existe
if DATABASE_URL.startswith("sqlite:///"):
    db_path = DATABASE_URL.replace("sqlite:///", "")
    dir_path = os.path.dirname(db_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)

# Configuration du moteur SQLite avec connect_args pour le multithreading
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False
)

# Activer le support des clés étrangères et le mode WAL pour SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dépendance FastAPI pour obtenir une session de base de données."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialise les tables et injecte les paramètres par défaut."""
    from models import Configuration
    Base.metadata.create_all(bind=engine)
    
    # Paramètres par défaut
    defaults = {
        "ollama_url": os.getenv("OLLAMA_URL", "http://ollama:11434"),
        "whisper_url": os.getenv("WHISPER_URL", "http://faster-whisper:9000"),
        "piper_url": os.getenv("PIPER_URL", "http://piper:5000"),
        "ollama_model": os.getenv("DEFAULT_OLLAMA_MODEL", "gemma3:4b"),
        "piper_voice": os.getenv("DEFAULT_PIPER_VOICE", "fr_FR-siwis-medium"),
        "require_validation": "true",  # "true" ou "false"
    }

    db = SessionLocal()
    try:
        for cle, valeur in defaults.items():
            existing = db.query(Configuration).filter(Configuration.cle == cle).first()
            if not existing:
                db.add(Configuration(cle=cle, valeur=valeur))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Erreur lors de l'initialisation des paramètres : {e}")
    finally:
        db.close()
`,
  },
  'models.py': {
    filename: 'models.py',
    role: 'Modèles relationnels hiérarchiques Pièce > Emplacement > Contenant > Objet',
    language: 'python',
    content: `import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base


class Piece(Base):
    """Représente une pièce ou un lieu global (ex: Garage, Cuisine, Atelier)."""
    __tablename__ = "pieces"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nom = Column(String(120), nullable=False, unique=True, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    emplacements = relationship("Emplacement", back_populates="piece", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "emplacements": [emp.to_dict() for emp in self.emplacements] if self.emplacements else []
        }


class Emplacement(Base):
    """Représente un sous-espace dans une pièce (ex: Étagère à côté de l'entrée, Îlot central, Tiroir haut)."""
    __tablename__ = "emplacements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    piece_id = Column(Integer, ForeignKey("pieces.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(120), nullable=False, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    piece = relationship("Piece", back_populates="emplacements")
    contenants = relationship("Contenant", back_populates="emplacement", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "piece_id": self.piece_id,
            "piece_nom": self.piece.nom if self.piece else None,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "contenants": [cont.to_dict() for cont in self.contenants] if self.contenants else []
        }


class Contenant(Base):
    """Représente une boîte, caisse, bac ou meuble contenant des objets (ex: Caisse en carton Action 02, Boîte à vis)."""
    __tablename__ = "contenants"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    emplacement_id = Column(Integer, ForeignKey("emplacements.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(120), nullable=False, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    emplacement = relationship("Emplacement", back_populates="contenants")
    objets = relationship("Objet", back_populates="contenant", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "emplacement_id": self.emplacement_id,
            "emplacement_nom": self.emplacement.nom if self.emplacement else None,
            "piece_nom": self.emplacement.piece.nom if (self.emplacement and self.emplacement.piece) else None,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "objets": [obj.to_dict() for obj in self.objets] if self.objets else []
        }


class Objet(Base):
    """Représente un objet stocké (ex: Ruban de masquage, Tournevis cruciforme, Masque FFP2)."""
    __tablename__ = "objets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    contenant_id = Column(Integer, ForeignKey("contenants.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(160), nullable=False, index=True)
    description = Column(Text, nullable=True)
    quantite = Column(Integer, default=1, nullable=False)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    date_modification = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    contenant = relationship("Contenant", back_populates="objets")

    def to_dict(self):
        contenant_nom = self.contenant.nom if self.contenant else None
        emplacement_nom = self.contenant.emplacement.nom if (self.contenant and self.contenant.emplacement) else None
        piece_nom = (
            self.contenant.emplacement.piece.nom
            if (self.contenant and self.contenant.emplacement and self.contenant.emplacement.piece)
            else None
        )
        return {
            "id": self.id,
            "contenant_id": self.contenant_id,
            "nom": self.nom,
            "description": self.description or "",
            "quantite": self.quantite,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "date_modification": self.date_modification.isoformat() if self.date_modification else None,
            "contenant_nom": contenant_nom,
            "emplacement_nom": emplacement_nom,
            "piece_nom": piece_nom,
            "chemin_complet": f"{piece_nom or '?'} > {emplacement_nom or '?'} > {contenant_nom or '?'}"
        }


class Configuration(Base):
    """Table clé/valeur pour les paramètres système."""
    __tablename__ = "configurations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cle = Column(String(80), unique=True, nullable=False, index=True)
    valeur = Column(Text, nullable=False)

    def to_dict(self):
        return {
            "cle": self.cle,
            "valeur": self.valeur
        }
`,
  },
  'ollama_service.py': {
    filename: 'ollama_service.py',
    role: 'Client Ollama avec structured outputs JSON et parseur heuristique de secours',
    language: 'python',
    content: `import json
import re
import requests
from typing import Dict, Any, List


EXTRACTION_SYSTEM_PROMPT = """Tu es un assistant IA spécialisé dans la gestion d'inventaire domotique.
Ton rôle est d'analyser une phrase prononcée ou écrite par l'utilisateur en français et d'extraire la structure exacte au format JSON.

Deux actions sont possibles :
1. "add" : L'utilisateur décrit le stockage d'un ou plusieurs objets dans un lieu hiérarchique :
   - "room" : La pièce principale (ex: Garage, Cuisine, Cave, Atelier, Bureau, Salon, Chambre).
   - "location" : L'emplacement précis dans la pièce (ex: Étagère à côté de l'entrée, Îlot central, Placard sous l'évier, Établi).
   - "container" : Le contenant précis (ex: Caisse en carton Action 02, Tiroir du milieu, Bac plastique bleu, Boîte à outils). Si aucun contenant n'est précisé, mets "Bac général" ou le nom du meuble.
   - "items" : La liste des objets distincts (ex: ["ruban de masquage", "rouleau à peinture", "masque FFP2"]).
   Format attendu :
   {
     "action": "add",
     "room": "Garage",
     "location": "Étagère à côté de l'entrée",
     "container": "Caisse en carton Action 02",
     "items": ["ruban de masquage", "rouleau à peinture", "masque FFP2"]
   }

2. "search" : L'utilisateur cherche un ou plusieurs objets (ex: "Je cherche une paire de ciseaux et du ruban", "Où se trouve le multimètre ?").
   Format attendu :
   {
     "action": "search",
     "items": ["paire de ciseaux", "ruban de masquage"]
   }

RÈGLES IMPORTANTES :
- Réponds UNIQUEMENT un objet JSON valide, sans texte d'introduction ni de conclusion, sans balises markdown json.
- Normalise les majuscules pour les noms de lieux et contenants (ex: "Garage", "Étagère entrée").
- Nettoie les articles inutiles dans les objets si pertinent mais garde les précisions utiles.
"""


def test_ollama_connection(ollama_url: str) -> Dict[str, Any]:
    """Teste la connexion vers l'API Ollama et récupère la liste des modèles disponibles."""
    url = ollama_url.rstrip("/") + "/api/tags"
    try:
        response = requests.get(url, timeout=4)
        if response.status_code == 200:
            data = response.json()
            models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
            return {
                "success": True,
                "message": f"Connecté à Ollama. {len(models)} modèle(s) détecté(s).",
                "models": models
            }
        return {
            "success": False,
            "message": f"Ollama a répondu avec le statut {response.status_code}.",
            "models": []
        }
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "message": f"Impossible de joindre Ollama ({url}) : {str(e)}",
            "models": []
        }


def list_ollama_models(ollama_url: str) -> List[str]:
    """Récupère uniquement la liste des noms de modèles."""
    res = test_ollama_connection(ollama_url)
    return res.get("models", [])


def fallback_rule_based_extraction(text: str) -> Dict[str, Any]:
    """
    Analyseur de secours par expressions régulières pour le français.
    Garantit le fonctionnement même en cas de latence ou d'indisponibilité d'Ollama.
    """
    clean_text = text.strip()
    lower_text = clean_text.lower()

    # Détection de recherche
    search_keywords = ["cherche", "où est", "où sont", "où se trouve", "trouver", "ou est", "ou sont", "retrouver"]
    is_search = any(k in lower_text for k in search_keywords)

    if is_search:
        sub_text = re.sub(r"^(je\\s+cherche|où\\s+se\\s+trouve|où\\s+est|où\\s+sont|ou\\s+se\\s+trouve|ou\\s+est|ou\\s+sont|peux-tu\\s+trouver|trouve)\\s+", "", lower_text)
        sub_text = re.sub(r"[?!.]", "", sub_text)
        parts = re.split(r",|\\bet\\b|\\bou\\b", sub_text)
        items = [p.strip() for p in parts if len(p.strip()) > 1]
        if not items:
            items = [clean_text]
        return {
            "action": "search",
            "items": items,
            "_source": "fallback_parser"
        }

    # Détection d'ajout : Pièce, Emplacement, Contenant, Objets
    room = "Maison"
    location = "Zone principale"
    container = "Bac général"

    room_match = re.search(r"(?:dans\\s+(?:le|la|l'|les)|à\\s+l')\\s*([a-zA-ZÀ-ÿ0-9\\s'-]+?)(?:,|\\s+devant|\\s+sur|\\s+dans|\\s+j'ai|$)", text, re.IGNORECASE)
    if room_match:
        room_candidate = room_match.group(1).strip()
        if len(room_candidate.split()) <= 4:
            room = room_candidate.capitalize()

    loc_match = re.search(r"(?:devant|sur|près\\s+de|sous|dans\\s+l'armoire)\\s+(?:le|la|l'|les)?\\s*([a-zA-ZÀ-ÿ0-9\\s'-]+?)(?:,|\\s+dans|\\s+j'ai|$)", text, re.IGNORECASE)
    if loc_match:
        loc_candidate = loc_match.group(1).strip()
        if len(loc_candidate.split()) <= 6:
            location = loc_candidate.capitalize()

    cont_match = re.search(r"(?:dans\\s+(?:la|le|l'|les|ce|cette)\\s+)?(caisse|boîte|boite|tiroir|bac|carton|sac|valise|mallette|bocal)\\s+([a-zA-ZÀ-ÿ0-9\\s'-]+?)(?:j'ai|il\\s+y\\s+a|,|$)", text, re.IGNORECASE)
    if cont_match:
        container = f"{cont_match.group(1)} {cont_match.group(2)}".strip().capitalize()
    else:
        alt_cont = re.search(r"dans\\s+(?:le|la|l'|les)?\\s*([a-zA-ZÀ-ÿ0-9\\s'-]+?)\\s+(?:j'ai|il\\s+y\\s+a)", text, re.IGNORECASE)
        if alt_cont:
            container = alt_cont.group(1).strip().capitalize()

    items = []
    items_match = re.search(r"(?:j'ai|il\\s+y\\s+a|ajouter|range|stocke|mets)\\s+([a-zA-ZÀ-ÿ0-9\\s,'-]+)", text, re.IGNORECASE)
    if items_match:
        raw_items = items_match.group(1).strip()
        raw_items = re.sub(r"[?!.]", "", raw_items)
        parts = re.split(r",|\\bet\\b|\\bou\\b", raw_items)
        for part in parts:
            item_clean = re.sub(r"^(?:du|de\\s+la|des|un|une|le|la|les|d')\\s+", "", part.strip(), flags=re.IGNORECASE).strip()
            if item_clean:
                items.append(item_clean)

    if not items:
        items = [clean_text]

    return {
        "action": "add",
        "room": room,
        "location": location,
        "container": container,
        "items": items,
        "_source": "fallback_parser"
    }


def analyze_user_prompt(text: str, ollama_url: str = "http://ollama:11434", model: str = "gemma3:4b") -> Dict[str, Any]:
    """Envoie le texte à l'API Ollama avec le prompt système et contrainte JSON."""
    if not text or not text.strip():
        return {"action": "unknown", "items": [], "error": "Texte vide"}

    endpoint = ollama_url.rstrip("/") + "/api/generate"
    payload = {
        "model": model or "gemma3:4b",
        "system": EXTRACTION_SYSTEM_PROMPT,
        "prompt": text.strip(),
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "num_predict": 400
        }
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=12)
        if response.status_code == 200:
            result = response.json()
            raw_response = result.get("response", "").strip()

            cleaned_json = re.sub(r"^\\x60{3}(?:json)?\\s*", "", raw_response)
            cleaned_json = re.sub(r"\\s*\\x60{3}$", "", cleaned_json).strip()

            parsed = json.loads(cleaned_json)
            if isinstance(parsed, dict) and "action" in parsed:
                parsed["_source"] = f"ollama ({model})"
                return parsed
    except Exception as e:
        print(f"[Ollama Service] Appel Ollama échoué ({e}). Utilisation du parseur heuristique.")

    return fallback_rule_based_extraction(text)
`,
  },
  'speech_service.py': {
    filename: 'speech_service.py',
    role: 'Clients d\'intégration pour Faster-Whisper (ASR) et Piper-TTS (synthèse vocale)',
    language: 'python',
    content: `import io
import requests
from typing import Dict, Any, Optional


def test_whisper_connection(whisper_url: str) -> Dict[str, Any]:
    """Teste la connexion avec le serveur Faster-Whisper."""
    base = whisper_url.rstrip("/")
    endpoints_to_try = [f"{base}/health", f"{base}/docs", f"{base}/openapi.json", f"{base}/v1/models"]
    for url in endpoints_to_try:
        try:
            r = requests.get(url, timeout=3)
            if r.status_code in (200, 404, 405):
                return {
                    "success": True,
                    "message": f"Serveur Whisper actif à l'adresse {whisper_url}."
                }
        except Exception:
            continue

    return {
        "success": False,
        "message": f"Impossible de joindre le serveur Faster-Whisper à {whisper_url}."
    }


def test_piper_connection(piper_url: str) -> Dict[str, Any]:
    """Teste la connexion avec le serveur Piper-TTS."""
    base = piper_url.rstrip("/")
    endpoints_to_try = [f"{base}/health", f"{base}/voices", f"{base}/"]
    for url in endpoints_to_try:
        try:
            r = requests.get(url, timeout=3)
            if r.status_code in (200, 400, 404, 405):
                return {
                    "success": True,
                    "message": f"Serveur Piper-TTS actif à l'adresse {piper_url}."
                }
        except Exception:
            continue

    return {
        "success": False,
        "message": f"Impossible de joindre le serveur Piper-TTS à {piper_url}."
    }


def transcribe_audio(audio_bytes: bytes, filename: str = "recording.webm", whisper_url: str = "http://faster-whisper:9000") -> str:
    """Envoie le flux audio à l'API Faster-Whisper et retourne le texte transcrit."""
    base = whisper_url.rstrip("/")
    
    url_v1 = f"{base}/v1/audio/transcriptions"
    files = {"file": (filename, io.BytesIO(audio_bytes), "audio/webm")}
    data = {"model": "whisper-1", "language": "fr", "response_format": "json"}

    try:
        res = requests.post(url_v1, files=files, data=data, timeout=20)
        if res.status_code == 200:
            parsed = res.json()
            return parsed.get("text", "").strip()
    except Exception as e:
        print(f"[Whisper Service] Echec sur /v1/audio/transcriptions : {e}")

    url_asr = f"{base}/asr?task=transcribe&language=fr&output=json"
    files = {"audio_file": (filename, io.BytesIO(audio_bytes), "audio/webm")}
    try:
        res = requests.post(url_asr, files=files, timeout=20)
        if res.status_code == 200:
            try:
                data = res.json()
                return data.get("text", "").strip()
            except Exception:
                return res.text.strip()
    except Exception as e:
        print(f"[Whisper Service] Echec sur /asr : {e}")

    return ""


def list_piper_voices(piper_url: str = "http://piper:5000") -> list:
    """Récupère la liste des voix Piper disponibles auprès du serveur."""
    default_french_voices = [
        {"id": "fr_FR-siwis-medium", "name": "Siwis (Femme, Studio Medium)", "lang": "fr_FR"},
        {"id": "fr_FR-upmc-medium", "name": "UPMC (Homme, Clair & Posé)", "lang": "fr_FR"},
        {"id": "fr_FR-siwis-low", "name": "Siwis (Femme, Rapide & Léger)", "lang": "fr_FR"},
        {"id": "fr_FR-gilles-low", "name": "Gilles (Homme, Standard)", "lang": "fr_FR"},
        {"id": "fr_FR-mls-medium", "name": "MLS (Homme, Studio Medium)", "lang": "fr_FR"},
    ]
    if not piper_url:
        return default_french_voices

    base = piper_url.strip().rstrip("/")
    for path in ["/voices", "/api/voices"]:
        try:
            r = requests.get(f"{base}{path}", timeout=3)
            if r.status_code == 200:
                data = r.json()
                voices = []
                if isinstance(data, dict):
                    for k, v in data.items():
                        name = v.get("name", k) if isinstance(v, dict) else str(k)
                        voices.append({"id": k, "name": name, "lang": "fr"})
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            voices.append({
                                "id": item.get("key") or item.get("id") or item.get("name"),
                                "name": item.get("name") or item.get("id"),
                                "lang": "fr"
                            })
                if voices:
                    return voices
        except Exception:
            pass

    return default_french_voices


def synthesize_speech(text: str, piper_url: str = "http://piper:5000", voice: Optional[str] = None) -> Optional[bytes]:
    """Envoie le texte à Piper-TTS et renvoie le flux audio WAV brut."""
    if not text or not text.strip():
        return None

    base = piper_url.rstrip("/")
    payload: Dict[str, Any] = {"text": text.strip()}
    if voice:
        payload["voice"] = voice

    for path in ["/tts", "/api/tts", "/"]:
        try:
            res = requests.post(
                f"{base}{path}",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            if res.status_code == 200 and len(res.content) > 100:
                return res.content
        except Exception:
            pass

    try:
        params = {"text": text.strip()}
        if voice:
            params["voice"] = voice
        res = requests.get(f"{base}/", params=params, timeout=15)
        if res.status_code == 200 and len(res.content) > 100:
            return res.content
    except Exception:
        pass

    return None
`,
  },
  'main.py': {
    filename: 'main.py',
    role: 'API REST FastAPI complète (ingestion vocale, CRUD, import/export, templates)',
    language: 'python',
    content: `import csv
import io
import json
import base64
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

import database
from database import get_db, init_db
import models
from models import Piece, Emplacement, Contenant, Objet, Configuration
import ollama_service
import speech_service

APP_VERSION = "1.3.0"

app = FastAPI(
    title="Domotix - Inventaire Domotique Vocal",
    description="Application locale d'inventaire intelligent sous ZimaOS via Docker",
    version=APP_VERSION
)

# Configuration CORS pour réseau local ZimaOS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory="templates")


@app.on_event("startup")
def on_startup():
    init_db()


class TextProcessRequest(BaseModel):
    text: str

class ConfirmAddRequest(BaseModel):
    room: str
    location: str
    container: str
    items: List[str]

class SettingsUpdateRequest(BaseModel):
    ollama_url: Optional[str] = None
    whisper_url: Optional[str] = None
    piper_url: Optional[str] = None
    ollama_model: Optional[str] = None
    piper_voice: Optional[str] = None
    require_validation: Optional[bool] = None

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None

class PieceCreate(BaseModel):
    nom: str

class EmplacementCreate(BaseModel):
    piece_id: int
    nom: str

class ContenantCreate(BaseModel):
    emplacement_id: int
    nom: str

class ContenantUpdate(BaseModel):
    nom: Optional[str] = None
    emplacement_id: Optional[int] = None

class ObjetCreate(BaseModel):
    contenant_id: int
    nom: str
    description: Optional[str] = ""
    quantite: Optional[int] = 1

class ObjetUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    quantite: Optional[int] = None
    contenant_id: Optional[int] = None


def get_setting_value(db: Session, key: str, default: str = "") -> str:
    cfg = db.query(Configuration).filter(Configuration.cle == key).first()
    return cfg.valeur if cfg else default

def set_setting_value(db: Session, key: str, value: str):
    cfg = db.query(Configuration).filter(Configuration.cle == key).first()
    if cfg:
        cfg.valeur = value
    else:
        db.add(Configuration(cle=key, valeur=value))
    db.commit()

def save_extracted_inventory(db: Session, room_name: str, location_name: str, container_name: str, items: List[str]):
    room_name = room_name.strip() or "Maison"
    location_name = location_name.strip() or "Zone générale"
    container_name = container_name.strip() or "Bac général"

    piece = db.query(Piece).filter(func.lower(Piece.nom) == func.lower(room_name)).first()
    if not piece:
        piece = Piece(nom=room_name)
        db.add(piece)
        db.flush()

    emplacement = db.query(Emplacement).filter(
        Emplacement.piece_id == piece.id,
        func.lower(Emplacement.nom) == func.lower(location_name)
    ).first()
    if not emplacement:
        emplacement = Emplacement(piece_id=piece.id, nom=location_name)
        db.add(emplacement)
        db.flush()

    contenant = db.query(Contenant).filter(
        Contenant.emplacement_id == emplacement.id,
        func.lower(Contenant.nom) == func.lower(container_name)
    ).first()
    if not contenant:
        contenant = Contenant(emplacement_id=emplacement.id, nom=container_name)
        db.add(contenant)
        db.flush()

    created_items = []
    for item_name in items:
        item_name = item_name.strip()
        if not item_name:
            continue
        existing_item = db.query(Objet).filter(
            Objet.contenant_id == contenant.id,
            func.lower(Objet.nom) == func.lower(item_name)
        ).first()

        if existing_item:
            existing_item.quantite += 1
            existing_item.date_modification = datetime.utcnow()
            created_items.append(existing_item.to_dict())
        else:
            new_item = Objet(contenant_id=contenant.id, nom=item_name, quantite=1)
            db.add(new_item)
            db.flush()
            created_items.append(new_item.to_dict())

    db.commit()
    return {
        "piece": piece.to_dict(),
        "emplacement": emplacement.to_dict(),
        "contenant": contenant.to_dict(),
        "items": created_items
    }

def perform_search(db: Session, searched_items: List[str]):
    results = []
    response_phrases = []

    for term in searched_items:
        clean_term = term.strip()
        if not clean_term:
            continue
        
        matches = db.query(Objet).filter(
            func.lower(Objet.nom).like(f"%{clean_term.lower()}%")
        ).all()

        if matches:
            locs = []
            for obj in matches:
                path = obj.to_dict()["chemin_complet"]
                results.append(obj.to_dict())
                locs.append(f"{obj.nom} (qté: {obj.quantite}) dans {path}")
            response_phrases.append(f"Pour '{clean_term}' : " + " ; ".join(locs) + ".")
        else:
            response_phrases.append(f"Je n'ai pas trouvé '{clean_term}' dans l'inventaire.")

    spoken_message = " ".join(response_phrases) if response_phrases else "Aucun objet trouvé."
    return results, spoken_message


@app.get("/", response_class=HTMLResponse)
def get_index_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Domotix Inventory", "time": datetime.utcnow().isoformat()}


@app.post("/api/voice/process")
async def process_voice(
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    whisper_url = get_setting_value(db, "whisper_url", "http://faster-whisper:9000")
    ollama_url = get_setting_value(db, "ollama_url", "http://ollama:11434")
    piper_url = get_setting_value(db, "piper_url", "http://piper:5000")
    ollama_model = get_setting_value(db, "ollama_model", "gemma3:4b")
    require_validation = get_setting_value(db, "require_validation", "true").lower() == "true"

    audio_bytes = await audio_file.read()
    transcription = speech_service.transcribe_audio(audio_bytes, audio_file.filename or "voice.webm", whisper_url)

    if not transcription:
        return {
            "success": False,
            "message": "La transcription vocale n'a pas pu aboutir ou le fichier audio est inaudible.",
            "transcription": ""
        }

    analysis = ollama_service.analyze_user_prompt(transcription, ollama_url, ollama_model)
    action = analysis.get("action", "unknown")

    if action == "add":
        if require_validation:
            return {
                "success": True,
                "status": "pending_validation",
                "transcription": transcription,
                "analysis": analysis,
                "message": "Extraction réussie. Veuillez valider les éléments détectés."
            }
        else:
            saved = save_extracted_inventory(
                db,
                analysis.get("room", "Maison"),
                analysis.get("location", "Zone générale"),
                analysis.get("container", "Bac général"),
                analysis.get("items", [])
            )
            return {
                "success": True,
                "status": "saved_directly",
                "transcription": transcription,
                "analysis": analysis,
                "saved": saved,
                "message": f"{len(analysis.get('items', []))} objet(s) enregistré(s) avec succès !"
            }

    elif action == "search":
        items_to_search = analysis.get("items", [])
        results, spoken_message = perform_search(db, items_to_search)

        audio_wav = speech_service.synthesize_speech(spoken_message, piper_url)
        audio_b64 = base64.b64encode(audio_wav).decode("utf-8") if audio_wav else None

        return {
            "success": True,
            "status": "search_result",
            "transcription": transcription,
            "analysis": analysis,
            "results": results,
            "spoken_message": spoken_message,
            "audio_base64": audio_b64
        }

    return {"success": False, "transcription": transcription, "analysis": analysis, "message": "Action non reconnue."}


@app.post("/api/text/process")
def process_text(payload: TextProcessRequest, db: Session = Depends(get_db)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texte vide")

    ollama_url = get_setting_value(db, "ollama_url", "http://ollama:11434")
    piper_url = get_setting_value(db, "piper_url", "http://piper:5000")
    ollama_model = get_setting_value(db, "ollama_model", "gemma3:4b")
    require_validation = get_setting_value(db, "require_validation", "true").lower() == "true"

    analysis = ollama_service.analyze_user_prompt(text, ollama_url, ollama_model)
    action = analysis.get("action", "unknown")

    if action == "add":
        if require_validation:
            return {
                "success": True,
                "status": "pending_validation",
                "transcription": text,
                "analysis": analysis,
                "message": "Veuillez valider la détection avant enregistrement."
            }
        else:
            saved = save_extracted_inventory(
                db,
                analysis.get("room", "Maison"),
                analysis.get("location", "Zone générale"),
                analysis.get("container", "Bac général"),
                analysis.get("items", [])
            )
            return {
                "success": True,
                "status": "saved_directly",
                "transcription": text,
                "analysis": analysis,
                "saved": saved,
                "message": "Objets enregistrés directement."
            }

    elif action == "search":
        items_to_search = analysis.get("items", [])
        results, spoken_message = perform_search(db, items_to_search)

        audio_wav = speech_service.synthesize_speech(spoken_message, piper_url)
        audio_b64 = base64.b64encode(audio_wav).decode("utf-8") if audio_wav else None

        return {
            "success": True,
            "status": "search_result",
            "transcription": text,
            "analysis": analysis,
            "results": results,
            "spoken_message": spoken_message,
            "audio_base64": audio_b64
        }

    return {"success": False, "transcription": text, "analysis": analysis, "message": "Impossible d'interpréter l'action."}


@app.post("/api/inventory/confirm-add")
def confirm_add_inventory(payload: ConfirmAddRequest, db: Session = Depends(get_db)):
    saved = save_extracted_inventory(db, payload.room, payload.location, payload.container, payload.items)
    return {"success": True, "message": f"{len(payload.items)} objet(s) ajouté(s) !", "data": saved}


@app.get("/api/inventory/tree")
def get_inventory_tree(db: Session = Depends(get_db)):
    pieces = db.query(Piece).order_by(Piece.nom).all()
    return [p.to_dict() for p in pieces]


@app.get("/api/version")
def get_version():
    return {
        "version": APP_VERSION,
        "app": "Domotix",
        "status": "ready"
    }

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    configs = db.query(Configuration).all()
    res = {c.cle: c.valeur for c in configs}
    return {
        "version": APP_VERSION,
        "ollama_url": res.get("ollama_url", "http://ollama:11434"),
        "whisper_url": res.get("whisper_url", "http://faster-whisper:9000"),
        "piper_url": res.get("piper_url", "http://piper:5000"),
        "ollama_model": res.get("ollama_model", "gemma3:4b"),
        "piper_voice": res.get("piper_voice", "fr_FR-siwis-medium"),
        "require_validation": res.get("require_validation", "true").lower() == "true",
        "docker_env": {
            "ollama_url": database.os.getenv("OLLAMA_URL", "http://ollama:11434"),
            "whisper_url": database.os.getenv("WHISPER_URL", "http://faster-whisper:9000"),
            "piper_url": database.os.getenv("PIPER_URL", "http://piper:5000"),
            "ollama_model": database.os.getenv("DEFAULT_OLLAMA_MODEL", "gemma3:4b"),
            "piper_voice": database.os.getenv("DEFAULT_PIPER_VOICE", "fr_FR-siwis-medium"),
        },
        "priority_info": {
            "active_priority": "Base SQLite (interface)",
            "initial_priority": "Variables docker-compose.yml"
        }
    }


@app.post("/api/settings")
def update_settings(payload: SettingsUpdateRequest, db: Session = Depends(get_db)):
    if payload.ollama_url is not None:
        set_setting_value(db, "ollama_url", payload.ollama_url.strip())
    if payload.whisper_url is not None:
        set_setting_value(db, "whisper_url", payload.whisper_url.strip())
    if payload.piper_url is not None:
        set_setting_value(db, "piper_url", payload.piper_url.strip())
    if payload.ollama_model is not None:
        set_setting_value(db, "ollama_model", payload.ollama_model.strip())
    if payload.piper_voice is not None:
        set_setting_value(db, "piper_voice", payload.piper_voice.strip())
    if payload.require_validation is not None:
        set_setting_value(db, "require_validation", "true" if payload.require_validation else "false")
    return {"success": True, "message": "Paramètres sauvegardés"}


@app.post("/api/settings/sync-docker")
def sync_docker_settings(db: Session = Depends(get_db)):
    env_ollama = database.os.getenv("OLLAMA_URL", "http://ollama:11434")
    env_whisper = database.os.getenv("WHISPER_URL", "http://faster-whisper:9000")
    env_piper = database.os.getenv("PIPER_URL", "http://piper:5000")
    env_model = database.os.getenv("DEFAULT_OLLAMA_MODEL", "gemma3:4b")
    env_voice = database.os.getenv("DEFAULT_PIPER_VOICE", "fr_FR-siwis-medium")

    set_setting_value(db, "ollama_url", env_ollama)
    set_setting_value(db, "whisper_url", env_whisper)
    set_setting_value(db, "piper_url", env_piper)
    set_setting_value(db, "ollama_model", env_model)
    set_setting_value(db, "piper_voice", env_voice)

    return {"success": True, "message": "Synchronisation réussie avec docker-compose.yml !"}


@app.get("/api/piper/voices")
def get_piper_voices(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "piper_url", "http://piper:5000")
    voices_list = speech_service.list_piper_voices(target_url)
    return {"voices": voices_list, "success": len(voices_list) > 0, "url": target_url}

`,
  },
  'templates/index.html': {
    filename: 'templates/index.html',
    role: 'Interface SPA responsive HTML5 / TailwindCSS / Lucide Icons',
    language: 'html',
    content: templateHtml,
  },
  'start.sh': {
    filename: 'start.sh',
    role: 'Script de démarrage universel tout-en-un avec détection de port libre (8585+)',
    language: 'bash',
    content: `#!/bin/bash
# ==============================================================================
# Script de démarrage universel Domotix pour ZimaOS
# ==============================================================================
set -e

echo "🚀 [Domotix] Préparation du dossier de persistance..."
mkdir -p data

DOCKER_CMD="docker"
if ! docker info &> /dev/null; then
    if command -v sudo &> /dev/null && sudo docker info &> /dev/null; then
        DOCKER_CMD="sudo docker"
    fi
fi

is_port_in_use() {
    local port=$1
    if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
        return 0
    fi
    if command -v ss &>/dev/null && ss -tuln 2>/dev/null | grep -q ":$port "; then
        return 0
    fi
    if command -v netstat &>/dev/null && netstat -tuln 2>/dev/null | grep -q ":$port "; then
        return 0
    fi
    return 1
}

find_free_port() {
    local p="\${PORT:-8585}"
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
echo "🔌 Port d'écoute libre sélectionné : \${APP_PORT}"

$DOCKER_CMD rm -f domotix-inventory 2>/dev/null || true

if $DOCKER_CMD compose version &> /dev/null; then
    echo "✅ Docker Compose V2 détecté. Lancement..."
    PORT=\${APP_PORT} $DOCKER_CMD compose up -d --build
elif command -v docker-compose &> /dev/null; then
    echo "✅ docker-compose standalone détecté. Lancement..."
    if ! docker-compose version &> /dev/null && command -v sudo &> /dev/null; then
        PORT=\${APP_PORT} sudo docker-compose up -d --build
    else
        PORT=\${APP_PORT} docker-compose up -d --build
    fi
else
    echo "⚠️ Docker Compose n'est pas présent sur ce système."
    echo "📦 Lancement direct via Docker natif sur le port \${APP_PORT}..."
    $DOCKER_CMD build -t domotix .
    $DOCKER_CMD run -d \\
      --name domotix-inventory \\
      --restart unless-stopped \\
      -p "\${APP_PORT}:8000" \\
      -v "$(pwd)/data:/data" \\
      -e DATABASE_URL="sqlite:////data/inventory.db" \\
      -e OLLAMA_URL="http://ollama:11434" \\
      -e WHISPER_URL="http://faster-whisper:9000" \\
      -e PIPER_URL="http://piper:5000" \\
      domotix
fi

IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "=========================================================="
echo "🎉 Domotix est opérationnel !"
echo "👉 Accédez à l'interface web : http://\${IP_ADDR:-localhost}:\${APP_PORT}"
echo "=========================================================="
`,
  },
  '.dockerignore': {
    filename: '.dockerignore',
    role: 'Exclusion des fichiers inutiles pour un build Docker ultra-rapide et léger',
    language: 'dockerfile',
    content: `.git
.github
.gitignore
.aistudio
.env
node_modules
dist
__pycache__
*.pyc
data/
*.db
domotix_zimaos.zip
`,
  },
  'update.sh': {
    filename: 'update.sh',
    role: 'Script de mise à jour 1-clic depuis GitHub (pull image GHCR ou Git et redémarrage)',
    language: 'bash',
    content: `#!/bin/bash
set -e
echo "🚀 [Domotix] Recherche et application des mises à jour..."
if [ -d ".git" ]; then
    git pull origin main || true
fi
DOCKER_CMD="docker"
if ! docker info &> /dev/null; then
    if command -v sudo &> /dev/null && sudo docker info &> /dev/null; then
        DOCKER_CMD="sudo docker"
    fi
fi
if $DOCKER_CMD compose version &> /dev/null; then
    $DOCKER_CMD compose pull || true
    $DOCKER_CMD compose up -d --build
elif command -v docker-compose &> /dev/null; then
    docker-compose pull || true
    docker-compose up -d --build
else
    $DOCKER_CMD build -t domotix .
    $DOCKER_CMD restart domotix-inventory || true
fi
echo "🎉 Mise à jour terminée avec succès !"
`,
  },
  '.github/workflows/docker-publish.yml': {
    filename: '.github/workflows/docker-publish.yml',
    role: 'Workflow GitHub Actions : build automatique multi-arch et publication sur GitHub Packages (GHCR)',
    language: 'yaml',
    content: `name: Build and Publish Docker Image to GHCR

on:
  push:
    branches: [ "main", "master" ]
    tags: [ 'v*.*.*' ]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Sanitize image repository name
        id: prep
        run: |
          RAW_NAME="\${{ github.repository }}"
          CLEAN_NAME=$(echo "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[-._]+$//')
          if [ -z "$CLEAN_NAME" ]; then
            CLEAN_NAME="\${{ github.repository_owner }}/domotix-inventory"
          fi
          echo "IMAGE_NAME=\${CLEAN_NAME}" >> $GITHUB_ENV
          echo "image_name=\${CLEAN_NAME}" >> $GITHUB_OUTPUT

      - name: Set up QEMU (multi-arch support)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
`,
  },
};
