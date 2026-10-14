import { Piece, AppSettings, Objet } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  ollama_url: 'http://ollama:11434',
  whisper_url: 'http://faster-whisper:9000',
  piper_url: 'http://piper:5000',
  ollama_model: 'gemma3:4b',
  piper_voice: 'fr_FR-siwis-medium',
  tts_engine: 'auto',
  browser_voice: '',
  tts_speed: 1.0,
  require_validation: true,
  theme_color: 'emerald',
  color_mode: 'dark',
  domotix_port: 8585,
  github_repo: 'awillemart/domotix-inventory',
  github_branch: 'main',
};

export const INITIAL_INVENTORY: Piece[] = [
  {
    id: 'p-1',
    nom: 'Garage',
    date_creation: new Date().toISOString(),
    emplacements: [
      {
        id: 'e-1',
        piece_id: 'p-1',
        nom: 'Étagère à côté de l\'entrée',
        date_creation: new Date().toISOString(),
        contenants: [
          {
            id: 'c-1',
            emplacement_id: 'e-1',
            nom: 'Caisse en carton Action 02',
            date_creation: new Date().toISOString(),
            objets: [
              {
                id: 'o-1',
                contenant_id: 'c-1',
                nom: 'ruban de masquage',
                description: 'Ruban adhésif papier pour peinture 50mm',
                quantite: 2,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
              {
                id: 'o-2',
                contenant_id: 'c-1',
                nom: 'rouleau à peinture',
                description: 'Manchon microfibre 180mm',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
              {
                id: 'o-3',
                contenant_id: 'c-1',
                nom: 'masque FP2',
                description: 'Masques de protection respiratoire',
                quantite: 5,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
            ],
          },
          {
            id: 'c-2',
            emplacement_id: 'e-1',
            nom: 'Bac bleu quincaillerie',
            date_creation: new Date().toISOString(),
            objets: [
              {
                id: 'o-4',
                contenant_id: 'c-2',
                nom: 'chevilles nylon 6mm',
                description: 'Boîte de 100 avec vis',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
            ],
          },
        ],
      },
      {
        id: 'e-2',
        piece_id: 'p-1',
        nom: 'Établi du fond',
        date_creation: new Date().toISOString(),
        contenants: [
          {
            id: 'c-3',
            emplacement_id: 'e-2',
            nom: 'Panneau perforé',
            date_creation: new Date().toISOString(),
            objets: [
              {
                id: 'o-5',
                contenant_id: 'c-3',
                nom: 'marteau de menuisier',
                description: 'Manche bois hickory',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'p-2',
    nom: 'Cuisine',
    date_creation: new Date().toISOString(),
    emplacements: [
      {
        id: 'e-3',
        piece_id: 'p-2',
        nom: 'Îlot central',
        date_creation: new Date().toISOString(),
        contenants: [
          {
            id: 'c-4',
            emplacement_id: 'e-3',
            nom: 'Tiroir à ustensiles haut',
            date_creation: new Date().toISOString(),
            objets: [
              {
                id: 'o-6',
                contenant_id: 'c-4',
                nom: 'paire de ciseaux',
                description: 'Ciseaux inox cuisine',
                quantite: 2,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
              {
                id: 'o-7',
                contenant_id: 'c-4',
                nom: 'ouvre-boîte',
                description: 'Manivelle chromée',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'p-3',
    nom: 'Atelier',
    date_creation: new Date().toISOString(),
    emplacements: [
      {
        id: 'e-4',
        piece_id: 'p-3',
        nom: 'Armoire métallique',
        date_creation: new Date().toISOString(),
        contenants: [
          {
            id: 'c-5',
            emplacement_id: 'e-4',
            nom: 'Mallette outillage Bosch',
            date_creation: new Date().toISOString(),
            objets: [
              {
                id: 'o-8',
                contenant_id: 'c-5',
                nom: 'perceuse visseuse 18V',
                description: 'Avec 2 batteries et chargeur rapide',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
              {
                id: 'o-9',
                contenant_id: 'c-5',
                nom: 'forets métaux HSS',
                description: 'Jeu de 1 à 10mm',
                quantite: 1,
                date_creation: new Date().toISOString(),
                date_modification: new Date().toISOString(),
              },
            ],
          },
        ],
      },
    ],
  },
];

const STORAGE_KEY_INVENTORY = 'domotix_inventory_data_v1';
const STORAGE_KEY_SETTINGS = 'domotix_settings_data_v1';

export function loadStoredInventory(): Piece[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVENTORY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erreur lecture localStorage inventaire', e);
  }
  return INITIAL_INVENTORY;
}

export function saveStoredInventory(pieces: Piece[]) {
  try {
    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(pieces));
  } catch (e) {
    console.error('Erreur sauvegarde localStorage inventaire', e);
  }
}

export function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Erreur lecture localStorage réglages', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Erreur sauvegarde localStorage réglages', e);
  }
}

export interface SearchMatch {
  objet: Objet;
  pieceNom: string;
  emplacementNom: string;
  contenantNom: string;
  cheminComplet: string;
}

export function searchInventoryItems(pieces: Piece[], queryTerms: string[]): {
  matches: SearchMatch[];
  spokenMessage: string;
} {
  const matches: SearchMatch[] = [];
  const phrases: string[] = [];

  for (const rawTerm of queryTerms) {
    const term = rawTerm.trim().toLowerCase();
    if (!term) continue;

    const termMatches: SearchMatch[] = [];

    for (const piece of pieces) {
      for (const emp of piece.emplacements) {
        for (const cont of emp.contenants) {
          for (const obj of cont.objets) {
            if (
              obj.nom.toLowerCase().includes(term) ||
              (obj.description && obj.description.toLowerCase().includes(term))
            ) {
              const match: SearchMatch = {
                objet: obj,
                pieceNom: piece.nom,
                emplacementNom: emp.nom,
                contenantNom: cont.nom,
                cheminComplet: `${piece.nom} > ${emp.nom} > ${cont.nom}`,
              };
              matches.push(match);
              termMatches.push(match);
            }
          }
        }
      }
    }

    if (termMatches.length > 0) {
      const descriptions = termMatches.map(
        (m) => `${m.objet.nom} se trouve dans : ${m.cheminComplet}`
      );
      phrases.push(descriptions.join('. '));
    } else {
      phrases.push(`Je n'ai pas trouvé '${rawTerm}' dans l'inventaire.`);
    }
  }

  const spokenMessage = phrases.join(' ') || 'Aucun objet trouvé dans l\'inventaire.';
  return { matches, spokenMessage };
}

export function addItemsToHierarchy(
  pieces: Piece[],
  roomName: string,
  locationName: string,
  containerName: string,
  items: string[]
): { updatedPieces: Piece[]; addedCount: number } {
  const clone: Piece[] = JSON.parse(JSON.stringify(pieces));
  const rName = (roomName || 'Garage').trim();
  const lName = (locationName || 'Étagère').trim();
  const cName = (containerName || 'Caisse').trim();

  let piece = clone.find((p) => p.nom.toLowerCase() === rName.toLowerCase());
  if (!piece) {
    piece = {
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      nom: rName,
      date_creation: new Date().toISOString(),
      emplacements: [],
    };
    clone.push(piece);
  }

  let emp = piece.emplacements.find((e) => e.nom.toLowerCase() === lName.toLowerCase());
  if (!emp) {
    emp = {
      id: 'e-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      piece_id: piece.id,
      nom: lName,
      date_creation: new Date().toISOString(),
      contenants: [],
    };
    piece.emplacements.push(emp);
  }

  let cont = emp.contenants.find((c) => c.nom.toLowerCase() === cName.toLowerCase());
  if (!cont) {
    cont = {
      id: 'c-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      emplacement_id: emp.id,
      nom: cName,
      date_creation: new Date().toISOString(),
      objets: [],
    };
    emp.contenants.push(cont);
  }

  let addedCount = 0;
  for (const item of items) {
    const cleanItem = item.trim();
    if (!cleanItem) continue;

    const existing = cont.objets.find((o) => o.nom.toLowerCase() === cleanItem.toLowerCase());
    if (existing) {
      existing.quantite += 1;
      existing.date_modification = new Date().toISOString();
    } else {
      cont.objets.push({
        id: 'o-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        contenant_id: cont.id,
        nom: cleanItem,
        description: '',
        quantite: 1,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      });
      addedCount++;
    }
  }

  return { updatedPieces: clone, addedCount };
}

export function exportInventoryAsJSON(pieces: Piece[]) {
  const data = {
    export_date: new Date().toISOString(),
    application: 'Domotix ZimaOS',
    inventory: pieces,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `domotix_inventaire_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportInventoryAsCSV(pieces: Piece[]) {
  const rows: string[] = ['"Piece";"Emplacement";"Contenant";"Objet";"Quantite";"Description"'];
  for (const p of pieces) {
    for (const e of p.emplacements) {
      for (const c of e.contenants) {
        for (const o of c.objets) {
          rows.push(
            `"${p.nom.replace(/"/g, '""')}";"${e.nom.replace(/"/g, '""')}";"${c.nom.replace(/"/g, '""')}";"${o.nom.replace(/"/g, '""')}";${o.quantite};"${(o.description || '').replace(/"/g, '""')}"`
          );
        }
      }
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `domotix_inventaire_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importInventoryFromJSON(jsonString: string): {
  success: boolean;
  pieces?: Piece[];
  count: number;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    const rawList = Array.isArray(parsed) ? parsed : parsed.inventory;
    if (!Array.isArray(rawList)) {
      return { success: false, count: 0, error: 'Format JSON invalide : la clé "inventory" doit être une liste de pièces.' };
    }

    let count = 0;
    const pieces: Piece[] = rawList.map((p: any) => ({
      id: p.id || 'p-' + Math.random().toString(36).substring(2, 8),
      nom: p.nom || 'Sans nom',
      date_creation: p.date_creation || new Date().toISOString(),
      emplacements: (p.emplacements || []).map((e: any) => ({
        id: e.id || 'e-' + Math.random().toString(36).substring(2, 8),
        piece_id: p.id,
        nom: e.nom || 'Zone',
        date_creation: e.date_creation || new Date().toISOString(),
        contenants: (e.contenants || []).map((c: any) => ({
          id: c.id || 'c-' + Math.random().toString(36).substring(2, 8),
          emplacement_id: e.id,
          nom: c.nom || 'Bac',
          date_creation: c.date_creation || new Date().toISOString(),
          objets: (c.objets || []).map((o: any) => {
            count++;
            return {
              id: o.id || 'o-' + Math.random().toString(36).substring(2, 8),
              contenant_id: c.id,
              nom: o.nom || 'Objet',
              description: o.description || '',
              quantite: typeof o.quantite === 'number' ? o.quantite : 1,
              date_creation: o.date_creation || new Date().toISOString(),
              date_modification: o.date_modification || new Date().toISOString(),
            };
          }),
        })),
      })),
    }));

    return { success: true, pieces, count };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Erreur lors de la lecture du fichier JSON.' };
  }
}

export function importInventoryFromCSV(
  csvString: string,
  currentPieces: Piece[]
): {
  success: boolean;
  updatedPieces?: Piece[];
  count: number;
  error?: string;
} {
  try {
    const lines = csvString.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      return { success: false, count: 0, error: 'Le fichier CSV est vide ou ne contient que l\'en-tête.' };
    }

    let clone: Piece[] = JSON.parse(JSON.stringify(currentPieces));
    let count = 0;

    // Détection délimiteur (point-virgule ou virgule)
    const delimiter = lines[0].includes(';') ? ';' : ',';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Découper respectant les guillemets
      const regex = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g');
      const matches: string[] = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        matches.push((val || '').trim());
      }

      if (matches.length < 4) continue;

      let pieceNom = '';
      let empNom = '';
      let contNom = '';
      let objNom = '';
      let qte = 1;
      let desc = '';

      if (matches.length >= 6) {
        // [Piece, Emplacement, Contenant, Objet, Quantite, Description]
        [pieceNom, empNom, contNom, objNom] = matches.slice(0, 4);
        qte = parseInt(matches[4], 10) || 1;
        desc = matches[5] || '';
      } else {
        [pieceNom, empNom, contNom, objNom] = matches.slice(0, 4);
      }

      if (!pieceNom || !objNom) continue;

      const res = addItemsToHierarchy(clone, pieceNom, empNom || 'Zone principale', contNom || 'Bac général', [objNom]);
      clone = res.updatedPieces;
      count++;
    }

    return { success: true, updatedPieces: clone, count };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Erreur lors du traitement du fichier CSV.' };
  }
}
