// worker.js — recebe render requests e usa OffscreenCanvas para processar sem travar o main thread
let cancelled = false;

// cores compatíveis com o main thread
const promptColors = {
    "vulcão": ["#FF4500", "#FF8C00", "#800000"],
    "iceberg": ["#E0F7FF", "#99DDEE", "#66CCFF"],
    "cachoeira glacial": ["#B0E0E6", "#87CEFA", "#4682B4"],
    "deserto": ["#EDC9AF", "#D2B48C", "#C19A6B"],
    "tempestade": ["#191970", "#708090", "#F0F8FF"]
};

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
    const colorsMap = msg.colors || promptColors;

    try {
        const off = new OffscreenCanvas(width, height);
        const ctx = off.getContext('2d');

        // se veio ImageBitmap, desenhe
        if (msg.hasImageBitmap && msg.imageBitmap) {
            ctx.drawImage(msg.imageBitmap, 0, 0, width, height);
            // o ImageBitmap foi transferido, não podemos fechá-lo aqui (quem o transferiu perde referência)
        } else {
            // gerar fallback: gradiente + ruído
            const c0 = hexToRgb((colorsMap[promptKey] || colorsMap["deserto"])[0]);
            const c1 = hexToRgb((colorsMap[promptKey] || colorsMap["deserto"])[1]);

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

            // pinceladas simples
            for (let i = 0; i < 400; i++) {
                const cols = colorsMap[promptKey] || colorsMap["deserto"];
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
            // processamento de stripe
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

            // enviar progresso (transferindo ImageBitmap para o main thread)
            const bitmap = off.transferToImageBitmap();
            const progress = (yEnd / height);
            self.postMessage({type:'progress', bitmap, progress}, [bitmap]);
            // pequeno yield
            await new Promise(r => setTimeout(r, 0));
        }

        if (!cancelled) {
            const finalBitmap = off.transferToImageBitmap();
            self.postMessage({type:'done', bitmap: finalBitmap}, [finalBitmap]);
        } else {
            self.postMessage({type:'error', message: 'cancelled'});
        }
    } catch (err) {
        self.postMessage({type:'error', message: String(err)});
    }
};