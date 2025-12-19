// script.js — sem worker, usando Wikimedia Commons para imagens, com marca Zenia Text-to-Image
let currentVersion = 'v1.0';
let finalSize = 512;
let controller = { cancelled: false };

function setVersion(v) {
    currentVersion = v;
    ZeniaAI.paint();
    document.getElementById('randomBtn').style.display = (v === 'v2.1') ? 'block' : 'none';
}

function setSize(s) { finalSize = s; }

const promptColors = {
    "vulcão": ["#FF4500", "#FF8C00", "#800000"],
    "iceberg": ["#E0F7FF", "#99DDEE", "#66CCFF"],
    "cachoeira glacial": ["#B0E0E6", "#87CEFA", "#4682B4"],
    "deserto": ["#EDC9AF", "#D2B48C", "#C19A6B"],
    "tempestade": ["#191970", "#708090", "#F0F8FF"]
};

// Wikimedia helpers (busca com thumbnails)
async function fetchWikimediaSearch(prompt, limit = 20, thumbWidth = 512) {
  if (!prompt) return [];
  const api = 'https://commons.wikimedia.org/w/api.php';
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: prompt,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: String(thumbWidth),
    format: 'json',
    origin: '*'
  });
  const res = await fetch(`${api}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.query || !data.query.pages) return [];
  return Object.values(data.query.pages).map(p => {
    const info = (p.imageinfo && p.imageinfo[0]) || {};
    const url = info.thumburl || info.url || null;
    return { url, title: p.title || '' };
  }).filter(x => x.url);
}

async function fetchWikimediaCategory(categoryTitle = 'Category:CommonsRoot', limit = 50, thumbWidth = 512) {
  const api = 'https://commons.wikimedia.org/w/api.php';
  const params = new URLSearchParams({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: categoryTitle,
    gcmnamespace: '6',
    gcmlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: String(thumbWidth),
    format: 'json',
    origin: '*'
  });
  const res = await fetch(`${api}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.query || !data.query.pages) return [];
  return Object.values(data.query.pages).map(p => {
    const info = (p.imageinfo && p.imageinfo[0]) || {};
    const url = info.thumburl || info.url || null;
    return { url, title: p.title || '' };
  }).filter(x => x.url);
}

async function getBlobFromUrl(url) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error('fetch failed');
    const blob = await resp.blob();
    return blob;
  } catch (e) {
    console.warn('Erro ao baixar imagem:', e);
    return null;
  }
}

// ZeniaAI (sem worker)
const ZeniaAI = {
    canvas: null,
    ctx: null,
    res: 256,
    tile: 8,
    progressCanvas: null,
    progressCtx: null,
    tempCanvas: null,
    lastSourceBlob: null,
    lastSourceTitle: null,

    init() {
        this.canvas = document.getElementById('zenia-viewport');
        this.ctx = this.canvas.getContext('2d');
        this.progressCanvas = document.getElementById('progress-circle');
        this.progressCtx = this.progressCanvas.getContext('2d');

        this.tempCanvas = document.createElement('canvas');
        this.tempCanvas.width = 1024;
        this.tempCanvas.height = 1024;

        document.getElementById('fileInput').addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) {
                this.lastSourceBlob = f;
                this.lastSourceTitle = f.name || 'Imagem local';
                try {
                    const img = await this._loadImageFromBlob(f);
                    this.res = parseInt(document.getElementById('resSlider').value);
                    this.canvas.width = this.res; this.canvas.height = this.res;
                    this.ctx.clearRect(0,0,this.res,this.res);
                    this.ctx.drawImage(img, 0, 0, this.res, this.res);
                    document.getElementById('status-text').innerText = "Imagem local carregada (preview)";
                    URL.revokeObjectURL(img.src);
                } catch (err) {
                    console.error(err);
                    document.getElementById('status-text').innerText = "Erro ao carregar imagem local";
                }
            }
        });
    },

    _loadImageFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Erro ao carregar imagem'));
            };
            img.src = url;
        });
    },

    async paint() {
        controller.cancelled = false;
        document.getElementById('cancelBtn').style.display = 'inline-block';
        this.disableControls(true);

        const promptRaw = document.getElementById('prompt').value || "";
        const promptKey = promptRaw.trim().toLowerCase();
        const statusEl = document.getElementById('status-text');
        const bar = document.getElementById('status-bar');
        this.res = parseInt(document.getElementById('resSlider').value);
        this.canvas.width = this.res; this.canvas.height = this.res;
        bar.style.width = "0%";
        statusEl.innerText = "Preparando...";

        let imgBlob = null;
        let imageTitle = null;
        let imagePageUrl = null;
        this.lastSourceBlob = null;
        this.lastSourceTitle = null;

        const fInput = document.getElementById('fileInput');
        if (fInput.files && fInput.files[0]) {
            imgBlob = fInput.files[0];
            imageTitle = imgBlob.name || 'Imagem local';
            this.lastSourceBlob = imgBlob;
            this.lastSourceTitle = imageTitle;
        } else {
            if (promptKey) {
                const results = await fetchWikimediaSearch(promptKey, 30, 512);
                if (results.length > 0) {
                    const pick = results[Math.floor(Math.random() * results.length)];
                    imageTitle = pick.title;
                    imagePageUrl = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(pick.title);
                    imgBlob = await getBlobFromUrl(pick.url);
                    if (imgBlob) {
                        this.lastSourceBlob = imgBlob;
                        this.lastSourceTitle = imageTitle;
                    } else {
                        console.warn('Não foi possível baixar a imagem do Commons. Fallback será usado.');
                    }
                } else {
                    console.log('Nenhum resultado encontrado no Commons para:', promptKey);
                }
            } else {
                const results = await fetchWikimediaCategory('Category:CommonsRoot', 50, 512);
                if (results.length > 0) {
                    const pick = results[Math.floor(Math.random() * results.length)];
                    imageTitle = pick.title;
                    imagePageUrl = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(pick.title);
                    imgBlob = await getBlobFromUrl(pick.url);
                    if (imgBlob) {
                        this.lastSourceBlob = imgBlob;
                        this.lastSourceTitle = imageTitle;
                    } else {
                        console.warn('Falha ao baixar imagem aleatória do Commons.');
                    }
                }
            }
        }

        if (imgBlob) {
            try {
                const img = await this._loadImageFromBlob(imgBlob);
                this.ctx.clearRect(0, 0, this.res, this.res);
                this.ctx.drawImage(img, 0, 0, this.res, this.res);
                URL.revokeObjectURL(img.src);
                if (imageTitle) {
                    if (!imagePageUrl) imagePageUrl = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(imageTitle);
                    statusEl.innerHTML = `Fonte: <a href="${imagePageUrl}" target="_blank" rel="noopener noreferrer">${imageTitle}</a>`;
                } else {
                    statusEl.innerText = "Imagem carregada (preview)";
                }
            } catch (err) {
                console.warn('Erro ao carregar imagem para preview (img element):', err);
                imgBlob = null;
                statusEl.innerText = "Preview falhou — usando fallback artístico";
            }
        } else {
            statusEl.innerText = "Nenhuma imagem externa disponível — usando fallback artístico";
        }

        let imageData = null;
        if (imgBlob) {
            const off = this.tempCanvas;
            off.width = this.res; off.height = this.res;
            const offCtx = off.getContext('2d', { willReadFrequently: true });
            try {
                const img = await this._loadImageFromBlob(imgBlob);
                offCtx.clearRect(0,0,off.width,off.height);
                offCtx.drawImage(img, 0, 0, off.width, off.height);
                URL.revokeObjectURL(img.src);
                imageData = offCtx.getImageData(0,0,off.width,off.height);
            } catch (e) {
                console.warn('Erro ao usar blob para obter ImageData:', e);
                imageData = this.generateArtFallback(promptKey);
            }
        } else {
            imageData = this.generateArtFallback(promptKey);
        }

        statusEl.innerText = "Renderizando...";
        const imgData = imageData;
        const res = this.res;
        const tile = this.tile;
        let rows = 0;
        const totalPasses = Math.ceil(res / tile);

        for (let pass = 0; pass < totalPasses; pass++) {
            if (controller.cancelled) { statusEl.innerText = "Cancelado"; break; }
            const yStart = pass * tile;
            const yEnd = Math.min(yStart + tile, res);
            for (let y = yStart; y < yEnd; y++) {
                for (let x = 0; x < res; x++) {
                    const i = (y * res + x) * 4;
                    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] * 0.97 + (Math.random() * 10 - 5)));
                    imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] * 0.97 + (Math.random() * 10 - 5)));
                    imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] * 0.97 + (Math.random() * 10 - 5)));
                }
            }
            this.ctx.putImageData(imgData, 0, 0);
            rows++;
            const progress = Math.min(1, (rows * tile) / res);
            this.updateProgress(progress);
            bar.style.width = `${Math.round(progress * 100)}%`;
            await new Promise(requestAnimationFrame);
        }

        if (!controller.cancelled) {
            statusEl.innerText = "Preview completo";
            bar.style.width = "100%";
            this.updateProgress(1);
        }
        document.getElementById('cancelBtn').style.display = 'none';
        this.disableControls(false);
    },

    async download() {
        const status = document.getElementById('status-text');
        this.disableControls(true);
        try {
            if (this.lastSourceBlob) {
                const url = URL.createObjectURL(this.lastSourceBlob);
                const a = document.createElement('a');
                a.href = url;
                let filename = 'zenia_image';
                if (this.lastSourceTitle) filename = this.lastSourceTitle.replace(/^File:/i, '').replace(/\s+/g, '_');
                const ext = (this.lastSourceBlob.type && this.lastSourceBlob.type.split('/')[1]) ? '.' + this.lastSourceBlob.type.split('/')[1] : '';
                a.download = filename + (ext || '');
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                status.innerText = "Download do arquivo original concluído";
            } else {
                const f = document.createElement('canvas');
                f.width = finalSize; f.height = finalSize;
                f.getContext('2d').drawImage(this.canvas, 0, 0, finalSize, finalSize);
                const dataUrl = f.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `zenia_${finalSize}x${finalSize}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                status.innerText = "Download (PNG gerado do canvas) concluído";
            }
        } catch (e) {
            console.error(e);
            status.innerText = "Erro no download";
        } finally {
            this.disableControls(false);
        }
    },

    async randomImage() {
        const results = await fetchWikimediaCategory('Category:CommonsRoot', 50, 512);
        if (results.length === 0) return;
        const pick = results[Math.floor(Math.random() * results.length)];
        document.getElementById('prompt').value = pick.title.replace(/^File:/i, '');
        await this.paint();
    },

    cancel() {
        controller.cancelled = true;
        document.getElementById('cancelBtn').style.display = 'none';
        this.disableControls(false);
        document.getElementById('status-text').innerText = 'Cancelado';
    },

    disableControls(state) {
        document.getElementById('generateBtn').disabled = state;
        document.getElementById('downloadBtn').disabled = state;
        document.getElementById('resSlider').disabled = state;
        document.getElementById('fileInput').disabled = state;
    },

    generateArtFallback(promptKey) {
        const basePalettes = {
            "vulcão": {
                rock: ["#2b2b2b", "#3b3b3b", "#1f1f1f"],
                lava: ["#FFEE88", "#FF8C00", "#FF4500"],
                smoke: ["rgba(20,20,25,0.9)", "rgba(60,60,70,0.6)"],
                accent: ["#FFDAB3"]
            }
        };

        const palette = basePalettes[promptKey] || {
            rock: ["#555555","#333333","#222222"],
            lava: ["#FFEE88","#FF8C00","#FF4500"],
            smoke: ["rgba(30,30,35,0.8)","rgba(60,60,70,0.5)"],
            accent: ["#FFDAB3"]
        };

        const res = this.res;
        const tmp = this.tempCanvas;
        tmp.width = res; tmp.height = res;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });

        const g = ctx.createLinearGradient(0, 0, 0, res);
        g.addColorStop(0, '#0b0c0f');
        g.addColorStop(1, '#1b1a1e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, res, res);

        ctx.save();
        ctx.translate(res / 2, res * 0.65);
        const mountainWidth = res * 0.9;
        const mountainHeight = res * 0.7;

        ctx.beginPath();
        ctx.moveTo(-mountainWidth * 0.5, 0);
        ctx.quadraticCurveTo(-mountainWidth * 0.25, -mountainHeight * 0.9, 0, -mountainHeight);
        ctx.quadraticCurveTo(mountainWidth * 0.25, -mountainHeight * 0.9, mountainWidth * 0.5, 0);
        ctx.closePath();

        const mGrad = ctx.createLinearGradient(0, -mountainHeight, 0, 0);
        mGrad.addColorStop(0, palette.rock[0]);
        mGrad.addColorStop(0.6, palette.rock[1]);
        mGrad.addColorStop(1, palette.rock[2]);
        ctx.fillStyle = mGrad;
        ctx.fill();

        for (let i = 0; i < Math.floor(res * 0.06); i++) {
            ctx.beginPath();
            const x = (Math.random() - 0.5) * mountainWidth;
            const y = -mountainHeight * Math.random() * (0.8 + Math.random() * 0.4);
            const r = Math.random() * (res * 0.02) + (res * 0.003);
            ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const craterRadius = res * 0.12;
        const craterX = 0, craterY = -mountainHeight + craterRadius * 0.2;
        const lavaGrad = ctx.createRadialGradient(craterX, craterY, craterRadius * 0.06, craterX, craterY, craterRadius * 1.6);
        lavaGrad.addColorStop(0, palette.lava[0]);
        lavaGrad.addColorStop(0.35, palette.lava[1]);
        lavaGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(craterX, craterY, craterRadius, 0, Math.PI * 2);
        ctx.fillStyle = lavaGrad;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.moveTo(craterX + craterRadius * 0.3, craterY + craterRadius * 0.2);
        ctx.bezierCurveTo(craterX + craterRadius * 0.9, craterY + craterRadius * 0.9, craterX + mountainWidth * 0.15, 10, craterX + mountainWidth * 0.25, res * 0.05);
        const flowGrad = ctx.createLinearGradient(craterX, craterY, craterX + mountainWidth * 0.25, res * 0.05);
        flowGrad.addColorStop(0, palette.lava[1]);
        flowGrad.addColorStop(0.6, palette.lava[2]);
        flowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.lineWidth = mountainWidth * 0.06;
        ctx.lineCap = 'round';
        ctx.strokeStyle = flowGrad;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(craterX, craterY, craterRadius * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,140,30,0.08)';
        ctx.fill();

        for (let i = 0; i < Math.floor(res * 0.02); i++) {
            const px = craterX + (Math.random() - 0.5) * craterRadius * 2.2;
            const py = craterY + (Math.random() - 1.2) * craterRadius * 1.8;
            const pr = Math.random() * 2 + 0.5;
            ctx.beginPath();
            ctx.fillStyle = palette.accent[0];
            ctx.globalAlpha = 0.6 * Math.random();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
        for (let layer = 0; layer < 6; layer++) {
            ctx.save();
            const alpha = 0.16 * (1 - layer / 6);
            ctx.globalAlpha = alpha;
            ctx.filter = `blur(${1 + layer * 2}px)`;
            ctx.beginPath();
            const sx = res / 2 + (Math.random() - 0.5) * res * 0.08;
            const sy = res * 0.18 - layer * res * 0.02;
            ctx.ellipse(sx, sy, res * (0.18 + layer * 0.08), res * (0.06 + layer * 0.06), Math.random() * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = palette.smoke[0];
            ctx.fill();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        const overlayGrad = ctx.createLinearGradient(0, 0, 0, res);
        overlayGrad.addColorStop(0, 'rgba(20,14,10,0.06)');
        overlayGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, res, res);
        ctx.restore();

        ctx.save();
        for (let i = 0; i < Math.floor(res * 0.08); i++) {
            const x = Math.random() * res;
            const y = Math.random() * res;
            const r = Math.random() * 1.8;
            ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        return ctx.getImageData(0, 0, res, res);
    },

    updateProgress(p) {
        const ctx = this.progressCtx, c = this.progressCanvas;
        ctx.clearRect(0, 0, c.width, c.height);
        const cx = c.width / 2, cy = c.height / 2, r = 40;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p);
        ctx.strokeStyle = 'rgba(125,179,255,0.9)';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.fillStyle = "#7db3ff";
        ctx.font = "16px Fira Code";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round(p * 100) + "%", cx, cy);
    }
};

window.onload = () => { ZeniaAI.init(); document.getElementById('randomBtn').style.display = 'none'; };