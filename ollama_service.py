import json
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
- Réponds UNIQUEMENT un objet JSON valide, sans texte d'introduction ni de conclusion, sans balises markdown ```json.
- Normalise les majuscules pour les noms de lieux et contenants (ex: "Garage", "Étagère entrée").
- Nettoie les articles inutiles dans les objets si pertinent mais garde les précisions utiles.
"""


def test_ollama_connection(ollama_url: str) -> Dict[str, Any]:
    """Teste la connexion vers l'API Ollama et récupère la liste des modèles disponibles."""
    if not ollama_url:
        return {"success": False, "message": "URL Ollama vide.", "models": []}

    cleaned = ollama_url.strip().rstrip("/")
    candidates = [cleaned]

    # Si l'utilisateur a tapé localhost ou 127.0.0.1 à l'intérieur d'un conteneur Docker,
    # tester également l'hôte Docker ZimaOS
    if "localhost" in cleaned or "127.0.0.1" in cleaned:
        candidates.append(cleaned.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"))
        candidates.append(cleaned.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"))

    last_error = ""
    for candidate in candidates:
        url = candidate + "/api/tags"
        try:
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                msg = f"Connecté à Ollama ({candidate}). {len(models)} modèle(s) détecté(s)."
                if candidate != cleaned:
                    msg += f" Note: Utilisez '{candidate}' depuis Docker au lieu de 'localhost'."
                return {
                    "success": True,
                    "message": msg,
                    "models": models,
                    "url": candidate
                }
            last_error = f"Statut HTTP {response.status_code}"
        except Exception as e:
            last_error = str(e)

    return {
        "success": False,
        "message": f"Impossible de joindre Ollama sur {cleaned} : {last_error}",
        "models": [],
        "url": cleaned
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
        # Extraire les objets recherchés
        sub_text = re.sub(r"^(je\s+cherche|où\s+se\s+trouve|où\s+est|où\s+sont|ou\s+se\s+trouve|ou\s+est|ou\s+sont|peux-tu\s+trouver|trouve)\s+", "", lower_text)
        sub_text = re.sub(r"[?!.]", "", sub_text)
        # Séparer par "et", "ou", virgules
        parts = re.split(r",|\bet\b|\bou\b", sub_text)
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

    # Extraction Pièce (ex: "dans le garage", "dans la cuisine", "à l'atelier")
    room_match = re.search(r"(?:dans\s+(?:le|la|l'|les)|à\s+l')\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:,|\s+devant|\s+sur|\s+dans|\s+j'ai|$)", text, re.IGNORECASE)
    if room_match:
        room_candidate = room_match.group(1).strip()
        # Ne garder que le premier syntagme pertinent
        if len(room_candidate.split()) <= 4:
            room = room_candidate.capitalize()

    # Extraction Emplacement (ex: "devant l'étagère...", "sur l'établi", "près de la porte")
    loc_match = re.search(r"(?:devant|sur|près\s+de|sous|dans\s+l'armoire)\s+(?:le|la|l'|les)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:,|\s+dans|\s+j'ai|$)", text, re.IGNORECASE)
    if loc_match:
        loc_candidate = loc_match.group(1).strip()
        if len(loc_candidate.split()) <= 6:
            location = loc_candidate.capitalize()

    # Extraction Contenant (ex: "dans la caisse en carton Action 02", "dans le tiroir du haut")
    cont_match = re.search(r"(?:dans\s+(?:la|le|l'|les|ce|cette)\s+)?(caisse|boîte|boite|tiroir|bac|carton|sac|valise|mallette|bocal)\s+([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:j'ai|il\s+y\s+a|,|$)", text, re.IGNORECASE)
    if cont_match:
        container = f"{cont_match.group(1)} {cont_match.group(2)}".strip().capitalize()
    else:
        # Essai alternatif "dans X j'ai"
        alt_cont = re.search(r"dans\s+(?:le|la|l'|les)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)\s+(?:j'ai|il\s+y\s+a)", text, re.IGNORECASE)
        if alt_cont:
            container = alt_cont.group(1).strip().capitalize()

    # Extraction Objets (ce qui suit "j'ai", "il y a", "ajouter", "range")
    items = []
    items_match = re.search(r"(?:j'ai|il\s+y\s+a|ajouter|range|stocke|mets)\s+([a-zA-ZÀ-ÿ0-9\s,'-]+)", text, re.IGNORECASE)
    if items_match:
        raw_items = items_match.group(1).strip()
        raw_items = re.sub(r"[?!.]", "", raw_items)
        # Nettoyage et découpage par virgule / et / ou
        parts = re.split(r",|\bet\b|\bou\b", raw_items)
        for part in parts:
            item_clean = re.sub(r"^(?:du|de\s+la|des|un|une|le|la|les|d')\s+", "", part.strip(), flags=re.IGNORECASE).strip()
            if item_clean:
                items.append(item_clean)

    if not items:
        # Dernier recours : prendre la phrase
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
    """
    Envoie le texte à l'API Ollama avec le prompt système et contrainte JSON.
    Bascule automatiquement sur le parseur de secours si Ollama est indisponible ou répond de manière invalide.
    """
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

            # Nettoyer d'éventuelles balises markdown
            cleaned_json = re.sub(r"^```(?:json)?\s*", "", raw_response)
            cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

            parsed = json.loads(cleaned_json)
            if isinstance(parsed, dict) and "action" in parsed:
                parsed["_source"] = f"ollama ({model})"
                return parsed
    except Exception as e:
        print(f"[Ollama Service] Appel Ollama échoué ({e}). Utilisation du parseur heuristique.")

    # Fallback si Ollama n'est pas joignable ou en cas d'erreur de parsing
    return fallback_rule_based_extraction(text)
