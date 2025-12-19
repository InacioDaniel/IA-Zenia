// script.js — Zenia Wikimedia multimodal sem backend

// Elementos
const langSelect = document.getElementById("langSelect");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("modelProgress");
const chatArea = document.getElementById("chatArea");
const sourcesEl = document.getElementById("sources");

document.getElementById("sendBtn").addEventListener("click", handleUserInput);
document.getElementById("clearBtn").addEventListener("click", () => {
  chatArea.innerHTML = "";
  sourcesEl.innerHTML = "";
});

document.getElementById("ttsBtn").addEventListener("click", speakLastAnswer);
document.getElementById("micBtn").addEventListener("click", toggleMic);

document.getElementById("mediaSearchBtn").addEventListener("click", handleMediaSearch);
document.getElementById("imageUpload").addEventListener("change", handleImageUpload);
document.getElementById("analyzeBtn").addEventListener("click", analyzeImage);

// Estado
let lastAnswerText = "";
let recognition = null;
let cocoModel = null;
let currentImage = null;

// Inicialização
initSpeechRecognition();
loadCocoModel();

// UI helpers
function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  if (who === "zenia") lastAnswerText = text;
}

function setStatus(text, progress = null) {
  statusEl.textContent = text;
  if (progress !== null) {
    progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function renderSources(links) {
  sourcesEl.innerHTML = "";
  if (!links || !links.length) return;
  const label = document.createElement("div");
  label.className = "small";
  label.textContent = "Fontes:";
  sourcesEl.appendChild(label);
  for (const href of links) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = href.replace(/^https?:\/\/[^/]+\/wiki\//, "");
    sourcesEl.appendChild(a);
  }
}

// ---------- Texto: Wikipedia RAG extrativo ----------

const STOPWORDS = {
  pt: new Set(["o","a","os","as","um","uma","uns","umas","de","da","do","das","dos","em","no","na","nos","nas","e","é","ser","que","como","por","para","com","sem","se","sobre","ao","à","às","aos"]),
  en: new Set(["the","a","an","of","in","on","and","is","to","for","with","without","as","by","at","from","that","this","these","those"]),
  es: new Set(["el","la","los","las","un","una","unos","unas","de","del","en","y","es","ser","que","como","por","para","con","sin","se","sobre","al","a","a la"])
};

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenize(text, lang = "pt") {
  const stop = STOPWORDS[lang] || STOPWORDS.pt;
  return normalize(text).split(" ").filter(t => t && !stop.has(t));
}
function splitSentences(text) {
  return text.split(/(?<=[\.\!\?\:])\s+/).map(s => s.trim()).filter(s => s.length > 0);
}
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const total = tokens.length || 1;
  for (const [k, v] of tf.entries()) tf.set(k, v / total);
  return tf;
}
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  const keys = new Set([...vecA.keys(), ...vecB.keys()]);
  for (const k of keys) {
    const a = vecA.get(k) || 0;
    const b = vecB.get(k) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function wikiBase(lang) {
  const m = { pt: "pt", en: "en", es: "es" }[lang] || "pt";
  return `https://${m}.wikipedia.org`;
}

async function wikiSearch(lang, query, limit = 6) {
  const base = wikiBase(lang);
  const url = `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha na busca Wikipedia");
  const data = await res.json();
  return (data.query?.search || []).map(it => ({
    title: it.title,
    pageid: it.pageid
  }));
}

async function wikiExtract(lang, title) {
  const base = wikiBase(lang);
  const url = `${base}/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&formatversion=2&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao obter extrato");
  const data = await res.json();
  const page = (data.query?.pages || [])[0];
  const text = page?.extract || "";
  const link = `${base}/wiki/${encodeURIComponent(title.replace(/\s/g, "_"))}`;
  return { text, link, title };
}

function deduplicateSentences(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = normalize(it.sentence).slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
function groupBy(arr, k) {
  return arr.reduce((acc, x) => {
    (acc[x[k]] = acc[x[k]] || []).push(x);
    return acc;
  }, {});
}
function unique(arr) { return [...new Set(arr)]; }

function refineFluency(sentences, lang) {
  const cleaned = sentences.map(s => s.replace(/\s+/g, " ").trim());
  const final = [];
  const seen = new Set();
  for (const s of cleaned) {
    const sig = normalize(s).replace(/\b\d+\b/g, "").slice(0, 120);
    if (seen.has(sig)) continue;
    seen.add(sig);
    final.push(s);
  }
  const cap = final.slice(0, 6);
  const connector = { pt: "Além disso, ", en: "Additionally, ", es: "Además, " }[lang] || "";
  if (cap.length > 1) cap[1] = connector + cap[1];
  return cap.join(" ");
}

async function zeniaAnswer(question, lang) {
  setStatus("Buscando artigos na Wikipedia...", 10);

  const results = await wikiSearch(lang, question, 6);
  if (!results.length) return { answer: "Não encontrei resultados na Wikipedia para essa pergunta.", sources: [] };

  setStatus("Baixando conteúdo dos artigos...", 30);

  const pages = [];
  for (let i = 0; i < results.length; i++) {
    try {
      const p = await wikiExtract(lang, results[i].title);
      if ((p.text || "").length > 200) pages.push(p);
    } catch (e) {}
    setStatus("Processando conteúdo...", 30 + Math.round((i + 1) / results.length * 30));
  }

  if (!pages.length) return { answer: "Encontrei artigos, mas não consegui extrair o conteúdo agora.", sources: results.map(r => wikiBase(lang) + "/wiki/" + encodeURIComponent(r.title)) };

  const langKey = langSelect.value || "pt";
  const qTokens = tokenize(question, langKey);
  const qTF = termFreq(qTokens);

  const sentencePool = [];
  for (const p of pages) {
    const sentences = splitSentences(p.text).slice(0, 1200);
    for (const s of sentences) {
      const tokens = tokenize(s, langKey);
      if (tokens.length < 3) continue;
      const tf = termFreq(tokens);
      const score = cosineSimilarity(qTF, tf);
      const lengthBonus = Math.min(tokens.length / 20, 1);
      sentencePool.push({ sentence: s, score: score * (0.7 + 0.3 * lengthBonus), source: p.link, title: p.title });
    }
  }

  setStatus("Selecionando trechos relevantes...", 70);

  sentencePool.sort((a, b) => b.score - a.score);
  const top = deduplicateSentences(sentencePool.slice(0, 12));
  if (!top.length) return { answer: "Não consegui extrair uma resposta clara dos artigos encontrados.", sources: pages.map(p => p.link) };

  const grouped = groupBy(top, "title");
  const finalSentences = [];
  for (const groupTitle of Object.keys(grouped)) {
    const group = grouped[groupTitle].sort((a, b) => b.score - a.score);
    finalSentences.push(...group.slice(0, 3).map(g => g.sentence));
    if (finalSentences.length >= 6) break;
  }

  const answer = refineFluency(finalSentences, langKey);
  setStatus("Pronto!", 100);
  const sources = unique(top.map(t => t.source)).slice(0, 5);

  return { answer, sources };
}

async function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  const lang = langSelect.value || "pt";
  addMessage(text, "user");
  input.value = "";

  try {
    setStatus("Processando pergunta...", 5);
    const { answer, sources } = await zeniaAnswer(text, lang);
    addMessage(answer, "zenia");
    renderSources(sources);
  } catch (err) {
    console.error(err);
    addMessage("Erro ao processar sua pergunta agora. Tente novamente em alguns minutos.", "zenia");
    setStatus("Erro ao consultar a Wikipedia", 0);
  }
}

// ---------- Voz: STT e TTS ----------

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  recognition = new SR();
  recognition.lang = (langSelect.value === "pt" ? "pt-PT" : langSelect.value === "es" ? "es-ES" : "en-US");
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("userInput").value = transcript;
  };
  recognition.onerror = (e) => {
    console.warn("SpeechRecognition error:", e);
    setStatus("Falha no reconhecimento de fala", 0);
  };
}
function toggleMic() {
  if (!recognition) {
    addMessage("Reconhecimento de voz não suportado neste navegador.", "zenia");
    return;
  }
  try {
    recognition.lang = (langSelect.value === "pt" ? "pt-PT" : langSelect.value === "es" ? "es-ES" : "en-US");
    recognition.start();
    setStatus("Ouvindo...", 20);
  } catch (e) {
    console.warn(e);
    setStatus("Não foi possível iniciar o microfone.", 0);
  }
}
function speakLastAnswer() {
  if (!lastAnswerText) return;
  const utter = new SpeechSynthesisUtterance(lastAnswerText);
  utter.lang = (langSelect.value === "pt" ? "pt-PT" : langSelect.value === "es" ? "es-ES" : "en-US");
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ---------- Commons: busca de mídia ----------

function commonsBase() {
  return "https://commons.wikimedia.org";
}

async function commonsSearch(query, typeFilter = "", limit = 9) {
  // usa search API + prop=imageinfo para URLs
  const url = `${commonsBase()}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}&prop=imageinfo|info&iiprop=url|mime|size&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha na busca Commons");
  const data = await res.json();
  const pages = data.query?.pages ? Object.values(data.query.pages) : [];

  const items = [];
  for (const p of pages) {
    const title = p.title || "";
    const pageUrl = `${commonsBase()}/wiki/${encodeURIComponent(title.replace(/\s/g, "_"))}`;
    const ii = (p.imageinfo || [])[0];
    const mime = ii?.mime || "";
    const urlFile = ii?.url || "";
    let mediaType = "";
    if (mime.startsWith("image/")) mediaType = "bitmap";
    else if (mime.startsWith("video/")) mediaType = "video";
    else if (mime.startsWith("audio/")) mediaType = "audio";
    else mediaType = "other";

    items.push({ title, pageUrl, urlFile, mime, mediaType });
  }

  return typeFilter ? items.filter(x => x.mediaType === typeFilter) : items;
}

function renderMedia(items) {
  const grid = document.getElementById("mediaGrid");
  grid.innerHTML = "";
  for (const it of items) {
    const card = document.createElement("div");
    card.className = "media-card";
    const title = document.createElement("div");
    title.className = "small";
    title.textContent = it.title;
    card.appendChild(title);

    if (it.mediaType === "bitmap") {
      const img = document.createElement("img");
      img.src = it.urlFile;
      img.alt = it.title;
      img.onload = () => {}; // placeholder
      card.appendChild(img);

      const tools = document.createElement("div");
      tools.className = "media-tools";
      const btnAnalyze = document.createElement("button");
      btnAnalyze.textContent = "Analisar";
      btnAnalyze.onclick = () => loadImageForAnalysis(it.urlFile);
      const btnOpen = document.createElement("button");
      btnOpen.textContent = "Abrir";
      btnOpen.onclick = () => window.open(it.pageUrl, "_blank");
      tools.appendChild(btnAnalyze);
      tools.appendChild(btnOpen);
      card.appendChild(tools);
    } else if (it.mediaType === "video") {
      const v = document.createElement("video");
      v.src = it.urlFile;
      v.controls = true;
      card.appendChild(v);
      const tools = document.createElement("div");
      tools.className = "media-tools";
      const btnOpen = document.createElement("button");
      btnOpen.textContent = "Abrir";
      btnOpen.onclick = () => window.open(it.pageUrl, "_blank");
      tools.appendChild(btnOpen);
      card.appendChild(tools);
    } else if (it.mediaType === "audio") {
      const audio = document.createElement("audio");
      audio.src = it.urlFile;
      audio.controls = true;
      card.appendChild(audio);
      const tools = document.createElement("div");
      tools.className = "media-tools";
      const btnOpen = document.createElement("button");
      btnOpen.textContent = "Abrir";
      btnOpen.onclick = () => window.open(it.pageUrl, "_blank");
      tools.appendChild(btnOpen);
      card.appendChild(tools);
    } else {
      const a = document.createElement("a");
      a.href = it.pageUrl;
      a.target = "_blank";
      a.textContent = "Ver página";
      card.appendChild(a);
    }
    grid.appendChild(card);
  }
}

async function handleMediaSearch() {
  const q = document.getElementById("mediaQuery").value.trim();
  const type = document.getElementById("mediaType").value;
  if (!q) return;
  try {
    setStatus("Buscando mídia na Commons...", 25);
    const items = await commonsSearch(q, type, 9);
    renderMedia(items);
    setStatus("Mídias carregadas", 60);
  } catch (e) {
    console.error(e);
    setStatus("Erro ao buscar mídia", 0);
  }
}

// ---------- Reconhecimento de objetos (imagem) ----------

async function loadCocoModel() {
  try {
    setStatus("Carregando modelo de objetos (COCO‑SSD)...", 10);
    cocoModel = await cocoSsd.load();
    setStatus("Modelo de objetos pronto!", 20);
  } catch (e) {
    console.error(e);
    setStatus("Falha ao carregar COCO‑SSD", 0);
  }
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadImageForAnalysis(url, true);
}

function loadImageForAnalysis(url, revoke = false) {
  const img = document.getElementById("previewImg");
  img.style.display = "block";
  img.src = url;
  img.onload = () => {
    currentImage = img;
    drawToCanvas(img);
    if (revoke) URL.revokeObjectURL(url);
  };
}

function drawToCanvas(img) {
  const canvas = document.getElementById("previewCanvas");
  const ctx = canvas.getContext("2d");
  const maxW = 640;
  const scale = Math.min(1, maxW / img.naturalWidth);
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

async function analyzeImage() {
  const status = document.getElementById("analyzeStatus");
  if (!currentImage) {
    status.textContent = "Carregue ou selecione uma imagem primeiro.";
    return;
  }
  if (!cocoModel) {
    status.textContent = "Modelo COCO‑SSD ainda não está pronto.";
    return;
  }
  status.textContent = "Analisando...";
  await tf.nextFrame(); // dá tempo ao browser

  // roda detecção no canvas para respeitar escala
  const canvas = document.getElementById("previewCanvas");
  const predictions = await cocoModel.detect(canvas);

  // desenha caixas
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2;
  ctx.font = "12px system-ui";
  ctx.strokeStyle = "#06b6d4";
  ctx.fillStyle = "rgba(6,182,212,0.15)";

  ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
  for (const p of predictions) {
    const [x, y, w, h] = p.bbox;
    ctx.strokeRect(x, y, w, h);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${p.class} (${(p.score*100).toFixed(1)}%)`, x + 4, y + 14);
    ctx.fillStyle = "rgba(6,182,212,0.15)";
  }

  status.textContent = predictions.length
    ? `Detectados: ${predictions.map(p => p.class).join(", ")}`
    : "Nenhum objeto reconhecido.";
}

// ---------- Fluxo principal ----------

function speak(text, langCode) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = langCode;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function speakLastAnswer() {
  if (!lastAnswerText) return;
  const langCode = (langSelect.value === "pt" ? "pt-PT" : langSelect.value === "es" ? "es-ES" : "en-US");
  speak(lastAnswerText, langCode);
}

// Entrada de voz já configurada em initSpeechRecognition()

// Handler de pergunta
async function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  const lang = langSelect.value || "pt";
  addMessage(text, "user");
  input.value = "";

  try {
    setStatus("Processando pergunta...", 5);
    const { answer, sources } = await zeniaAnswer(text, lang);
    addMessage(answer, "zenia");
    renderSources(sources);
  } catch (err) {
    console.error(err);
    addMessage("Erro ao processar sua pergunta agora. Tente novamente em alguns minutos.", "zenia");
    setStatus("Erro ao consultar a Wikipedia", 0);
  }
}
