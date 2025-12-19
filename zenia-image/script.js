// script.js — versão com Worker inline (Blob -> URL.createObjectURL)
let currentVersion = 'v1.0';
let finalSize = 512;
let controller = { cancelled: false };

function setVersion(v) {
    currentVersion = v;
    SoraAI.paint();
    document.getElementById('randomBtn').style.display = (v === 'v2.1') ? 'block' : 'none';
}

function setSize(s) { finalSize = s; }

const dataset = {
    "vulcão": "https://upload.wikimedia.org/wikipedia/commons/3/3e/Volcano_Eruption_Hawaii.jpg",
    "iceberg": "https://upload.wikimedia.org/wikipedia/commons/6/63/Iceberg_Antarctica.jpg",
    "cachoeira glacial": "https://upload.wikimedia.org/wikipedia/commons/e/e3/Glacial_waterfall.jpg",
    "deserto": "https://upload.wikimedia.org/wikipedia/commons/8/88/Sahara_Dune.jpg",
    "tempestade": "https://upload.wikimedia.org/wikipedia/commons/4/4f/Lightning_over_sky.jpg"
};

const promptColors = {
    "vulcão": ["#FF4500", "#FF8C00", "#800000"],
    "iceberg": ["#E0F7FF", "#99DDEE", "#66CCFF"],
    "cachoeira glacial": ["#B0E0E6", "#87CEFA", "#4682B4"],
    "deserto": ["#EDC9AF", "#D2B48C", "#C19A6B"],
    "tempestade": ["#191970", "#708090", "#F0F8FF"]
};

const SUPPORTS_WORKER = !!(window.Worker && window.OffscreenCanvas);

function createInlineWorker() {
    // worker source as string (same logic as external worker)
    const src = `
    let cancelled = false;

    function hexToRgb(hex) {
        const h = hex.replace('#','');
        return [
            parseInt(h.substr(0,2),16),
            parseInt(h.substr(2,2),16),
            parseInt(h.substr(4,2),16)
        ];
    }

    self.onmessage = async (e) => {
        const msg = e.data;
        if (msg.type === 'cancel') {
            cancelled = true;
            return;
        }
        if (msg.type !== 'render') return;
        cancelled = false;

        const width = msg.width;
        const height = msg.height;
        const tile = msg.tile || 8;
        const promptKey = msg.promptKey || '';
        const colorsMap = msg.colors || {};

        try {
            const off = new OffscreenCanvas(width, height);
            const ctx = off.getContext('2d');

            // desenha imagem se veio ImageBitmap
            if (msg.hasImageBitmap && msg.imageBitmap) {
                ctx.drawImage(msg.imageBitmap, 0, 0, width, height);
            } else {
                // fallback gradient + noise
                const cols = colorsMap[promptKey] || ["#777777","#999999","#555555"];
                const c0 = hexToRgb(cols[0]);
                const c1 = hexToRgb(cols[1] || cols[0]);

                const imgData = ctx.createImageData(width, height);
                for (let y = 0; y < height; y++) {
                    const t = y / (height - 1 || 1);
                    for (let x = 0; x < width; x++) {
                        const i = (y * width + x) * 4;
                        const r = Math.floor(c0[0] * (1 - t) + c1[0] * t) + Math.floor(Math.random() * 20 - 10);
                        const g = Math.floor(c0[1] * (1 - t) + c1[1] * t) + Math.floor(Math.random() * 20 - 10);
                        const b = Math.floor(c0[2] * (1 - t) + c1[2] * t) + Math.floor(Math.random() * 20 - 10);
                        const brushNoise = Math.random() * 40 - 20;
                        imgData.data[i] = Math.min(Math.max(r + brushNoise, 0), 255);
                        imgData.data[i+1] = Math.min(Math.max(g + brushNoise, 0), 255);
                        imgData.data[i+2] = Math.min(Math.max(b + brushNoise, 0), 255);
                        imgData.data[i+3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                // simple brush strokes
                for (let i = 0; i < 400; i++) {
                    const idx = Math.floor(Math.random() * cols.length);
                    const alphaVal = (Math.floor(Math.random() * 60) + 100).toString(16).padStart(2,'0');
                    ctx.fillStyle = cols[idx] + alphaVal;
                    ctx.beginPath();
                    const px = Math.random() * width;
                    const py = Math.random() * height;
                    const radius = Math.random() * 6 + 2;
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            const totalPasses = Math.ceil(height / tile);
            for (let pass = 0; pass < totalPasses; pass++) {
                if (cancelled) break;
                const yStart = pass * tile;
                const yEnd = Math.min(yStart + tile, height);
                const h = yEnd - yStart;
                const stripe = ctx.getImageData(0, yStart, width, h);
                for (let yy = 0; yy < stripe.height; yy++) {
                    for (let x = 0; x < width; x++) {
                        const i = (yy * width + x) * 4;
                        stripe.data[i] = Math.min(255, Math.max(0, stripe.data[i] * 0.97 + (Math.random() * 10 - 5)));
                        stripe.data[i+1] = Math.min(255, Math.max(0, stripe.data[i+1] * 0.97 + (Math.random() * 10 - 5)));
                        stripe.data[i+2] = Math.min(255, Math.max(0, stripe.data[i+2] * 0.97 + (Math.random() * 10 - 5)));
                    }
                }
                ctx.putImageData(stripe, 0, yStart);

                const bitmap = off.transferToImageBitmap();
                const progress = (yEnd / height);
                self.postMessage({type:'progress', bitmap, progress}, [bitmap]);
                // yield
                await new Promise(r => setTimeout(r, 0));
            }

            if (!cancelled) {
                const finalBitmap = off.transferToImageBitmap();
                self.postMessage({type:'done', bitmap: finalBitmap}, [finalBitmap]);
            } else {
                self.postMessage({type:'error', message:'cancelled'});
            }
        } catch (err) {
            self.postMessage({type:'error', message: String(err)});
        }
    };
    `;
    const blob = new Blob([src], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const wk = new Worker(url);
    // opcional: revoke depois que o worker for terminado/destruído
    return { worker: wk, url };
}

const SoraAI = {
    canvas: null,
    ctx: null,
    res: 256,
    tile: 8,
    progressCanvas: null,
    progressCtx: null,
    tempCanvas: null,
    worker: null,
    workerUrl: null,
    usingWorker: false,

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
                try {
                    const imgBitmap = await createImageBitmap(f);
                    this.res = parseInt(document.getElementById('resSlider').value);
                    this.canvas.width = this.res; this.canvas.height = this.res;
                    this.ctx.clearRect(0,0,this.res,this.res);
                    this.ctx.drawImage(imgBitmap, 0, 0, this.res, this.res);
                    document.getElementById('status-text').innerText = "Imagem local carregada (preview)";
                    try { imgBitmap.close(); } catch {}
                } catch (err) {
                    console.error(err);
                    document.getElementById('status-text').innerText = "Erro ao carregar imagem local";
                }
            }
        });

        if (SUPPORTS_WORKER) {
            try {
                const created = createInlineWorker();
                this.worker = created.worker;
                this.workerUrl = created.url;
                this.worker.onmessage = this._onWorkerMessage.bind(this);
                this.usingWorker = true;
                console.log('Worker inline criado e pronto.');
            } catch (e) {
                console.warn('Falha ao criar worker inline:', e);
                this.usingWorker = false;
            }
        }
    },

    _onWorkerMessage(e) {
        const m = e.data;
        const status = document.getElementById('status-text');
        const bar = document.getElementById('status-bar');

        if (m.type === 'progress') {
            const bitmap = m.bitmap;
            this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
            this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
            bar.style.width = `${Math.round(m.progress * 100)}%`;
            this.updateProgress(m.progress);
            status.innerText = `Renderizando... ${Math.round(m.progress*100)}%`;
            try { bitmap.close(); } catch {}
        } else if (m.type === 'done') {
            const bitmap = m.bitmap;
            this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
            this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
            this.updateProgress(1);
            document.getElementById('status-bar').style.width = '100%';
            status.innerText = "Preview completo (worker)";
            try { bitmap.close(); } catch {}
            document.getElementById('cancelBtn').style.display = 'none';
            this.disableControls(false);
        } else if (m.type === 'error') {
            status.innerText = "Erro no worker: " + (m.message || '');
            document.getElementById('cancelBtn').style.display = 'none';
            this.disableControls(false);
        }
    },

    async paint() {
        controller.cancelled = false;
        document.getElementById('cancelBtn').style.display = 'inline-block';
        this.disableControls(true);

        const promptRaw = document.getElementById('prompt').value || "";
        const promptKey = promptRaw.trim().toLowerCase();
        const status = document.getElementById('status-text');
        const bar = document.getElementById('status-bar');
        this.res = parseInt(document.getElementById('resSlider').value);
        this.canvas.width = this.res; this.canvas.height = this.res;
        bar.style.width = "0%";
        status.innerText = "Preparando...";

        let imgBitmap = null;

        let matchedUrl = null;
        for (const k of Object.keys(dataset)) {
            if (!promptKey) break;
            if (k.includes(promptKey) || promptKey.includes(k)) { matchedUrl = dataset[k]; break; }
        }

        const fInput = document.getElementById('fileInput');
        if (fInput.files && fInput.files[0]) {
            try {
                imgBitmap = await createImageBitmap(fInput.files[0]);
            } catch (e) { console.warn("Erro createImageBitmap local:", e); imgBitmap = null; }
        } else if (matchedUrl) {
            try {
                status.innerText = "Carregando imagem remota...";
                const resp = await fetch(matchedUrl, { mode: 'cors' });
                if (!resp.ok) throw new Error("fetch failed");
                const blob = await resp.blob();
                imgBitmap = await createImageBitmap(blob);
            } catch (e) {
                console.warn("Falha ao carregar imagem remota (CORS?):", e);
                imgBitmap = null;
            }
        }

        if (this.usingWorker && this.worker) {
            try {
                const msg = {
                    type: 'render',
                    width: this.res,
                    height: this.res,
                    promptKey,
                    tile: this.tile,
                    colors: promptColors
                };
                const transfer = [];
                if (imgBitmap) {
                    msg.hasImageBitmap = true;
                    msg.imageBitmap = imgBitmap;
                    transfer.push(imgBitmap);
                } else {
                    msg.hasImageBitmap = false;
                }
                this.worker.postMessage(msg, transfer);
            } catch (e) {
                console.warn('Erro ao usar worker — fallback no thread principal:', e);
                if (imgBitmap) try { imgBitmap.close(); } catch {}
                await this._paintMainThread(imgBitmap, promptKey);
            }
        } else {
            await this._paintMainThread(imgBitmap, promptKey);
        }
    },

    async _paintMainThread(imgBitmap, promptKey) {
        const status = document.getElementById('status-text');
        const bar = document.getElementById('status-bar');
        let imageData = null;

        if (imgBitmap) {
            const off = this.tempCanvas;
            off.width = this.res; off.height = this.res;
            const offCtx = off.getContext('2d');
            offCtx.clearRect(0,0,off.width,off.height);
            offCtx.drawImage(imgBitmap, 0, 0, off.width, off.height);
            imageData = offCtx.getImageData(0,0,off.width,off.height);
            try { imgBitmap.close(); } catch {}
        } else {
            status.innerText = "Usando fallback artístico...";
            imageData = this.generateArtFallback(promptKey);
        }

        status.innerText = "Renderizando...";
        const imgData = imageData;
        const res = this.res;
        const tile = this.tile;
        let rows = 0;
        const totalPasses = Math.ceil(res / tile);

        for (let pass = 0; pass < totalPasses; pass++) {
            if (controller.cancelled) { status.innerText = "Cancelado"; break; }
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
            status.innerText = "Preview completo";
            bar.style.width = "100%";
            this.updateProgress(1);
        }
        document.getElementById('cancelBtn').style.display = 'none';
        this.disableControls(false);
    },

    generateArtFallback(promptKey) {
        const colors = promptColors[promptKey] || ["#777777", "#999999", "#555555"];
        const res = this.res;
        const imgData = this.ctx.createImageData(res, res);

        function hexToRgb(hex) {
            const h = hex.replace('#','');
            return [
                parseInt(h.substr(0,2),16),
                parseInt(h.substr(2,2),16),
                parseInt(h.substr(4,2),16)
            ];
        }
        const c0 = hexToRgb(colors[0]);
        const c1 = hexToRgb(colors[1] || colors[0]);

        for (let y = 0; y < res; y++) {
            const t = y / (res - 1 || 1);
            for (let x = 0; x < res; x++) {
                const i = (y * res + x) * 4;
                const r = Math.floor(c0[0] * (1 - t) + c1[0] * t) + Math.floor(Math.random() * 20 - 10);
                const g = Math.floor(c0[1] * (1 - t) + c1[1] * t) + Math.floor(Math.random() * 20 - 10);
                const b = Math.floor(c0[2] * (1 - t) + c1[2] * t) + Math.floor(Math.random() * 20 - 10);
                const brushNoise = Math.random() * 40 - 20;
                imgData.data[i] = Math.min(Math.max(r + brushNoise, 0), 255);
                imgData.data[i+1] = Math.min(Math.max(g + brushNoise, 0), 255);
                imgData.data[i+2] = Math.min(Math.max(b + brushNoise, 0), 255);
                imgData.data[i+3] = 255;
            }
        }

        const tmp = this.tempCanvas;
        tmp.width = res; tmp.height = res;
        const tctx = tmp.getContext('2d');
        tctx.putImageData(imgData, 0, 0);

        for (let i = 0; i < 600; i++) {
            const colorIdx = Math.floor(Math.random() * colors.length);
            const alphaVal = (Math.floor(Math.random() * 60) + 100).toString(16).padStart(2, '0');
            const fill = colors[colorIdx] + alphaVal;
            tctx.fillStyle = fill;
            tctx.beginPath();
            const px = Math.random() * res;
            const py = Math.random() * res;
            const radius = Math.random() * 6 + 2;
            tctx.arc(px, py, radius, 0, Math.PI * 2);
            tctx.fill();
        }

        return tctx.getImageData(0,0,res,res);
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
    },

    async download() {
        const status = document.getElementById('status-text');
        this.disableControls(true);
        try {
            const f = document.createElement('canvas');
            f.width = finalSize; f.height = finalSize;
            f.getContext('2d').drawImage(this.canvas, 0, 0, finalSize, finalSize);
            const blob = await new Promise(resolve => f.toBlob(resolve, 'image/png'));
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sora_${finalSize}x${finalSize}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            status.innerText = "Download concluído";
        } catch (e) {
            console.error(e);
            status.innerText = "Erro no download";
        } finally {
            this.disableControls(false);
        }
    },

    async randomImage() {
        const keys = Object.keys(dataset);
        const r = keys[Math.floor(Math.random() * keys.length)];
        document.getElementById('prompt').value = r;
        await this.paint();
    },

    cancel() {
        controller.cancelled = true;
        if (this.usingWorker && this.worker) {
            try { this.worker.postMessage({type:'cancel'}); } catch {}
        }
        document.getElementById('cancelBtn').style.display = 'none';
        this.disableControls(false);
        document.getElementById('status-text').innerText = 'Cancelado';
    },

    disableControls(state) {
        document.getElementById('generateBtn').disabled = state;
        document.getElementById('downloadBtn').disabled = state;
        document.getElementById('resSlider').disabled = state;
        document.getElementById('fileInput').disabled = state;
    }
};

window.onload = () => { SoraAI.init(); document.getElementById('randomBtn').style.display = 'none'; };