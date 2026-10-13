import JSZip from 'jszip';
import { ZIMA_PROJECT_FILES } from '../data/zimaFiles';

export async function generateZimaOSZip(): Promise<Blob> {
  const zip = new JSZip();

  // Ajout des fichiers avec l'arborescence exacte
  for (const [key, fileInfo] of Object.entries(ZIMA_PROJECT_FILES)) {
    if (key === 'templates/index.html') {
      // Créer le sous-dossier templates/
      zip.folder('templates')?.file('index.html', fileInfo.content);
    } else {
      zip.file(fileInfo.filename, fileInfo.content);
    }
  }

  // Ajout d'un fichier .env.example prêt à l'emploi
  zip.file(
    '.env.example',
    `# Configuration Domotix ZimaOS
OLLAMA_URL=http://ollama:11434
WHISPER_URL=http://faster-whisper:9000
PIPER_URL=http://piper:5000
DEFAULT_OLLAMA_MODEL=gemma3:4b
PORT=8585
DATABASE_URL=sqlite:////data/inventory.db
`
  );

  // Ajout d'un script de démarrage tout-en-un (start.sh) avec résolution automatique de conflit de port (8585+)
  const startShContent =
    ZIMA_PROJECT_FILES['start.sh']?.content ||
    `#!/bin/bash
set -e
echo "🚀 [Domotix] Lancement..."
mkdir -p data
DOCKER_CMD="docker"
if ! docker info &> /dev/null && command -v sudo &> /dev/null; then
    DOCKER_CMD="sudo docker"
fi
APP_PORT=\${PORT:-8585}
$DOCKER_CMD rm -f domotix-inventory 2>/dev/null || true
$DOCKER_CMD build -t domotix .
$DOCKER_CMD run -d --name domotix-inventory --restart unless-stopped -p "\${APP_PORT}:8000" -v "$(pwd)/data:/data" domotix
IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "🎉 Domotix opérationnel sur http://\${IP_ADDR:-localhost}:\${APP_PORT}"
`;

  zip.file('start.sh', startShContent, { unixPermissions: '755' });

  return await zip.generateAsync({ type: 'blob' });
}

export async function downloadZimaOSZip() {
  const blob = await generateZimaOSZip();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'domotix_zimaos.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
