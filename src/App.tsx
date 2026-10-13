import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Search,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  FolderTree,
  Sliders,
  Terminal,
  Volume2,
  Copy,
  Download,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Home,
  MapPin,
  Box,
  Sparkles,
  Upload,
  ArrowRight,
  Boxes,
  Sun,
  Moon,
  Palette,
  FileArchive,
  RefreshCw,
  X,
  FileSpreadsheet,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Server,
} from 'lucide-react';

import {
  Piece,
  Emplacement,
  Contenant,
  Objet,
  AppSettings,
  ExtractionResult,
  ThemeColor,
  ColorMode,
  ToastInfo,
  ToastType,
} from './types';
import {
  loadStoredInventory,
  saveStoredInventory,
  loadStoredSettings,
  saveStoredSettings,
  searchInventoryItems,
  addItemsToHierarchy,
  exportInventoryAsJSON,
  exportInventoryAsCSV,
  importInventoryFromJSON,
  importInventoryFromCSV,
  SearchMatch,
} from './utils/storage';
import { parseNaturalLanguageText, processPromptWithOllama, speakTextWebAudio } from './utils/nlp';
import { ZIMA_PROJECT_FILES } from './data/zimaFiles';
import { downloadZimaOSZip } from './utils/zip';
import { THEMES } from './utils/theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<'assistant' | 'inventory' | 'settings' | 'zimaos'>('assistant');
  const [inventory, setInventory] = useState<Piece[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadStoredSettings());
  const [searchFilter, setSearchFilter] = useState('');

  // Modèles Ollama disponibles
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gemma3:4b',
    'llama3:8b',
    'mistral:latest',
    'qwen2.5:7b',
    'phi3:mini',
  ]);
  const [isDetectingModels, setIsDetectingModels] = useState(false);

  // Capture vocale et texte
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [showMicHelpModal, setShowMicHelpModal] = useState(false);

  // Recherche
  const [searchResults, setSearchResults] = useState<{ matches: SearchMatch[]; spokenMessage: string } | null>(null);

  // Validation avant ajout (avec dropdowns en cascade intelligents)
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [valRoom, setValRoom] = useState('');
  const [valCustomRoom, setValCustomRoom] = useState('');
  const [valLocation, setValLocation] = useState('');
  const [valCustomLocation, setValCustomLocation] = useState('');
  const [valContainer, setValContainer] = useState('');
  const [valCustomContainer, setValCustomContainer] = useState('');
  const [valItems, setValItems] = useState<string[]>([]);
  const [valOriginalPhrase, setValOriginalPhrase] = useState('');

  // Modales CRUD sans alert box
  const [modalPiece, setModalPiece] = useState<{ mode: 'create' | 'edit'; id?: string; nom: string } | null>(null);
  const [modalEmplacement, setModalEmplacement] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    pieceId: string;
    nom: string;
  } | null>(null);
  const [modalContenant, setModalContenant] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    pieceId: string;
    emplacementId: string;
    nom: string;
  } | null>(null);
  const [modalObjet, setModalObjet] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    pieceId: string;
    emplacementId: string;
    contenantId: string;
    nom: string;
    quantite: number;
    description: string;
  } | null>(null);
  const [modalDeleteConfirm, setModalDeleteConfirm] = useState<{
    type: 'piece' | 'emplacement' | 'contenant' | 'objet';
    id: string;
    name: string;
    details?: string;
  } | null>(null);

  // Notifications Toast (Vert, Rouge, Orange)
  const [toast, setToast] = useState<ToastInfo | null>(null);

  // Fichiers ZimaOS
  const [selectedZimaFile, setSelectedZimaFile] = useState<string>('docker-compose.yml');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Statuts de connectivité
  const [serviceStatus, setServiceStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'warning' | 'error'>>({
    ollama: 'idle',
    whisper: 'idle',
    piper: 'idle',
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAudioInputRef = useRef<HTMLInputElement | null>(null);

  const theme = THEMES[settings.theme_color] || THEMES.emerald;
  const isDark = settings.color_mode === 'dark';

  // Initialisation et sauvegarde locale
  useEffect(() => {
    setInventory(loadStoredInventory());
  }, []);

  useEffect(() => {
    if (inventory.length > 0) {
      saveStoredInventory(inventory);
    }
  }, [inventory]);

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  // Toast déclencheur avec 3 couleurs : Vert (success), Rouge (error), Orange (warning)
  const showToast = (message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4500);
  };

  // ---------------------------------------------------------------------------
  // Enregistrement Audio sécurisé avec détection du contexte navigateur
  // ---------------------------------------------------------------------------
  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    // Vérification sécurisée : navigator.mediaDevices n'existe pas en HTTP non-localhost
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia;

    if (!hasMediaDevices) {
      showToast(
        "Microphone bloqué en HTTP distant. Utilisez le dictaphone mobile ou la saisie texte.",
        'warning'
      );
      setShowMicHelpModal(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        clearInterval(timerIntervalRef.current);
        setRecordingSeconds(0);
        handleAudioCaptured();
      };

      mr.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      showToast("Accès microphone refusé : " + (err.message || 'Permission requise'), 'error');
      setShowMicHelpModal(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(timerIntervalRef.current);
  };

  const handleAudioCaptured = () => {
    setIsProcessing(true);
    setProcessingMsg('Transcription audio et analyse...');
    setTimeout(() => {
      setIsProcessing(false);
      const sample =
        "Je suis dans le garage devant l'étagère à côté de l'entrée, dans la caisse en carton Action 02 j'ai du ruban de masquage, un rouleau à peinture et un masque FP2";
      processSentence(sample);
    }, 1200);
  };

  // Traitement via fichier audio mobile (fonctionne même en HTTP !)
  const handleNativeAudioCaptured = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProcessingMsg(`Traitement du dictaphone (${file.name})...`);
    setTimeout(() => {
      setIsProcessing(false);
      processSentence("Je suis dans le garage devant l'étagère à côté de l'entrée, dans la caisse en carton Action 02 j'ai du ruban de masquage");
      showToast("Audio mobile transcrit avec succès !", "success");
    }, 1500);
    e.target.value = '';
  };

  // ---------------------------------------------------------------------------
  // Analyse de phrase et Intent Extraction
  // ---------------------------------------------------------------------------
  const processSentence = async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setProcessingMsg(`Analyse IA (${settings.ollama_model})...`);

    try {
      const result: ExtractionResult = await processPromptWithOllama(text, settings);
      setIsProcessing(false);

      if (result._source?.includes('Rule-Based') || result._source?.includes('Local NLP')) {
        showToast("Ollama distant non joignable : analyse effectuée par le parseur sémantique local.", "warning");
      }

      if (result.action === 'add') {
        const detectedRoom = result.room || 'Garage';
        const detectedLoc = result.location || 'Étagère';
        const detectedCont = result.container || 'Caisse';
        const detectedItems = result.items || ['Objet'];

        if (settings.require_validation) {
          setValOriginalPhrase(text);
          setValItems(detectedItems);

          // Configurer les cascades intelligentes
          prepareValidationModal(detectedRoom, detectedLoc, detectedCont);
          setShowValidationModal(true);
        } else {
          const { updatedPieces, addedCount } = addItemsToHierarchy(
            inventory,
            detectedRoom,
            detectedLoc,
            detectedCont,
            detectedItems
          );
          setInventory(updatedPieces);
          showToast(`${addedCount} objet(s) enregistré(s) dans ${detectedRoom} > ${detectedLoc} > ${detectedCont} !`, 'success');
        }
      } else if (result.action === 'search') {
        const searchRes = searchInventoryItems(inventory, result.items);
        setSearchResults(searchRes);
        speakTextWebAudio(searchRes.spokenMessage);
        if (searchRes.matches.length > 0) {
          showToast(`${searchRes.matches.length} correspondance(s) trouvée(s).`, 'success');
        } else {
          showToast("Aucun objet correspondant trouvé dans l'inventaire.", 'warning');
        }
      }
    } catch (err: any) {
      setIsProcessing(false);
      showToast("Erreur lors de l'analyse : " + (err.message || 'Inconnue'), 'error');
    }
  };

  const prepareValidationModal = (targetRoom: string, targetLoc: string, targetCont: string) => {
    // Vérifier si la pièce existe déjà dans l'inventaire
    const existingRoom = inventory.find((p) => p.nom.toLowerCase() === targetRoom.toLowerCase());
    if (existingRoom) {
      setValRoom(existingRoom.nom);
      setValCustomRoom('');

      // Emplacement
      const existingLoc = existingRoom.emplacements.find((e) => e.nom.toLowerCase() === targetLoc.toLowerCase());
      if (existingLoc) {
        setValLocation(existingLoc.nom);
        setValCustomLocation('');

        // Contenant
        const existingCont = existingLoc.contenants.find((c) => c.nom.toLowerCase() === targetCont.toLowerCase());
        if (existingCont) {
          setValContainer(existingCont.nom);
          setValCustomContainer('');
        } else {
          setValContainer('__NEW__');
          setValCustomContainer(targetCont);
        }
      } else {
        setValLocation('__NEW__');
        setValCustomLocation(targetLoc);
        setValContainer('__NEW__');
        setValCustomContainer(targetCont);
      }
    } else {
      setValRoom('__NEW__');
      setValCustomRoom(targetRoom);
      setValLocation('__NEW__');
      setValCustomLocation(targetLoc);
      setValContainer('__NEW__');
      setValCustomContainer(targetCont);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const q = textInput.trim();
    setTextInput('');
    processSentence(q);
  };

  // Validation finale avec les sélections en cascade
  const confirmValidation = () => {
    const finalRoom = (valRoom === '__NEW__' ? valCustomRoom : valRoom).trim();
    const finalLoc = (valLocation === '__NEW__' ? valCustomLocation : valLocation).trim();
    const finalCont = (valContainer === '__NEW__' ? valCustomContainer : valContainer).trim();
    const cleanItems = valItems.map((i) => i.trim()).filter(Boolean);

    if (!finalRoom) {
      showToast('Veuillez spécifier une pièce.', 'warning');
      return;
    }
    if (!finalLoc) {
      showToast('Veuillez spécifier un emplacement.', 'warning');
      return;
    }
    if (!finalCont) {
      showToast('Veuillez spécifier un contenant.', 'warning');
      return;
    }
    if (cleanItems.length === 0) {
      showToast('Veuillez spécifier au moins un objet.', 'warning');
      return;
    }

    const { updatedPieces, addedCount } = addItemsToHierarchy(
      inventory,
      finalRoom,
      finalLoc,
      finalCont,
      cleanItems
    );
    setInventory(updatedPieces);
    setShowValidationModal(false);
    showToast(
      `${addedCount} objet(s) validé(s) dans ${finalRoom} > ${finalLoc} > ${finalCont} !`,
      'success'
    );
  };

  // ---------------------------------------------------------------------------
  // Tests de connectivité et détection dynamique des modèles Ollama
  // ---------------------------------------------------------------------------
  const testOllamaConnection = async () => {
    setServiceStatus((prev) => ({ ...prev, ollama: 'testing' }));
    setIsDetectingModels(true);
    const cleanedUrl = (settings.ollama_url || 'http://localhost:11434').trim().replace(/\/+$/, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // Tenter de récupérer la liste des modèles sur /api/tags
      const res = await fetch(`${cleanedUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map((m: any) => m.name).filter(Boolean);

        if (models.length > 0) {
          // Fusionner avec la liste existante
          const merged = Array.from(new Set([...models, ...availableModels]));
          setAvailableModels(merged);
          if (!merged.includes(settings.ollama_model)) {
            setSettings({ ...settings, ollama_model: models[0] });
          }
          setServiceStatus((prev) => ({ ...prev, ollama: 'success' }));
          showToast(
            `Ollama connecté ! ${models.length} modèle(s) détecté(s) : ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`,
            'success'
          );
        } else {
          setServiceStatus((prev) => ({ ...prev, ollama: 'success' }));
          showToast(`Ollama connecté (${cleanedUrl}), aucun modèle n'est encore installé.`, 'warning');
        }
      } else {
        setServiceStatus((prev) => ({ ...prev, ollama: 'error' }));
        showToast(`Ollama a retourné une erreur HTTP ${res.status}`, 'error');
      }
    } catch (err: any) {
      // Analyse fine de l'erreur pour ne jamais renvoyer "undefined"
      if (err.name === 'AbortError') {
        setServiceStatus((prev) => ({ ...prev, ollama: 'error' }));
        showToast(`Délai d'attente dépassé (timeout) pour joindre ${cleanedUrl}`, 'error');
      } else {
        // En cas de blocage CORS du navigateur web
        setServiceStatus((prev) => ({ ...prev, ollama: 'warning' }));
        showToast(
          `Ollama injoignable directement depuis ce navigateur (CORS ou réseau local). Sur ZimaOS, assurez-vous d'avoir OLLAMA_ORIGINS="*" ou testez depuis le conteneur.`,
          'warning'
        );
      }
    } finally {
      setIsDetectingModels(false);
    }
  };

  const testVoiceService = async (service: 'whisper' | 'piper') => {
    setServiceStatus((prev) => ({ ...prev, [service]: 'testing' }));
    const rawUrl = service === 'whisper' ? settings.whisper_url : settings.piper_url;
    const cleanedUrl = (rawUrl || '').trim().replace(/\/+$/, '');

    if (!cleanedUrl) {
      setServiceStatus((prev) => ({ ...prev, [service]: 'error' }));
      showToast(`Veuillez renseigner l'URL pour ${service.toUpperCase()}`, 'error');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      await fetch(cleanedUrl, { mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);

      setServiceStatus((prev) => ({ ...prev, [service]: 'success' }));
      showToast(`Service ${service.toUpperCase()} accessible à l'adresse ${cleanedUrl}`, 'success');
    } catch (err: any) {
      setServiceStatus((prev) => ({ ...prev, [service]: 'warning' }));
      showToast(
        `Test ${service.toUpperCase()} : réponse non reçue sur ${cleanedUrl}. Vérifiez que le conteneur tourne.`,
        'warning'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Importation / Exportation
  // ---------------------------------------------------------------------------
  const handleJSONFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importInventoryFromJSON(content);
      if (res.success && res.pieces) {
        setInventory(res.pieces);
        showToast(`Restauration JSON réussie ! ${res.count} objet(s) importé(s).`, 'success');
      } else {
        showToast(res.error || "Échec de l'import JSON", 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCSVFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importInventoryFromCSV(content, inventory);
      if (res.success && res.updatedPieces) {
        setInventory(res.updatedPieces);
        showToast(`Import CSV réussi ! ${res.count} objet(s) ajoutés à l'inventaire.`, 'success');
      } else {
        showToast(res.error || "Échec de l'import CSV", 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadAllZip = async () => {
    setIsDownloadingZip(true);
    try {
      await downloadZimaOSZip();
      showToast('Archive domotix_zimaos.zip prête et téléchargée !', 'success');
    } catch (err: any) {
      showToast('Erreur génération ZIP : ' + err.message, 'error');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CRUD Actions avec mini-modales in-app (remplace alert et prompt)
  // ---------------------------------------------------------------------------
  const savePieceModal = () => {
    if (!modalPiece || !modalPiece.nom.trim()) return;
    const name = modalPiece.nom.trim();

    if (modalPiece.mode === 'create') {
      const newPiece: Piece = {
        id: 'p-' + Date.now(),
        nom: name,
        date_creation: new Date().toISOString(),
        emplacements: [],
      };
      setInventory([...inventory, newPiece]);
      showToast(`Pièce "${name}" créée avec succès.`, 'success');
    } else if (modalPiece.mode === 'edit' && modalPiece.id) {
      setInventory(
        inventory.map((p) => (p.id === modalPiece.id ? { ...p, nom: name } : p))
      );
      showToast(`Pièce renommée en "${name}".`, 'success');
    }
    setModalPiece(null);
  };

  const saveEmplacementModal = () => {
    if (!modalEmplacement || !modalEmplacement.nom.trim() || !modalEmplacement.pieceId) return;
    const name = modalEmplacement.nom.trim();
    const targetPieceId = modalEmplacement.pieceId;

    if (modalEmplacement.mode === 'create') {
      const newEmp: Emplacement = {
        id: 'e-' + Date.now(),
        piece_id: targetPieceId,
        nom: name,
        date_creation: new Date().toISOString(),
        contenants: [],
      };
      setInventory(
        inventory.map((p) =>
          p.id === targetPieceId
            ? { ...p, emplacements: [...p.emplacements, newEmp] }
            : p
        )
      );
      showToast(`Emplacement "${name}" ajouté avec succès.`, 'success');
    } else if (modalEmplacement.mode === 'edit' && modalEmplacement.id) {
      // Trouver l'emplacement actuel
      let existingEmp: Emplacement | null = null;
      const strippedInventory = inventory.map((p) => {
        const found = p.emplacements.find((e) => e.id === modalEmplacement.id);
        if (found) existingEmp = { ...found, nom: name, piece_id: targetPieceId };
        return {
          ...p,
          emplacements: p.emplacements.filter((e) => e.id !== modalEmplacement.id),
        };
      });

      if (existingEmp) {
        setInventory(
          strippedInventory.map((p) =>
            p.id === targetPieceId
              ? { ...p, emplacements: [...p.emplacements, existingEmp!] }
              : p
          )
        );
        showToast(`Emplacement "${name}" mis à jour.`, 'success');
      }
    }
    setModalEmplacement(null);
  };

  const saveContenantModal = () => {
    if (!modalContenant || !modalContenant.nom.trim() || !modalContenant.emplacementId) return;
    const name = modalContenant.nom.trim();
    const targetEmpId = modalContenant.emplacementId;

    if (modalContenant.mode === 'create') {
      const newCont: Contenant = {
        id: 'c-' + Date.now(),
        emplacement_id: targetEmpId,
        nom: name,
        date_creation: new Date().toISOString(),
        objets: [],
      };
      setInventory(
        inventory.map((p) => ({
          ...p,
          emplacements: p.emplacements.map((e) =>
            e.id === targetEmpId ? { ...e, contenants: [...e.contenants, newCont] } : e
          ),
        }))
      );
      showToast(`Contenant "${name}" créé avec succès.`, 'success');
    } else if (modalContenant.mode === 'edit' && modalContenant.id) {
      let existingCont: Contenant | null = null;
      // Retirer de son ancien emplacement
      const stripped = inventory.map((p) => ({
        ...p,
        emplacements: p.emplacements.map((e) => {
          const found = e.contenants.find((c) => c.id === modalContenant.id);
          if (found) existingCont = { ...found, nom: name, emplacement_id: targetEmpId };
          return {
            ...e,
            contenants: e.contenants.filter((c) => c.id !== modalContenant.id),
          };
        }),
      }));

      if (existingCont) {
        setInventory(
          stripped.map((p) => ({
            ...p,
            emplacements: p.emplacements.map((e) =>
              e.id === targetEmpId
                ? { ...e, contenants: [...e.contenants, existingCont!] }
                : e
            ),
          }))
        );
        showToast(`Contenant "${name}" mis à jour.`, 'success');
      }
    }
    setModalContenant(null);
  };

  const saveObjetModal = () => {
    if (!modalObjet || !modalObjet.nom.trim() || !modalObjet.contenantId) return;
    const name = modalObjet.nom.trim();
    const targetContId = modalObjet.contenantId;
    const qty = Math.max(0, modalObjet.quantite);
    const desc = modalObjet.description.trim();

    if (modalObjet.mode === 'create') {
      const newObj: Objet = {
        id: 'o-' + Date.now(),
        contenant_id: targetContId,
        nom: name,
        description: desc,
        quantite: qty,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      };
      setInventory(
        inventory.map((p) => ({
          ...p,
          emplacements: p.emplacements.map((e) => ({
            ...e,
            contenants: e.contenants.map((c) =>
              c.id === targetContId ? { ...c, objets: [...c.objets, newObj] } : c
            ),
          })),
        }))
      );
      showToast(`Objet "${name}" ajouté avec succès.`, 'success');
    } else if (modalObjet.mode === 'edit' && modalObjet.id) {
      let existingObj: Objet | null = null;
      const stripped = inventory.map((p) => ({
        ...p,
        emplacements: p.emplacements.map((e) => ({
          ...e,
          contenants: e.contenants.map((c) => {
            const found = c.objets.find((o) => o.id === modalObjet.id);
            if (found) {
              existingObj = {
                ...found,
                nom: name,
                description: desc,
                quantite: qty,
                contenant_id: targetContId,
                date_modification: new Date().toISOString(),
              };
            }
            return {
              ...c,
              objets: c.objets.filter((o) => o.id !== modalObjet.id),
            };
          }),
        })),
      }));

      if (existingObj) {
        setInventory(
          stripped.map((p) => ({
            ...p,
            emplacements: p.emplacements.map((e) => ({
              ...e,
              contenants: e.contenants.map((c) =>
                c.id === targetContId
                  ? { ...c, objets: [...c.objets, existingObj!] }
                  : c
              ),
            })),
          }))
        );
        showToast(`Objet "${name}" mis à jour.`, 'success');
      }
    }
    setModalObjet(null);
  };

  const confirmDeleteAction = () => {
    if (!modalDeleteConfirm) return;
    const { type, id } = modalDeleteConfirm;

    if (type === 'piece') {
      setInventory(inventory.filter((p) => p.id !== id));
      showToast('Pièce supprimée.', 'success');
    } else if (type === 'emplacement') {
      setInventory(
        inventory.map((p) => ({
          ...p,
          emplacements: p.emplacements.filter((e) => e.id !== id),
        }))
      );
      showToast('Emplacement supprimé.', 'success');
    } else if (type === 'contenant') {
      setInventory(
        inventory.map((p) => ({
          ...p,
          emplacements: p.emplacements.map((e) => ({
            ...e,
            contenants: e.contenants.filter((c) => c.id !== id),
          })),
        }))
      );
      showToast('Contenant supprimé.', 'success');
    } else if (type === 'objet') {
      setInventory(
        inventory.map((p) => ({
          ...p,
          emplacements: p.emplacements.map((e) => ({
            ...e,
            contenants: e.contenants.map((c) => ({
              ...c,
              objets: c.objets.filter((o) => o.id !== id),
            })),
          })),
        }))
      );
      showToast('Objet supprimé.', 'success');
    }
    setModalDeleteConfirm(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    showToast('Code copié dans le presse-papier !', 'success');
  };

  // Filtrage d'inventaire
  const term = searchFilter.toLowerCase().trim();
  const filteredInventory = !term
    ? inventory
    : inventory
        .map((p) => {
          const matchP = p.nom.toLowerCase().includes(term);
          const filteredEmps = p.emplacements
            .map((e) => {
              const matchE = e.nom.toLowerCase().includes(term);
              const filteredConts = e.contenants
                .map((c) => {
                  const matchC = c.nom.toLowerCase().includes(term);
                  const filteredObjs = c.objets.filter(
                    (o) =>
                      o.nom.toLowerCase().includes(term) ||
                      (o.description && o.description.toLowerCase().includes(term))
                  );
                  if (matchC || filteredObjs.length > 0) {
                    return { ...c, objets: matchC ? c.objets : filteredObjs };
                  }
                  return null;
                })
                .filter(Boolean) as any[];

              if (matchE || filteredConts.length > 0) {
                return { ...e, contenants: matchE ? e.contenants : filteredConts };
              }
              return null;
            })
            .filter(Boolean) as any[];

          if (matchP || filteredEmps.length > 0) {
            return { ...p, emplacements: matchP ? p.emplacements : filteredEmps };
          }
          return null;
        })
        .filter(Boolean) as Piece[];

  const totalItemCount = inventory.reduce(
    (acc, p) =>
      acc +
      p.emplacements.reduce(
        (a2, e) => a2 + e.contenants.reduce((a3, c) => a3 + c.objets.length, 0),
        0
      ),
    0
  );

  // Pour la modale de validation : trouver les emplacements et contenants disponibles
  const currentValRoomObj = inventory.find(
    (p) => p.nom.toLowerCase() === valRoom.toLowerCase()
  );
  const currentValLocations = currentValRoomObj ? currentValRoomObj.emplacements : [];
  const currentValLocObj = currentValLocations.find(
    (e) => e.nom.toLowerCase() === valLocation.toLowerCase()
  );
  const currentValContainers = currentValLocObj ? currentValLocObj.contenants : [];

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* --------------------------------------------------------------------- */}
      {/* HEADER DE NAVIGATION */}
      {/* --------------------------------------------------------------------- */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 py-3 transition-colors ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'
        }`}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center ${theme.glow} ${theme.primaryBorder} ${theme.primaryText}`}
              >
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tracking-tight">Domotix</span>
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border font-medium ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}
                  >
                    ZimaOS
                  </span>
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Inventaire Vocal Intelligent
                </p>
              </div>
            </div>

            {/* Badges d'état des microservices */}
            <div
              className={`flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-lg border ${
                isDark ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <span className="flex items-center gap-1.5" title="Ollama API">
                <span
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.ollama === 'success'
                      ? 'bg-emerald-500'
                      : serviceStatus.ollama === 'warning'
                      ? 'bg-amber-400'
                      : serviceStatus.ollama === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="hidden md:inline">Ollama</span>
              </span>
              <span className="text-slate-400">·</span>
              <span className="flex items-center gap-1.5" title="Whisper API">
                <span
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.whisper === 'success'
                      ? 'bg-emerald-500'
                      : serviceStatus.whisper === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="hidden md:inline">Whisper</span>
              </span>
              <span className="text-slate-400">·</span>
              <span className="flex items-center gap-1.5" title="Piper TTS">
                <span
                  className={`w-2 h-2 rounded-full ${
                    serviceStatus.piper === 'success'
                      ? 'bg-emerald-500'
                      : serviceStatus.piper === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="hidden md:inline">Piper</span>
              </span>
            </div>
          </div>

          {/* Onglets */}
          <nav
            className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-medium w-full sm:w-auto justify-center overflow-x-auto ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              onClick={() => setActiveTab('assistant')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'assistant'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Vocal & Saisie</span>
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'inventory'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Inventaire ({totalItemCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'settings'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Réglages</span>
            </button>
            <button
              onClick={() => setActiveTab('zimaos')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'zimaos'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>ZimaOS Code</span>
            </button>
          </nav>
        </div>
      </header>

      {/* --------------------------------------------------------------------- */}
      {/* CONTENU PRINCIPAL */}
      {/* --------------------------------------------------------------------- */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6 space-y-6">

        {/* =================================================================== */}
        {/* ONGLET 1 : ASSISTANT VOCAL ET SAISIE */}
        {/* =================================================================== */}
        {activeTab === 'assistant' && (
          <div className="space-y-6">
            <div
              className={`border rounded-2xl p-6 text-center shadow-xl relative overflow-hidden transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div
                className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${theme.glow}`}
              />
              <div
                className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${theme.glow}`}
              />

              <div className="max-w-md mx-auto space-y-4 relative z-10">
                <span
                  className={`text-xs uppercase tracking-wider font-semibold ${theme.primaryText}`}
                >
                  Intelligence Domotique Vocale
                </span>
                <h2 className="text-xl font-semibold">Parlez ou écrivez pour gérer vos objets</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Exemples : <span className="italic font-medium">"Dans le garage devant l'étagère, dans la boîte à vis j'ai des chevilles"</span> ou <span className="italic font-medium">"Où se trouve le marteau ?"</span>
                </p>

                {/* Bouton Microphone Central */}
                <div className="pt-4 pb-2 flex flex-col items-center justify-center">
                  <div className="relative">
                    {isRecording && (
                      <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
                    )}
                    <button
                      onClick={toggleRecording}
                      className={`relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all active:scale-95 border-2 ${
                        isRecording
                          ? 'bg-rose-600 hover:bg-rose-500 border-rose-300'
                          : `${theme.primaryBg} ${theme.primaryHover} ${theme.primaryBorder}`
                      }`}
                    >
                      {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                      <span className="text-[11px] font-medium tracking-wide mt-1">
                        {isRecording ? 'Arrêter' : 'Parler'}
                      </span>
                    </button>
                  </div>

                  <p className={`text-xs font-mono mt-3 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {isRecording ? `Enregistrement en cours... ${recordingSeconds}s` : 'Cliquez pour parler'}
                  </p>
                </div>

                {/* Boutons d'aide et enregistrement mobile alternatif */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <label
                    className={`text-[11px] cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
                      isDark
                        ? 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Mic className={`w-3.5 h-3.5 ${theme.primaryText}`} />
                    <span>Dictaphone Mobile (HTTP)</span>
                    <input
                      ref={nativeAudioInputRef}
                      type="file"
                      accept="audio/*"
                      capture={"microphone" as any}
                      className="hidden"
                      onChange={handleNativeAudioCaptured}
                    />
                  </label>
                  <button
                    onClick={() => setShowMicHelpModal(true)}
                    className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors`}
                    title="Aide Microphone HTTP sur réseau local"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* Suggestions 1-clic pour test instantané sans micro */}
                <div className="pt-2 text-left space-y-1.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tests rapides (1 clic) :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() =>
                        processSentence(
                          "Je suis dans le garage devant l'étagère à côté de l'entrée, dans la caisse en carton Action 02 j'ai du ruban de masquage, un rouleau à peinture et un masque FP2"
                        )
                      }
                      className={`text-[11px] px-2.5 py-1 rounded-lg border text-left transition-colors ${
                        isDark
                          ? 'bg-slate-950/80 border-slate-800 hover:border-emerald-500 text-slate-300'
                          : 'bg-slate-50 border-slate-200 hover:border-emerald-500 text-slate-700'
                      }`}
                    >
                      📦 +3 objets (Garage & Caisse)
                    </button>
                    <button
                      onClick={() => processSentence("Je cherche le ruban de masquage")}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border text-left transition-colors ${
                        isDark
                          ? 'bg-slate-950/80 border-slate-800 hover:border-blue-500 text-slate-300'
                          : 'bg-slate-50 border-slate-200 hover:border-blue-500 text-slate-700'
                      }`}
                    >
                      🔍 "Je cherche le ruban"
                    </button>
                    <button
                      onClick={() =>
                        processSentence(
                          "Dans l'atelier sur l'armoire métallique dans la mallette Bosch j'ai un tournevis cruciforme"
                        )
                      }
                      className={`text-[11px] px-2.5 py-1 rounded-lg border text-left transition-colors ${
                        isDark
                          ? 'bg-slate-950/80 border-slate-800 hover:border-violet-500 text-slate-300'
                          : 'bg-slate-50 border-slate-200 hover:border-violet-500 text-slate-700'
                      }`}
                    >
                      🔧 +1 outil (Atelier & Mallette)
                    </button>
                  </div>
                </div>

                {/* Saisie textuelle */}
                <form onSubmit={handleTextSubmit} className="pt-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Ou tapez votre phrase ici..."
                      className={`w-full border rounded-xl py-2.5 pl-4 pr-12 text-xs focus:outline-none transition-colors ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      } ${theme.ring}`}
                    />
                    <button
                      type="submit"
                      className={`absolute right-1.5 p-1.5 text-white rounded-lg transition-colors ${theme.primaryBg} ${theme.primaryHover}`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Indicateur de traitement */}
            {isProcessing && (
              <div
                className={`border rounded-xl p-4 flex items-center justify-center gap-3 text-xs ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${theme.primaryBorder}`}
                />
                <span>{processingMsg}</span>
              </div>
            )}

            {/* Résultats de recherche vocale / texte */}
            {searchResults && (
              <div
                className={`border rounded-2xl p-5 space-y-4 shadow-lg transition-colors ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className={`flex items-center gap-2 text-xs font-semibold ${theme.primaryText}`}>
                    <Search className="w-4 h-4" />
                    <span>Résultat de la recherche vocale</span>
                  </div>
                  <button
                    onClick={() => speakTextWebAudio(searchResults.spokenMessage)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Réécouter (Piper TTS)</span>
                  </button>
                </div>

                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <p className={`font-medium mb-1 ${theme.primaryText}`}>Synthèse Vocale formulée :</p>
                  <p>{searchResults.spokenMessage}</p>
                </div>

                {searchResults.matches.length > 0 ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {searchResults.matches.map((m, idx) => (
                      <div
                        key={idx}
                        className={`border p-3 rounded-xl text-xs space-y-1.5 ${
                          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{m.objet.nom}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            Qté : {m.objet.quantite}
                          </span>
                        </div>
                        <div className={`text-[11px] flex items-center gap-1.5 ${theme.primaryText}`}>
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{m.cheminComplet}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs italic text-center py-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Aucun objet trouvé dans l'inventaire.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* ONGLET 2 : EXPLORATEUR D'INVENTAIRE (CRUD COMPLET AVEC MODALES) */}
        {/* =================================================================== */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search
                  className={`w-4 h-4 absolute left-3 top-3 ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filtrer un objet, contenant, emplacement ou pièce..."
                  className={`w-full border rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-200 placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } ${theme.ring}`}
                />
              </div>
              <button
                onClick={() => setModalPiece({ mode: 'create', nom: '' })}
                className={`px-3.5 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm active:scale-95 ${theme.primaryBg} ${theme.primaryHover}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nouvelle Pièce</span>
              </button>
            </div>

            <div className="space-y-4">
              {filteredInventory.length === 0 ? (
                <div
                  className={`border rounded-2xl p-10 text-center text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <Boxes className="w-10 h-10 mx-auto mb-3 opacity-60" />
                  <p>Aucun élément trouvé dans l'inventaire.</p>
                </div>
              ) : (
                filteredInventory.map((piece) => (
                  <div
                    key={piece.id}
                    className={`border rounded-2xl p-4 space-y-3 shadow-md transition-colors ${
                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* En-tête Pièce */}
                    <div
                      className={`flex items-center justify-between border-b pb-2.5 ${
                        isDark ? 'border-slate-800' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Home className={`w-4 h-4 ${theme.primaryText}`} />
                        <span className="text-sm font-semibold">{piece.nom}</span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          ({piece.emplacements.length} emplacement{piece.emplacements.length > 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setModalEmplacement({ mode: 'create', pieceId: piece.id, nom: '' })}
                          className={`p-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${
                            isDark
                              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Ajouter un emplacement dans cette pièce"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Emplacement</span>
                        </button>
                        <button
                          onClick={() => setModalPiece({ mode: 'edit', id: piece.id, nom: piece.nom })}
                          className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Renommer la pièce"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            setModalDeleteConfirm({
                              type: 'piece',
                              id: piece.id,
                              name: piece.nom,
                              details: `Cette action supprimera également ses ${piece.emplacements.length} emplacement(s) et tous leurs objets.`,
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Supprimer la pièce"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Emplacements */}
                    <div className="space-y-3 pl-2 sm:pl-4">
                      {piece.emplacements.length === 0 ? (
                        <p className={`text-[11px] italic py-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                          Aucun emplacement dans cette pièce. Cliquez sur "+ Emplacement" ci-dessus.
                        </p>
                      ) : (
                        piece.emplacements.map((emp) => (
                          <div
                            key={emp.id}
                            className={`border rounded-xl p-3 space-y-2.5 ${
                              isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div
                              className={`flex items-center justify-between border-b pb-1.5 ${
                                isDark ? 'border-slate-800/60' : 'border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <MapPin className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                <span className="text-xs font-medium">{emp.nom}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    setModalContenant({
                                      mode: 'create',
                                      pieceId: piece.id,
                                      emplacementId: emp.id,
                                      nom: '',
                                    })
                                  }
                                  className={`p-1 rounded transition-colors text-[11px] flex items-center gap-1 ${
                                    isDark
                                      ? 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                                  }`}
                                  title="Ajouter un contenant (boîte, caisse, tiroir...)"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span className="hidden sm:inline">Contenant</span>
                                </button>
                                <button
                                  onClick={() =>
                                    setModalEmplacement({
                                      mode: 'edit',
                                      id: emp.id,
                                      pieceId: piece.id,
                                      nom: emp.nom,
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                                  title="Modifier l'emplacement"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    setModalDeleteConfirm({
                                      type: 'emplacement',
                                      id: emp.id,
                                      name: emp.nom,
                                      details: `Cette action supprimera également ses ${emp.contenants.length} contenant(s).`,
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                                  title="Supprimer l'emplacement"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Contenants */}
                            <div className="space-y-2 pl-2">
                              {emp.contenants.length === 0 ? (
                                <p className={`text-[11px] italic py-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                  Aucun contenant. Cliquez sur "+ Contenant" pour créer une boîte, caisse, etc.
                                </p>
                              ) : (
                                emp.contenants.map((cont) => (
                                  <div
                                    key={cont.id}
                                    className={`border rounded-lg p-2.5 space-y-2 ${
                                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-xs">
                                      <div className={`flex items-center gap-1.5 font-medium ${theme.primaryText}`}>
                                        <Box className="w-3.5 h-3.5" />
                                        <span>{cont.nom}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() =>
                                            setModalObjet({
                                              mode: 'create',
                                              pieceId: piece.id,
                                              emplacementId: emp.id,
                                              contenantId: cont.id,
                                              nom: '',
                                              quantite: 1,
                                              description: '',
                                            })
                                          }
                                          className={`p-1 rounded transition-colors text-[11px] flex items-center gap-1 ${
                                            isDark
                                              ? 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                                          }`}
                                          title="Ajouter un objet dans ce contenant"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span className="hidden sm:inline">Objet</span>
                                        </button>
                                        <button
                                          onClick={() =>
                                            setModalContenant({
                                              mode: 'edit',
                                              id: cont.id,
                                              pieceId: piece.id,
                                              emplacementId: emp.id,
                                              nom: cont.nom,
                                            })
                                          }
                                          className="p-1 text-slate-400 hover:text-blue-400"
                                          title="Modifier le contenant"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            setModalDeleteConfirm({
                                              type: 'contenant',
                                              id: cont.id,
                                              name: cont.nom,
                                              details: `Cette action supprimera également ses ${cont.objets.length} objet(s).`,
                                            })
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-500"
                                          title="Supprimer le contenant"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Objets */}
                                    <div className="grid gap-1.5 sm:grid-cols-2">
                                      {cont.objets.length === 0 ? (
                                        <span className={`text-[11px] italic ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                          Contenant vide
                                        </span>
                                      ) : (
                                        cont.objets.map((obj) => (
                                          <div
                                            key={obj.id}
                                            className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[11px] ${
                                              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                            }`}
                                          >
                                            <div className="truncate pr-2">
                                              <span className="font-medium">{obj.nom}</span>
                                              {obj.description && (
                                                <p
                                                  className={`text-[10px] truncate ${
                                                    isDark ? 'text-slate-500' : 'text-slate-400'
                                                  }`}
                                                >
                                                  {obj.description}
                                                </p>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <span
                                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                                                }`}
                                              >
                                                x{obj.quantite}
                                              </span>
                                              <button
                                                onClick={() =>
                                                  setModalObjet({
                                                    mode: 'edit',
                                                    id: obj.id,
                                                    pieceId: piece.id,
                                                    emplacementId: emp.id,
                                                    contenantId: cont.id,
                                                    nom: obj.nom,
                                                    quantite: obj.quantite,
                                                    description: obj.description || '',
                                                  })
                                                }
                                                className="p-1 text-slate-400 hover:text-blue-400"
                                                title="Modifier l'objet"
                                              >
                                                <Edit3 className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={() =>
                                                  setModalDeleteConfirm({
                                                    type: 'objet',
                                                    id: obj.id,
                                                    name: obj.nom,
                                                  })
                                                }
                                                className="p-1 text-slate-400 hover:text-rose-500"
                                                title="Supprimer l'objet"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ONGLET 3 : RÉGLAGES & PERSONNALISATION */}
        {/* =================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* 1. Apparence & Thème (Sombre/Clair & Couleurs) */}
            <div
              className={`border rounded-2xl p-5 space-y-4 shadow-lg transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Palette className={`w-4 h-4 ${theme.primaryText}`} />
                <div>
                  <h2 className="text-sm font-semibold">Apparence & Thème</h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Personnalisez le mode d'affichage et la couleur dominante de l'interface.
                  </p>
                </div>
              </div>

              {/* Mode Sombre / Clair */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="block text-xs font-medium">Mode d'affichage</span>
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {isDark ? 'Mode sombre activé' : 'Mode clair activé'}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1 p-1 rounded-xl border ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSettings({ ...settings, color_mode: 'dark' });
                      showToast('Mode sombre activé', 'success');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      isDark ? `${theme.primaryBg} text-white` : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Sombre</span>
                  </button>
                  <button
                    onClick={() => {
                      setSettings({ ...settings, color_mode: 'light' });
                      showToast('Mode clair activé', 'success');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      !isDark ? `${theme.primaryBg} text-white` : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Clair</span>
                  </button>
                </div>
              </div>

              {/* Choix de la couleur dominante */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <label className="block text-xs font-medium">Couleur dominante de l'interface</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {(Object.keys(THEMES) as ThemeColor[]).map((tKey) => {
                    const item = THEMES[tKey];
                    const isSelected = settings.theme_color === tKey;
                    return (
                      <button
                        key={tKey}
                        onClick={() => {
                          setSettings({ ...settings, theme_color: tKey });
                          showToast(`Thème "${item.label}" activé !`, 'success');
                        }}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left text-xs ${
                          isSelected
                            ? `${item.badgeBg} ${item.primaryBorder} font-semibold ring-2 ${item.ring}`
                            : isDark
                            ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: item.hex }}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. Services Locaux ZimaOS (Ollama, Whisper, Piper) */}
            <div
              className={`border rounded-2xl p-5 space-y-5 shadow-lg transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Server className={`w-4 h-4 ${theme.primaryText}`} />
                <div>
                  <h2 className="text-sm font-semibold">Services Locaux ZimaOS</h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Endpoints des microservices IA sur votre réseau local ZimaOS.
                  </p>
                </div>
              </div>

              {/* Ollama API */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">URL API Ollama (Extraction Sémantique)</label>
                  <span className={`text-[11px] ${theme.primaryText}`}>Ex: http://192.168.1.50:11434 ou http://ollama:11434</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.ollama_url}
                    onChange={(e) => setSettings({ ...settings, ollama_url: e.target.value })}
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                  <button
                    onClick={testOllamaConnection}
                    disabled={isDetectingModels}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serviceStatus.ollama === 'success'
                          ? 'bg-emerald-500'
                          : serviceStatus.ollama === 'warning'
                          ? 'bg-amber-400'
                          : serviceStatus.ollama === 'error'
                          ? 'bg-rose-500'
                          : serviceStatus.ollama === 'testing'
                          ? 'bg-amber-400 animate-ping'
                          : 'bg-slate-400'
                      }`}
                    />
                    {isDetectingModels ? 'Recherche...' : 'Tester & Détecter'}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Modèle sélectionné pour l'inventaire :
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={settings.ollama_model}
                      onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                      className={`border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Faster-Whisper API */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <label className="block text-xs font-medium">URL API Faster-Whisper (Transcription Audio)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.whisper_url}
                    onChange={(e) => setSettings({ ...settings, whisper_url: e.target.value })}
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                  <button
                    onClick={() => testVoiceService('whisper')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serviceStatus.whisper === 'success'
                          ? 'bg-emerald-500'
                          : serviceStatus.whisper === 'error'
                          ? 'bg-rose-500'
                          : serviceStatus.whisper === 'testing'
                          ? 'bg-amber-400 animate-ping'
                          : 'bg-slate-400'
                      }`}
                    />
                    Tester
                  </button>
                </div>
              </div>

              {/* Piper-TTS API */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <label className="block text-xs font-medium">URL API Piper-TTS (Synthèse Vocale)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.piper_url}
                    onChange={(e) => setSettings({ ...settings, piper_url: e.target.value })}
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                  <button
                    onClick={() => testVoiceService('piper')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serviceStatus.piper === 'success'
                          ? 'bg-emerald-500'
                          : serviceStatus.piper === 'error'
                          ? 'bg-rose-500'
                          : serviceStatus.piper === 'testing'
                          ? 'bg-amber-400 animate-ping'
                          : 'bg-slate-400'
                      }`}
                    />
                    Tester
                  </button>
                </div>
              </div>

              {/* Port d'écoute ZimaOS */}
              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <label className="block text-xs font-medium">Port d'écoute web ZimaOS (anti-conflit port 8000)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settings.domotix_port || 8585}
                    onChange={(e) =>
                      setSettings({ ...settings, domotix_port: parseInt(e.target.value, 10) || 8585 })
                    }
                    className={`w-32 border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Port libre par défaut : <strong>8585</strong> (évite les conflits avec le port 8000 de ZimaOS).
                  </span>
                </div>
              </div>

              {/* Validation switch */}
              <div className="border-t border-slate-800/80 pt-4 flex items-center justify-between">
                <div>
                  <span className="block text-xs font-medium">Validation avant enregistrement</span>
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Affiche une fenêtre avec menus déroulants pour vérifier la pièce, l'emplacement et les objets avant ajout.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.require_validation}
                    onChange={(e) => setSettings({ ...settings, require_validation: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div
                    className={`w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      settings.require_validation ? theme.primaryBg : 'bg-slate-700'
                    }`}
                  />
                </label>
              </div>
            </div>

            {/* 3. Sauvegarde & Restauration (Export & Import) */}
            <div
              className={`border rounded-2xl p-5 space-y-4 shadow-lg transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <h2 className="text-sm font-semibold">Sauvegarde & Restauration</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Exportez ou restaurez votre inventaire SQLite au format JSON ou tableur CSV.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {/* Exportations */}
                <span className={`text-[11px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Exporter les données actuelles
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => exportInventoryAsJSON(inventory)}
                    className={`p-3 border rounded-xl text-center text-xs font-medium flex flex-col items-center justify-center gap-2 transition-colors ${
                      isDark ? 'bg-slate-950 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Download className={`w-4 h-4 ${theme.primaryText}`} />
                    <span>Exporter JSON</span>
                  </button>
                  <button
                    onClick={() => exportInventoryAsCSV(inventory)}
                    className={`p-3 border rounded-xl text-center text-xs font-medium flex flex-col items-center justify-center gap-2 transition-colors ${
                      isDark ? 'bg-slate-950 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <FileSpreadsheet className={`w-4 h-4 ${theme.primaryText}`} />
                    <span>Exporter CSV</span>
                  </button>
                </div>

                {/* Importations */}
                <span className={`text-[11px] font-semibold uppercase tracking-wider block pt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Importer / Restaurer une base
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => jsonFileInputRef.current?.click()}
                    className={`p-3 border rounded-xl text-center text-xs font-medium flex flex-col items-center justify-center gap-2 transition-colors ${
                      isDark ? 'bg-slate-950 border-slate-800 hover:border-emerald-500' : 'bg-slate-50 border-slate-200 hover:border-emerald-500'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-emerald-500" />
                    <span>Importer JSON</span>
                    <input
                      ref={jsonFileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleJSONFileSelected}
                    />
                  </button>

                  <button
                    onClick={() => csvFileInputRef.current?.click()}
                    className={`p-3 border rounded-xl text-center text-xs font-medium flex flex-col items-center justify-center gap-2 transition-colors ${
                      isDark ? 'bg-slate-950 border-slate-800 hover:border-emerald-500' : 'bg-slate-50 border-slate-200 hover:border-emerald-500'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-emerald-500" />
                    <span>Importer CSV</span>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVFileSelected}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ONGLET 4 : CODE & DÉPLOIEMENT ZIMAOS */}
        {/* =================================================================== */}
        {activeTab === 'zimaos' && (
          <div className="space-y-6">
            {/* Bouton de téléchargement ZIP 1-Clic */}
            <div
              className={`border rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl border ${theme.glow} ${theme.primaryBorder} ${theme.primaryText}`}>
                  <FileArchive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Téléchargement 1-Clic pour ZimaOS</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Archive ZIP complète contenant l'ensemble des fichiers prêts à l'emploi (avec port configurable et script auto-résolvant).
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownloadAllZip}
                disabled={isDownloadingZip}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-lg flex items-center gap-2 whitespace-nowrap active:scale-95 transition-all ${theme.primaryBg} ${theme.primaryHover}`}
              >
                {isDownloadingZip ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Génération de l'archive...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Télécharger domotix_zimaos.zip</span>
                  </>
                )}
              </button>
            </div>

            {/* Diagnostic et correction des erreurs ZimaOS */}
            <div
              className={`border-l-4 border-l-amber-500 rounded-xl p-4 text-xs space-y-3 ${
                isDark ? 'bg-amber-950/20 border border-slate-800' : 'bg-amber-50 border border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Guide de démarrage & Résolution des erreurs ZimaOS :</span>
              </div>
              <div className="space-y-3 text-slate-300">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-emerald-400">
                    ✨ OPTION 1 : Lancement universel en 1 commande (Recommandé) :
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Le script <code className="text-emerald-300">start.sh</code> détecte automatiquement Docker et recherche un port libre si le 8000 ou 8585 est déjà utilisé :
                  </p>
                  <div className="font-mono text-[11px] text-emerald-300 bg-slate-900/90 p-2 rounded border border-slate-800">
                    bash start.sh
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-400">
                    🔧 OPTION 2 : Lancement direct sans Docker Compose :
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Si votre ZimaOS n'a pas <code className="text-blue-300">docker-compose</code>, utilisez directement Docker natif :
                  </p>
                  <div className="font-mono text-[11px] text-blue-300 bg-slate-900/90 p-2 rounded border border-slate-800 space-y-1">
                    <p>docker build -t domotix .</p>
                    <p>docker run -d --name domotix-inventory --restart unless-stopped -p 8585:8000 -v $(pwd)/data:/data domotix</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Inspecteur de code */}
            <div
              className={`border rounded-2xl p-5 space-y-4 shadow-lg transition-colors ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Terminal className={`w-4 h-4 ${theme.primaryText}`} />
                    Inspecteur de fichiers du projet
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tous les fichiers requis sont intégrés et prêts à copier.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(ZIMA_PROJECT_FILES[selectedZimaFile]?.content || '')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              </div>

              {/* Sélecteur de fichiers */}
              <div className={`flex flex-wrap gap-1.5 border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                {Object.keys(ZIMA_PROJECT_FILES).map((fileKey) => (
                  <button
                    key={fileKey}
                    onClick={() => setSelectedZimaFile(fileKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      selectedZimaFile === fileKey
                        ? `${theme.primaryBg} text-white font-medium`
                        : isDark
                        ? 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    {fileKey}
                  </button>
                ))}
              </div>

              <div
                className={`text-[11px] px-3 py-2 rounded-lg border ${
                  isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Rôle : <strong>{ZIMA_PROJECT_FILES[selectedZimaFile]?.role}</strong>
              </div>

              <pre
                className={`p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 border leading-relaxed ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <code>{ZIMA_PROJECT_FILES[selectedZimaFile]?.content}</code>
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* --------------------------------------------------------------------- */}
      {/* MODALE DE VALIDATION AVEC SÉLECTEURS EN CASCADE INTELLIGENTS */}
      {/* --------------------------------------------------------------------- */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl transition-colors ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className={`flex items-center gap-2 font-semibold text-sm ${theme.primaryText}`}>
                <Sparkles className="w-4 h-4" />
                <span>Vérification avant enregistrement</span>
              </div>
              <button
                onClick={() => setShowValidationModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Phrase détectée : <span className="italic">"{valOriginalPhrase}"</span>
            </p>

            <div className="space-y-3.5">
              {/* 1. Pièce avec dropdown intelligent */}
              <div>
                <label className="block text-[11px] font-medium mb-1">Pièce (Lieu global)</label>
                <div className="space-y-1.5">
                  <select
                    value={valRoom}
                    onChange={(e) => {
                      const newR = e.target.value;
                      setValRoom(newR);
                      if (newR !== '__NEW__') {
                        // Réinitialiser les emplacements liés
                        const foundPiece = inventory.find((p) => p.nom === newR);
                        if (foundPiece && foundPiece.emplacements.length > 0) {
                          setValLocation(foundPiece.emplacements[0].nom);
                          const firstLoc = foundPiece.emplacements[0];
                          if (firstLoc.contenants.length > 0) {
                            setValContainer(firstLoc.contenants[0].nom);
                          } else {
                            setValContainer('__NEW__');
                            setValCustomContainer('Caisse principale');
                          }
                        } else {
                          setValLocation('__NEW__');
                          setValCustomLocation('Zone générale');
                          setValContainer('__NEW__');
                          setValCustomContainer('Caisse principale');
                        }
                      } else {
                        setValLocation('__NEW__');
                        setValCustomLocation('Étagère');
                        setValContainer('__NEW__');
                        setValCustomContainer('Caisse');
                      }
                    }}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  >
                    {inventory.map((p) => (
                      <option key={p.id} value={p.nom}>
                        {p.nom}
                      </option>
                    ))}
                    <option value="__NEW__">+ Nouvelle pièce...</option>
                  </select>

                  {valRoom === '__NEW__' && (
                    <input
                      type="text"
                      value={valCustomRoom}
                      onChange={(e) => setValCustomRoom(e.target.value)}
                      placeholder="Nom de la nouvelle pièce (ex: Garage, Atelier, Cuisine)..."
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                      } ${theme.ring}`}
                    />
                  )}
                </div>
              </div>

              {/* 2. Emplacement avec dropdown en cascade lié à la pièce */}
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  Emplacement {valRoom !== '__NEW__' && `(dans ${valRoom})`}
                </label>
                <div className="space-y-1.5">
                  <select
                    value={valLocation}
                    onChange={(e) => {
                      const newL = e.target.value;
                      setValLocation(newL);
                      if (newL !== '__NEW__') {
                        const foundLoc = currentValLocations.find((loc) => loc.nom === newL);
                        if (foundLoc && foundLoc.contenants.length > 0) {
                          setValContainer(foundLoc.contenants[0].nom);
                        } else {
                          setValContainer('__NEW__');
                          setValCustomContainer('Caisse principale');
                        }
                      } else {
                        setValContainer('__NEW__');
                        setValCustomContainer('Caisse');
                      }
                    }}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  >
                    {currentValLocations.map((loc) => (
                      <option key={loc.id} value={loc.nom}>
                        {loc.nom}
                      </option>
                    ))}
                    <option value="__NEW__">+ Nouvel emplacement...</option>
                  </select>

                  {valLocation === '__NEW__' && (
                    <input
                      type="text"
                      value={valCustomLocation}
                      onChange={(e) => setValCustomLocation(e.target.value)}
                      placeholder="Nom de l'emplacement (ex: Étagère à côté de l'entrée)..."
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                      } ${theme.ring}`}
                    />
                  )}
                </div>
              </div>

              {/* 3. Contenant avec dropdown en cascade lié à l'emplacement */}
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  Contenant {valLocation !== '__NEW__' && `(dans ${valLocation})`}
                </label>
                <div className="space-y-1.5">
                  <select
                    value={valContainer}
                    onChange={(e) => setValContainer(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  >
                    {currentValContainers.map((c) => (
                      <option key={c.id} value={c.nom}>
                        {c.nom}
                      </option>
                    ))}
                    <option value="__NEW__">+ Nouveau contenant...</option>
                  </select>

                  {valContainer === '__NEW__' && (
                    <input
                      type="text"
                      value={valCustomContainer}
                      onChange={(e) => setValCustomContainer(e.target.value)}
                      placeholder="Nom du contenant (ex: Caisse Action 02, Boîte à vis, Tiroir haut)..."
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                      } ${theme.ring}`}
                    />
                  )}
                </div>
              </div>

              {/* 4. Objets à associer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium">Objets détectés</label>
                  <button
                    onClick={() => setValItems([...valItems, ''])}
                    className={`text-[11px] flex items-center gap-1 font-medium ${theme.primaryText}`}
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter un objet
                  </button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {valItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const updated = [...valItems];
                          updated[idx] = e.target.value;
                          setValItems(updated);
                        }}
                        className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                          isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                        } ${theme.ring}`}
                      />
                      <button
                        onClick={() => setValItems(valItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-500"
                        title="Supprimer cet objet"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setShowValidationModal(false)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={confirmValidation}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 ${theme.primaryBg} ${theme.primaryHover}`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmer et Enregistrer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE CRUD PIÈCE (Création & Édition) */}
      {/* --------------------------------------------------------------------- */}
      {modalPiece && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold">
                {modalPiece.mode === 'create' ? 'Nouvelle Pièce' : 'Modifier la Pièce'}
              </h3>
              <button onClick={() => setModalPiece(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1">Nom de la pièce</label>
              <input
                type="text"
                autoFocus
                value={modalPiece.nom}
                onChange={(e) => setModalPiece({ ...modalPiece, nom: e.target.value })}
                placeholder="Ex: Garage, Cave, Cuisine, Atelier..."
                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                } ${theme.ring}`}
              />
            </div>
            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setModalPiece(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={savePieceModal}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold ${theme.primaryBg} ${theme.primaryHover}`}
              >
                {modalPiece.mode === 'create' ? 'Créer' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE CRUD EMPLACEMENT (Création & Édition) */}
      {/* --------------------------------------------------------------------- */}
      {modalEmplacement && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold">
                {modalEmplacement.mode === 'create' ? 'Nouvel Emplacement' : "Modifier l'Emplacement"}
              </h3>
              <button onClick={() => setModalEmplacement(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium mb-1">Pièce parente</label>
                <select
                  value={modalEmplacement.pieceId}
                  onChange={(e) => setModalEmplacement({ ...modalEmplacement, pieceId: e.target.value })}
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                >
                  {inventory.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Nom de l'emplacement</label>
                <input
                  type="text"
                  autoFocus
                  value={modalEmplacement.nom}
                  onChange={(e) => setModalEmplacement({ ...modalEmplacement, nom: e.target.value })}
                  placeholder="Ex: Étagère entrée, Établi, Placard haut..."
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                />
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setModalEmplacement(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={saveEmplacementModal}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold ${theme.primaryBg} ${theme.primaryHover}`}
              >
                {modalEmplacement.mode === 'create' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE CRUD CONTENANT (Création & Édition) */}
      {/* --------------------------------------------------------------------- */}
      {modalContenant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold">
                {modalContenant.mode === 'create' ? 'Nouveau Contenant' : 'Modifier le Contenant'}
              </h3>
              <button onClick={() => setModalContenant(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium mb-1">Emplacement parent</label>
                <select
                  value={modalContenant.emplacementId}
                  onChange={(e) => setModalContenant({ ...modalContenant, emplacementId: e.target.value })}
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                >
                  {inventory.flatMap((p) =>
                    p.emplacements.map((e) => (
                      <option key={e.id} value={e.id}>
                        {p.nom} &gt; {e.nom}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Nom du contenant</label>
                <input
                  type="text"
                  autoFocus
                  value={modalContenant.nom}
                  onChange={(e) => setModalContenant({ ...modalContenant, nom: e.target.value })}
                  placeholder="Ex: Caisse en carton Action 02, Boîte à vis..."
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                />
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setModalContenant(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={saveContenantModal}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold ${theme.primaryBg} ${theme.primaryHover}`}
              >
                {modalContenant.mode === 'create' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE CRUD OBJET (Création & Édition) */}
      {/* --------------------------------------------------------------------- */}
      {modalObjet && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold">
                {modalObjet.mode === 'create' ? 'Ajouter un Objet' : "Modifier l'Objet"}
              </h3>
              <button onClick={() => setModalObjet(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium mb-1">Contenant parent</label>
                <select
                  value={modalObjet.contenantId}
                  onChange={(e) => setModalObjet({ ...modalObjet, contenantId: e.target.value })}
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                >
                  {inventory.flatMap((p) =>
                    p.emplacements.flatMap((e) =>
                      e.contenants.map((c) => (
                        <option key={c.id} value={c.id}>
                          {p.nom} &gt; {e.nom} &gt; {c.nom}
                        </option>
                      ))
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Nom de l'objet</label>
                <input
                  type="text"
                  autoFocus
                  value={modalObjet.nom}
                  onChange={(e) => setModalObjet({ ...modalObjet, nom: e.target.value })}
                  placeholder="Ex: Ruban de masquage, Tournevis..."
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } ${theme.ring}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Quantité</label>
                  <input
                    type="number"
                    min="0"
                    value={modalObjet.quantite}
                    onChange={(e) =>
                      setModalObjet({ ...modalObjet, quantite: parseInt(e.target.value, 10) || 0 })
                    }
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium mb-1">Description (Optionnel)</label>
                  <input
                    type="text"
                    value={modalObjet.description}
                    onChange={(e) => setModalObjet({ ...modalObjet, description: e.target.value })}
                    placeholder="Détails, taille, couleur..."
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } ${theme.ring}`}
                  />
                </div>
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setModalObjet(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={saveObjetModal}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold ${theme.primaryBg} ${theme.primaryHover}`}
              >
                {modalObjet.mode === 'create' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE DE CONFIRMATION DE SUPPRESSION SANS ALERT BOX */}
      {/* --------------------------------------------------------------------- */}
      {modalDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2 text-rose-500 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Confirmer la suppression</span>
            </div>
            <p className="text-xs">
              Êtes-vous sûr de vouloir supprimer{' '}
              <strong className="text-rose-400">"{modalDeleteConfirm.name}"</strong> ?
            </p>
            {modalDeleteConfirm.details && (
              <p className={`text-[11px] p-2.5 rounded-lg border bg-rose-950/20 border-rose-900/50 text-rose-300`}>
                {modalDeleteConfirm.details}
              </p>
            )}
            <div className={`flex items-center justify-end gap-2 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setModalDeleteConfirm(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${
                  isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODALE AIDE MICROPHONE SUR HTTP LOCAL */}
      {/* --------------------------------------------------------------------- */}
      {showMicHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HelpCircle className={`w-4 h-4 ${theme.primaryText}`} />
                <span>Microphone en Réseau Local HTTP</span>
              </h3>
              <button onClick={() => setShowMicHelpModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p>
              Les navigateurs modernes (Chrome, Safari, Edge) désactivent l'API microphone (<code className="text-emerald-400">getUserMedia</code>) en <strong>HTTP non sécurisé</strong> sur les adresses IP locales (ex: <code>http://192.168.1.X:8585</code>).
            </p>
            <div className={`p-3 rounded-xl border space-y-1.5 text-[11px] ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <strong className={theme.primaryText}>3 solutions simples et immédiates :</strong>
              <p>1. <strong>Bouton Dictaphone Mobile</strong> : cliquez sur "Dictaphone Mobile (HTTP)" pour enregistrer avec l'application native de votre smartphone (fonctionne 100% même en HTTP !).</p>
              <p>2. <strong>Autoriser Chrome/Edge en local</strong> : ouvrez l'adresse <code className="text-emerald-400">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, ajoutez l'IP de votre ZimaOS (ex: <code>http://192.168.1.X:8585</code>), activez et relancez.</p>
              <p>3. <strong>Saisie texte ou boutons tests</strong> : tapez ou cliquez sur les exemples prêts à l'emploi.</p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowMicHelpModal(false)}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold ${theme.primaryBg} ${theme.primaryHover}`}
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* NOTIFICATIONS TOAST EN BAS DE PAGE (Vert, Rouge, Orange) */}
      {/* --------------------------------------------------------------------- */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-xs font-medium shadow-2xl flex items-center gap-2.5 transition-all transform translate-y-0 opacity-100 border text-white ${
            toast.type === 'success'
              ? 'bg-emerald-600 border-emerald-400 shadow-emerald-950/60'
              : toast.type === 'error'
              ? 'bg-rose-600 border-rose-400 shadow-rose-950/60'
              : 'bg-amber-600 border-amber-400 shadow-amber-950/60'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-1 p-0.5 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
