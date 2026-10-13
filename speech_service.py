import io
import requests
from typing import Dict, Any, Optional


def test_whisper_connection(whisper_url: str) -> Dict[str, Any]:
    """Teste la connexion avec le serveur Faster-Whisper."""
    if not whisper_url:
        return {"success": False, "message": "URL Whisper vide."}

    cleaned = whisper_url.strip().rstrip("/")
    candidates = [cleaned]
    if "localhost" in cleaned or "127.0.0.1" in cleaned:
        candidates.append(cleaned.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"))
        candidates.append(cleaned.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"))

    for base in candidates:
        endpoints_to_try = [f"{base}/health", f"{base}/docs", f"{base}/openapi.json", f"{base}/v1/models", f"{base}/"]
        for url in endpoints_to_try:
            try:
                r = requests.get(url, timeout=2.5)
                if r.status_code in (200, 400, 404, 405):
                    msg = f"Serveur Faster-Whisper actif à l'adresse {base}."
                    if base != cleaned:
                        msg += f" Note: Utilisez '{base}' depuis Docker."
                    return {"success": True, "message": msg, "url": base}
            except Exception:
                continue

    return {
        "success": False,
        "message": f"Impossible de joindre le serveur Faster-Whisper sur {cleaned}.",
        "url": cleaned
    }


def test_piper_connection(piper_url: str) -> Dict[str, Any]:
    """Teste la connexion avec le serveur Piper-TTS."""
    if not piper_url:
        return {"success": False, "message": "URL Piper vide."}

    cleaned = piper_url.strip().rstrip("/")
    candidates = [cleaned]
    if "localhost" in cleaned or "127.0.0.1" in cleaned:
        candidates.append(cleaned.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal"))
        candidates.append(cleaned.replace("localhost", "172.17.0.1").replace("127.0.0.1", "172.17.0.1"))

    for base in candidates:
        endpoints_to_try = [f"{base}/health", f"{base}/voices", f"{base}/api/tts", f"{base}/"]
        for url in endpoints_to_try:
            try:
                r = requests.get(url, timeout=2.5)
                if r.status_code in (200, 400, 404, 405):
                    msg = f"Serveur Piper-TTS actif à l'adresse {base}."
                    if base != cleaned:
                        msg += f" Note: Utilisez '{base}' depuis Docker."
                    return {"success": True, "message": msg, "url": base}
            except Exception:
                continue

    return {
        "success": False,
        "message": f"Impossible de joindre le serveur Piper-TTS sur {cleaned}.",
        "url": cleaned
    }


def transcribe_audio(audio_bytes: bytes, filename: str = "recording.webm", whisper_url: str = "http://faster-whisper:9000") -> str:
    """
    Envoie le flux audio à l'API Faster-Whisper et retourne le texte transcrit.
    Tente d'abord le endpoint OpenAI-compatible /v1/audio/transcriptions puis le endpoint direct /asr.
    """
    base = whisper_url.rstrip("/")
    
    # 1. Format OpenAI-compatible /v1/audio/transcriptions
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

    # 2. Format standard Faster-Whisper /asr (ex: fedirz/faster-whisper-server ou ahmetoner/whisper-asr-webservice)
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


def synthesize_speech(text: str, piper_url: str = "http://piper:5000") -> Optional[bytes]:
    """
    Envoie le texte à Piper-TTS et renvoie le flux audio WAV brut.
    Gère les endpoints classiques des serveurs HTTP Piper (GET/POST /?text=, /tts, /api/tts).
    """
    if not text or not text.strip():
        return None

    base = piper_url.rstrip("/")

    # Essai 1: POST /tts ou /api/tts avec JSON
    for path in ["/tts", "/api/tts", "/"]:
        try:
            res = requests.post(
                f"{base}{path}",
                json={"text": text.strip()},
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            if res.status_code == 200 and len(res.content) > 100:
                return res.content
        except Exception:
            pass

    # Essai 2: GET /?text=...
    try:
        res = requests.get(f"{base}/", params={"text": text.strip()}, timeout=15)
        if res.status_code == 200 and len(res.content) > 100:
            return res.content
    except Exception:
        pass

    return None
