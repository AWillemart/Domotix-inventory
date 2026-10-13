import { ExtractionResult, AppSettings } from '../types';

export function parseNaturalLanguageText(text: string): ExtractionResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Détection de recherche
  const searchKeywords = [
    'cherche',
    'où est',
    'où sont',
    'où se trouve',
    'retrouver',
    'ou est',
    'ou sont',
    'ou se trouve',
    'trouve',
  ];
  const isSearch = searchKeywords.some((k) => lower.includes(k));

  if (isSearch) {
    let sub = lower
      .replace(/^(je\s+cherche|où\s+se\s+trouve|où\s+est|où\s+sont|ou\s+se\s+trouve|ou\s+est|ou\s+sont|trouve)\s+/i, '')
      .replace(/[?!.]/g, '');

    // Séparer les termes par "et", "ou", virgules
    const parts = sub.split(/,|\bet\b|\bou\b/);
    const items = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 1)
      .map((p) => p.replace(/^(une|un|du|de la|des|le|la|les|d')\s+/i, '').trim());

    return {
      action: 'search',
      items: items.length > 0 ? items : [clean],
      _source: 'Local NLP',
    };
  }

  // 2. Détection d'Ajout (Pièce, Emplacement, Contenant, Objets)
  let room = 'Garage';
  let location = 'Étagère';
  let container = 'Caisse';

  // Extraction Pièce : "dans le garage", "dans la cuisine", "à l'atelier"
  const roomMatch = text.match(/(?:dans\s+(?:le|la|l'|les)|à\s+l')\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:,|\s+devant|\s+sur|\s+dans|\s+j'ai|$)/i);
  if (roomMatch && roomMatch[1]) {
    const candidate = roomMatch[1].trim();
    if (candidate.split(/\s+/).length <= 4) {
      room = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  // Extraction Emplacement : "devant l'étagère à côté de l'entrée", "sur l'établi"
  const locMatch = text.match(/(?:devant|sur|près\s+de|sous)\s+(?:le|la|l'|les)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:,|\s+dans|\s+j'ai|$)/i);
  if (locMatch && locMatch[1]) {
    const candidate = locMatch[1].trim();
    if (candidate.split(/\s+/).length <= 7) {
      location = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  // Extraction Contenant : "dans la caisse en carton Action 02", "dans le tiroir"
  const contMatch = text.match(/(?:dans\s+(?:la|le|l'|les|ce|cette)\s+)?(caisse|boîte|boite|tiroir|bac|carton|sac|valise|mallette|bocal)\s+([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:j'ai|il\s+y\s+a|,|$)/i);
  if (contMatch && contMatch[1]) {
    const candidate = `${contMatch[1]} ${contMatch[2]}`.trim();
    container = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  } else {
    const altCont = text.match(/dans\s+(?:le|la|l'|les)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)\s+(?:j'ai|il\s+y\s+a)/i);
    if (altCont && altCont[1]) {
      const candidate = altCont[1].trim();
      container = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  // Extraction Objets : après "j'ai", "il y a", "ajouter", "range"
  const items: string[] = [];
  const itemsMatch = text.match(/(?:j'ai|il\s+y\s+a|ajouter|range|stocke|mets)\s+([a-zA-ZÀ-ÿ0-9\s,'-]+)/i);
  if (itemsMatch && itemsMatch[1]) {
    const rawItems = itemsMatch[1].replace(/[?!.]/g, '');
    const parts = rawItems.split(/,|\bet\b|\bou\b/);
    for (const part of parts) {
      const cleaned = part
        .trim()
        .replace(/^(?:du|de\s+la|des|un|une|le|la|les|d')\s+/i, '')
        .trim();
      if (cleaned.length > 0) {
        items.push(cleaned);
      }
    }
  }

  return {
    action: 'add',
    room: room || 'Garage',
    location: location || 'Zone générale',
    container: container || 'Bac général',
    items: items.length > 0 ? items : [clean],
    _source: 'Local NLP (Rule-Based)',
  };
}

export async function processPromptWithOllama(
  text: string,
  settings: AppSettings
): Promise<ExtractionResult> {
  // Tente un appel direct à Ollama si l'utilisateur teste sur son réseau local
  try {
    const endpoint = `${settings.ollama_url.replace(/\/+$/, '')}/api/generate`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollama_model || 'gemma3:4b',
        prompt: `Analyse cette phrase d'inventaire en français et réponds UNIQUEMENT un JSON strict :
Si ajout : {"action":"add","room":"...","location":"...","container":"...","items":["..."]}
Si recherche : {"action":"search","items":["..."]}
Phrase : "${text}"`,
        stream: false,
        format: 'json',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const raw = data.response;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.action) {
        return { ...parsed, _source: `Ollama (${settings.ollama_model})` };
      }
    }
  } catch {
    // Si l'endpoint Ollama n'est pas joignable (hors réseau local ou CORS), utiliser l'analyseur sémantique
  }

  return parseNaturalLanguageText(text);
}

export function speakTextWebAudio(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'fr-FR';
  utter.rate = 1.0;
  utter.pitch = 1.0;

  // Tenter de trouver une voix française naturelle
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find((v) => v.lang.startsWith('fr') && !v.name.includes('Google'));
  if (frVoice) utter.voice = frVoice;

  window.speechSynthesis.speak(utter);
}
