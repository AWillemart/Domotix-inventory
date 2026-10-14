import csv
import io
import json
import base64
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
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


# =============================================================================
# Modèles Pydantic pour requêtes API
# =============================================================================

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


# =============================================================================
# Utilitaires BDD
# =============================================================================

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
    """Création automatique ou récupération de la hiérarchie et ajout des objets."""
    room_name = room_name.strip() or "Maison"
    location_name = location_name.strip() or "Zone générale"
    container_name = container_name.strip() or "Bac général"

    # 1. Pièce
    piece = db.query(Piece).filter(func.lower(Piece.nom) == func.lower(room_name)).first()
    if not piece:
        piece = Piece(nom=room_name)
        db.add(piece)
        db.flush()

    # 2. Emplacement
    emplacement = db.query(Emplacement).filter(
        Emplacement.piece_id == piece.id,
        func.lower(Emplacement.nom) == func.lower(location_name)
    ).first()
    if not emplacement:
        emplacement = Emplacement(piece_id=piece.id, nom=location_name)
        db.add(emplacement)
        db.flush()

    # 3. Contenant
    contenant = db.query(Contenant).filter(
        Contenant.emplacement_id == emplacement.id,
        func.lower(Contenant.nom) == func.lower(container_name)
    ).first()
    if not contenant:
        contenant = Contenant(emplacement_id=emplacement.id, nom=container_name)
        db.add(contenant)
        db.flush()

    # 4. Objets
    created_items = []
    for item_name in items:
        item_name = item_name.strip()
        if not item_name:
            continue
        # Vérifier si l'objet existe déjà dans ce contenant pour incrémenter ou créer
        existing_item = db.query(Objet).filter(
            Objet.contenant_id == contenant.id,
            func.lower(Objet.nom) == func.lower(item_name)
        ).first()

        if existing_item:
            existing_item.quantite += 1
            existing_item.date_modification = datetime.utcnow()
            created_items.append(existing_item.to_dict())
        else:
            new_item = Objet(
                contenant_id=contenant.id,
                nom=item_name,
                quantite=1
            )
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
    """Recherche insensible à la casse et partielle dans la base de données."""
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


# =============================================================================
# Routes Page Web & Santé
# =============================================================================

@app.get("/", response_class=HTMLResponse)
def get_index_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Domotix Inventory", "time": datetime.utcnow().isoformat()}


# =============================================================================
# Traitement Vocal & Textuel Intelligent
# =============================================================================

@app.post("/api/voice/process")
async def process_voice(
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    1. Reçoit l'audio du microphone
    2. Transcrit via Faster-Whisper
    3. Analyse l'intention via Ollama
    4. Effectue la recherche ou prépare l'ajout (avec validation selon config)
    5. Synthétise la voix via Piper-TTS si recherche
    """
    whisper_url = get_setting_value(db, "whisper_url", "http://faster-whisper:9000")
    ollama_url = get_setting_value(db, "ollama_url", "http://ollama:11434")
    piper_url = get_setting_value(db, "piper_url", "http://piper:5000")
    piper_voice = get_setting_value(db, "piper_voice", "fr_FR-siwis-medium")
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

    # Analyse d'intention par Ollama
    analysis = ollama_service.analyze_user_prompt(transcription, ollama_url, ollama_model)
    action = analysis.get("action", "unknown")

    if action == "add":
        if require_validation:
            return {
                "success": True,
                "status": "pending_validation",
                "transcription": transcription,
                "analysis": analysis,
                "message": "Extraction réussie. Veuillez valider les éléments détectés avant enregistrement."
            }
        else:
            # Enregistrement direct
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

        # Générer l'audio avec Piper-TTS
        audio_wav = speech_service.synthesize_speech(spoken_message, piper_url, voice=piper_voice)
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

    return {
        "success": False,
        "transcription": transcription,
        "analysis": analysis,
        "message": "Action non reconnue."
    }


@app.post("/api/text/process")
def process_text(
    payload: TextProcessRequest,
    db: Session = Depends(get_db)
):
    """Analyse un texte saisi au clavier (ajout ou recherche) avec Ollama."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texte vide")

    ollama_url = get_setting_value(db, "ollama_url", "http://ollama:11434")
    piper_url = get_setting_value(db, "piper_url", "http://piper:5000")
    piper_voice = get_setting_value(db, "piper_voice", "fr_FR-siwis-medium")
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

        audio_wav = speech_service.synthesize_speech(spoken_message, piper_url, voice=piper_voice)
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

    return {
        "success": False,
        "transcription": text,
        "analysis": analysis,
        "message": "Impossible d'interpréter l'action."
    }


@app.post("/api/inventory/confirm-add")
def confirm_add_inventory(
    payload: ConfirmAddRequest,
    db: Session = Depends(get_db)
):
    """Enregistre les données validées ou modifiées par l'utilisateur."""
    saved = save_extracted_inventory(
        db,
        payload.room,
        payload.location,
        payload.container,
        payload.items
    )
    return {
        "success": True,
        "message": f"{len(payload.items)} objet(s) ajouté(s) à l'inventaire !",
        "data": saved
    }


# =============================================================================
# Synthèse Vocale Piper Directe
# =============================================================================

@app.post("/api/tts/speak")
def tts_speak(payload: TTSRequest, db: Session = Depends(get_db)):
    piper_url = get_setting_value(db, "piper_url", "http://piper:5000")
    voice = payload.voice or get_setting_value(db, "piper_voice", "fr_FR-siwis-medium")
    audio = speech_service.synthesize_speech(payload.text, piper_url, voice=voice)
    if audio:
        return Response(content=audio, media_type="audio/wav")
    raise HTTPException(status_code=502, detail="Piper-TTS n'a pas répondu ou indisponible")


# =============================================================================
# Explorateur & CRUD Inventaire
# =============================================================================

@app.get("/api/inventory/tree")
def get_inventory_tree(db: Session = Depends(get_db)):
    """Retourne l'arborescence complète Pièces > Emplacements > Contenants > Objets."""
    pieces = db.query(Piece).order_by(Piece.nom).all()
    return [p.to_dict() for p in pieces]

@app.get("/api/inventory/search")
def search_inventory(q: str = Query("", min_length=1), db: Session = Depends(get_db)):
    """Recherche plein-texte dans les objets, contenants, emplacements et pièces."""
    pattern = f"%{q.lower()}%"
    objets = db.query(Objet).join(Objet.contenant).join(Contenant.emplacement).join(Emplacement.piece).filter(
        (func.lower(Objet.nom).like(pattern)) |
        (func.lower(Objet.description).like(pattern)) |
        (func.lower(Contenant.nom).like(pattern)) |
        (func.lower(Emplacement.nom).like(pattern)) |
        (func.lower(Piece.nom).like(pattern))
    ).all()
    return [o.to_dict() for o in objets]

# CRUD Pièces
@app.post("/api/pieces")
def create_piece(p: PieceCreate, db: Session = Depends(get_db)):
    existing = db.query(Piece).filter(func.lower(Piece.nom) == func.lower(p.nom.strip())).first()
    if existing:
        return existing.to_dict()
    piece = Piece(nom=p.nom.strip())
    db.add(piece)
    db.commit()
    db.refresh(piece)
    return piece.to_dict()

@app.put("/api/pieces/{piece_id}")
def update_piece(piece_id: int, p: PieceCreate, db: Session = Depends(get_db)):
    piece = db.query(Piece).filter(Piece.id == piece_id).first()
    if not piece:
        raise HTTPException(status_code=404, detail="Pièce non trouvée")
    piece.nom = p.nom.strip()
    db.commit()
    return piece.to_dict()

@app.delete("/api/pieces/{piece_id}")
def delete_piece(piece_id: int, db: Session = Depends(get_db)):
    piece = db.query(Piece).filter(Piece.id == piece_id).first()
    if not piece:
        raise HTTPException(status_code=404, detail="Pièce non trouvée")
    db.delete(piece)
    db.commit()
    return {"success": True, "message": "Pièce supprimée"}

# CRUD Emplacements
@app.post("/api/emplacements")
def create_emplacement(e: EmplacementCreate, db: Session = Depends(get_db)):
    emp = Emplacement(piece_id=e.piece_id, nom=e.nom.strip())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp.to_dict()

@app.put("/api/emplacements/{emp_id}")
def update_emplacement(emp_id: int, e: EmplacementCreate, db: Session = Depends(get_db)):
    emp = db.query(Emplacement).filter(Emplacement.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Emplacement introuvable")
    emp.nom = e.nom.strip()
    emp.piece_id = e.piece_id
    db.commit()
    return emp.to_dict()

@app.delete("/api/emplacements/{emp_id}")
def delete_emplacement(emp_id: int, db: Session = Depends(get_db)):
    emp = db.query(Emplacement).filter(Emplacement.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Emplacement introuvable")
    db.delete(emp)
    db.commit()
    return {"success": True, "message": "Emplacement supprimé"}

# CRUD Contenants (avec possibilité de déplacer de contenant vers un autre emplacement)
@app.post("/api/contenants")
def create_contenant(c: ContenantCreate, db: Session = Depends(get_db)):
    cont = Contenant(emplacement_id=c.emplacement_id, nom=c.nom.strip())
    db.add(cont)
    db.commit()
    db.refresh(cont)
    return cont.to_dict()

@app.put("/api/contenants/{cont_id}")
def update_contenant(cont_id: int, c: ContenantUpdate, db: Session = Depends(get_db)):
    cont = db.query(Contenant).filter(Contenant.id == cont_id).first()
    if not cont:
        raise HTTPException(status_code=404, detail="Contenant introuvable")
    if c.nom is not None:
        cont.nom = c.nom.strip()
    if c.emplacement_id is not None:
        cont.emplacement_id = c.emplacement_id
    db.commit()
    return cont.to_dict()

@app.delete("/api/contenants/{cont_id}")
def delete_contenant(cont_id: int, db: Session = Depends(get_db)):
    cont = db.query(Contenant).filter(Contenant.id == cont_id).first()
    if not cont:
        raise HTTPException(status_code=404, detail="Contenant introuvable")
    db.delete(cont)
    db.commit()
    return {"success": True, "message": "Contenant supprimé"}

# CRUD Objets (avec modification de nom, quantité, description ou déplacement de contenant)
@app.post("/api/objets")
def create_objet(o: ObjetCreate, db: Session = Depends(get_db)):
    obj = Objet(
        contenant_id=o.contenant_id,
        nom=o.nom.strip(),
        description=o.description or "",
        quantite=o.quantite if o.quantite is not None else 1
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj.to_dict()

@app.put("/api/objets/{obj_id}")
def update_objet(obj_id: int, o: ObjetUpdate, db: Session = Depends(get_db)):
    obj = db.query(Objet).filter(Objet.id == obj_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Objet introuvable")
    if o.nom is not None:
        obj.nom = o.nom.strip()
    if o.description is not None:
        obj.description = o.description.strip()
    if o.quantite is not None:
        obj.quantite = max(0, o.quantite)
    if o.contenant_id is not None:
        obj.contenant_id = o.contenant_id
    obj.date_modification = datetime.utcnow()
    db.commit()
    return obj.to_dict()

@app.delete("/api/objets/{obj_id}")
def delete_objet(obj_id: int, db: Session = Depends(get_db)):
    obj = db.query(Objet).filter(Objet.id == obj_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Objet introuvable")
    db.delete(obj)
    db.commit()
    return {"success": True, "message": "Objet supprimé"}


# =============================================================================
# Paramètres & Diagnostics Réseau
# =============================================================================

@app.get("/api/version")
def get_version():
    return {
        "version": APP_VERSION,
        "app": "Domotix",
        "description": "Inventaire Domotique Vocal & Sémantique",
        "status": "ready",
        "time": datetime.utcnow().isoformat()
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
            "active_priority": "Base de données SQLite (Modifications dans l'interface)",
            "initial_priority": "Variables d'environnement docker-compose.yml",
            "explanation": "Les réglages modifiés dans l'interface ont la priorité active absolue (sauvegardés dans /data/inventory.db). Les variables de docker-compose.yml sont utilisées à la première installation et peuvent être restaurées d'un clic."
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
    return {"success": True, "message": "Paramètres sauvegardés avec succès !"}

@app.post("/api/settings/sync-docker")
def sync_docker_settings(db: Session = Depends(get_db)):
    """Réinitialise les paramètres en base avec les valeurs actuelles des variables d'environnement Docker."""
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

    return {
        "success": True,
        "message": "Paramètres synchronisés avec les variables d'environnement de docker-compose.yml !",
        "settings": {
            "ollama_url": env_ollama,
            "whisper_url": env_whisper,
            "piper_url": env_piper,
            "ollama_model": env_model,
            "piper_voice": env_voice,
        }
    }

@app.get("/api/test/ollama")
def test_ollama(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "ollama_url", "http://ollama:11434")
    return ollama_service.test_ollama_connection(target_url)

@app.get("/api/test/whisper")
def test_whisper(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "whisper_url", "http://faster-whisper:9000")
    return speech_service.test_whisper_connection(target_url)

@app.get("/api/test/piper")
def test_piper(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "piper_url", "http://piper:5000")
    return speech_service.test_piper_connection(target_url)

@app.get("/api/piper/voices")
def get_piper_voices(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "piper_url", "http://piper:5000")
    voices_list = speech_service.list_piper_voices(target_url)
    return {"voices": voices_list, "success": len(voices_list) > 0, "url": target_url}

@app.get("/api/ollama/models")
def get_ollama_models(url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    target_url = url.strip() if url and url.strip() else get_setting_value(db, "ollama_url", "http://ollama:11434")
    models_list = ollama_service.list_ollama_models(target_url)
    return {"models": models_list, "success": len(models_list) > 0, "url": target_url}


# =============================================================================
# Import & Export (JSON & CSV)
# =============================================================================

@app.get("/api/export/json")
def export_json(db: Session = Depends(get_db)):
    """Exporte l'arborescence complète de l'inventaire au format JSON."""
    pieces = db.query(Piece).all()
    data = {
        "export_date": datetime.utcnow().isoformat(),
        "application": "Domotix",
        "inventory": [p.to_dict() for p in pieces]
    }
    content = json.dumps(data, indent=2, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=domotix_inventaire.json"}
    )

@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db)):
    """Exporte la liste plate de tous les objets avec leur hiérarchie au format CSV."""
    objets = db.query(Objet).all()
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["ID", "Piece", "Emplacement", "Contenant", "Objet", "Quantite", "Description", "Date Modification"])

    for obj in objets:
        d = obj.to_dict()
        writer.writerow([
            d["id"],
            d["piece_nom"] or "",
            d["emplacement_nom"] or "",
            d["contenant_nom"] or "",
            d["nom"],
            d["quantite"],
            d["description"],
            d["date_modification"] or ""
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=domotix_inventaire.csv"}
    )

@app.post("/api/import/json")
async def import_json(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Restaure ou injecte des données à partir d'un fichier JSON."""
    content = await file.read()
    try:
        data = json.loads(content.decode("utf-8"))
        inventory = data.get("inventory", data)
        if not isinstance(inventory, list):
            raise HTTPException(status_code=400, detail="Format JSON invalide : 'inventory' doit être une liste.")

        count = 0
        for p_data in inventory:
            piece_nom = p_data.get("nom", "").strip()
            if not piece_nom:
                continue
            piece = db.query(Piece).filter(func.lower(Piece.nom) == func.lower(piece_nom)).first()
            if not piece:
                piece = Piece(nom=piece_nom)
                db.add(piece)
                db.flush()

            for emp_data in p_data.get("emplacements", []):
                emp_nom = emp_data.get("nom", "").strip()
                if not emp_nom:
                    continue
                emp = db.query(Emplacement).filter(
                    Emplacement.piece_id == piece.id,
                    func.lower(Emplacement.nom) == func.lower(emp_nom)
                ).first()
                if not emp:
                    emp = Emplacement(piece_id=piece.id, nom=emp_nom)
                    db.add(emp)
                    db.flush()

                for cont_data in emp_data.get("contenants", []):
                    cont_nom = cont_data.get("nom", "").strip()
                    if not cont_nom:
                        continue
                    cont = db.query(Contenant).filter(
                        Contenant.emplacement_id == emp.id,
                        func.lower(Contenant.nom) == func.lower(cont_nom)
                    ).first()
                    if not cont:
                        cont = Contenant(emplacement_id=emp.id, nom=cont_nom)
                        db.add(cont)
                        db.flush()

                    for obj_data in cont_data.get("objets", []):
                        obj_nom = obj_data.get("nom", "").strip()
                        if not obj_nom:
                            continue
                        obj = db.query(Objet).filter(
                            Objet.contenant_id == cont.id,
                            func.lower(Objet.nom) == func.lower(obj_nom)
                        ).first()
                        if not obj:
                            obj = Objet(
                                contenant_id=cont.id,
                                nom=obj_nom,
                                description=obj_data.get("description", ""),
                                quantite=obj_data.get("quantite", 1)
                            )
                            db.add(obj)
                            count += 1
        db.commit()
        return {"success": True, "message": f"Import JSON réussi ! {count} objet(s) importé(s)."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erreur d'import : {str(e)}")

@app.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Importe un fichier CSV avec colonnes: Piece;Emplacement;Contenant;Objet;Quantite;Description."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text), delimiter=";")
        header = next(reader, None)
        count = 0
        for row in reader:
            if not row or len(row) < 5:
                continue
            # Format attendu : ID, Piece, Emplacement, Contenant, Objet, Quantite, Description
            # Ou sans ID : Piece, Emplacement, Contenant, Objet, Quantite, Description
            if len(row) >= 7:
                _, piece_nom, emp_nom, cont_nom, obj_nom, qte_str, desc = row[:7]
            else:
                piece_nom, emp_nom, cont_nom, obj_nom, qte_str = row[:5]
                desc = row[5] if len(row) > 5 else ""

            try:
                qte = int(qte_str)
            except Exception:
                qte = 1

            save_extracted_inventory(db, piece_nom, emp_nom, cont_nom, [obj_nom])
            count += 1

        return {"success": True, "message": f"Import CSV réussi ! {count} objet(s) traités."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erreur d'import CSV : {str(e)}")
