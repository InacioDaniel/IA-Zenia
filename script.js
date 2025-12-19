// 100% inácio. zenia pronta
// --------- Elementos e estado ---------
const langSelect = document.getElementById("langSelect");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("modelProgress");
const chatArea = document.getElementById("chatArea");
const sourcesEl = document.getElementById("sources");

document.getElementById("sendBtn").addEventListener("click", handleUserInput);
document.getElementById("clearBtn").addEventListener("click", () => { chatArea.innerHTML = ""; sourcesEl.innerHTML = ""; });

// duplicados no topo para acessibilidade
document.getElementById("micBtn").addEventListener("click", toggleMic);
document.getElementById("ttsBtn").addEventListener("click", speakLastAnswer);
document.getElementById("micBtnTop").addEventListener("click", toggleMic);
document.getElementById("ttsBtnTop").addEventListener("click", speakLastAnswer);

// geradores externos
document.getElementById("openImageGen").addEventListener("click", () => window.open("https://ia-zenia.netlify.app/zenia-image", "_blank", "noopener"));
document.getElementById("openVideoGen").addEventListener("click", () => window.open("https://ia-zenia.netlify.app/zenia-video", "_blank", "noopener"));

// multimídia Commons
document.getElementById("mediaSearchBtn").addEventListener("click", handleMediaSearch);
document.getElementById("imageUpload").addEventListener("change", handleImageUpload);
document.getElementById("analyzeBtn").addEventListener("click", analyzeImage);

let lastAnswerText = "";
let recognition = null;
let cocoModel = null;
let currentImage = null;

// --------- UI helpers ---------
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
  if (progress !== null) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
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

// --------- Voz: STT e TTS ---------
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
  recognition.onerror = () => setStatus("Falha no reconhecimento de fala", 0);
}
function toggleMic() {
  if (!recognition) { addMessage("Reconhecimento de voz não suportado neste navegador.", "zenia"); return; }
  try {
    recognition.lang = (langSelect.value === "pt" ? "pt-PT" : langSelect.value === "es" ? "es-ES" : "en-US");
    recognition.start();
    setStatus("Ouvindo...", 20);
  } catch { setStatus("Não foi possível iniciar o microfone.", 0); }
}
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
initSpeechRecognition();

// --------- Wikimedia: Wikipedia + Commons ---------
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
  return (data.query?.search || []).map(it => ({ title: it.title, pageid: it.pageid }));
}
async function wikiExtract(lang, title) {
  const base = wikiBase(lang);
  const url = `${base}/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&formatversion=2&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao obter extrato");
  const data = await res.json();
  const page = (data.query?.pages || [])[0];
  return page?.extract || "";
}
function commonsBase() { return "https://commons.wikimedia.org"; }
async function commonsSearch(query, typeFilter = "", limit = 9) {
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

// --------- Visão: COCO-SSD ---------
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
  if (!currentImage) { status.textContent = "Carregue ou selecione uma imagem primeiro."; return; }
  if (!cocoModel) { status.textContent = "Modelo COCO‑SSD ainda não está pronto."; return; }
  status.textContent = "Analisando...";
  await tf.nextFrame();
  const canvas = document.getElementById("previewCanvas");
  const predictions = await cocoModel.detect(canvas);

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
loadCocoModel();

// --------- NLP leve: intenção + resposta natural ---------
const persona = {
  pt: {
    greet: "Olá! Tudo bem? Sou a Zenia. Posso te ajudar com curiosidades, explicações e ideias.",
    farewell: "Foi bom conversar contigo. Se precisar, é só chamar!",
    neutralTone: "Claro. Vou te explicar de forma direta e objetiva.",
    smalltalk: ["Tudo certo por aqui.", "Como está o teu dia?", "O que te deixou curioso hoje?"],
  },
  en: {
    greet: "Hey! How’s it going? I’m Zenia. I can help with facts, explanations, and ideas.",
    farewell: "Nice talking to you. Ping me anytime!",
    neutralTone: "Sure, I’ll keep it clear and straight.",
    smalltalk: ["All good here.", "How’s your day?", "What got you curious today?"],
  },
  es: {
    greet: "¡Hola! ¿Qué tal? Soy Zenia. Te ayudo con datos, explicaciones e ideas.",
    farewell: "Fue un gusto hablar contigo. ¡Aquí estaré!",
    neutralTone: "Claro, te lo explico de forma clara y directa.",
    smalltalk: ["Todo bien por aquí.", "¿Cómo va tu día?", "¿Qué te despertó curiosidad hoy?"],
  }
};

const STOPWORDS = {
  pt: new Set(["o","a","os","as","um","uma","uns","umas","de","da","do","das","dos","em","no","na","nos","nas","e","é","ser","que","como","por","para","com","sem","se","sobre","ao","à","às","aos"]),
  en: new Set(["the","a","an","of","in","on","and","is","to","for","with","without","as","by","at","from","that","this","these","those"]),
  es: new Set(["el","la","los","las","un","una","unos","unas","de","del","en","y","es","ser","que","como","por","para","con","sin","se","sobre","al","a","a la"])
};
function normalize(text) { return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim(); }
function tokenize(text, lang = "pt") {
  const stop = STOPWORDS[lang] || STOPWORDS.pt;
  return normalize(text).split(" ").filter(t => t && !stop.has(t));
}
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const total = tokens.length || 1;
  for (const [k, v] of tf.entries()) tf.set(k, v / total);
  return tf;
}
function cosineSimilarity(vecA, vecB) {
  let dot=0, nA=0, nB=0;
  const keys = new Set([...vecA.keys(), ...vecB.keys()]);
  for (const k of keys) {
    const a = vecA.get(k) || 0, b = vecB.get(k) || 0;
    dot += a*b; nA += a*a; nB += b*b;
  }
  return nA && nB ? dot / (Math.sqrt(nA)*Math.sqrt(nB)) : 0;
}

// léxico de intenções
const intentLexicon = {
  pt: {
    greet: ["olá","ola","oi","bom dia","boa tarde","boa noite","saudação","cumprimento"],
    farewell: ["tchau","adeus","até logo","até mais","vou indo","encerrar","obrigado","valeu"],
    thanks: ["obrigado","obrigada","valeu","agradecido","grato"],
    ask_name: ["quem é você","qual é o seu nome","quem és","como te chamas"],
    smalltalk: ["como vai","como você está","tudo bem","novidades","e aí"],
    opinion: ["o que você acha","qual sua opinião","você concorda","você discorda"],
    instruction: ["como faço","passo a passo","tutorial","guia","me ensina","ensina"]
  },
  en: {
    greet: ["hi","hello","hey","good morning","good afternoon","good evening","greetings"],
    farewell: ["bye","goodbye","see you","later","thanks, bye","gotta go"],
    thanks: ["thanks","thank you","appreciate it"],
    ask_name: ["who are you","what is your name","who are u","your name"],
    smalltalk: ["how are you","how’s it going","what’s up"],
    opinion: ["what do you think","your opinion","do you agree"],
    instruction: ["how do i","step by step","tutorial","guide","teach me"]
  },
  es: {
    greet: ["hola","buenos días","buenas tardes","buenas noches","saludos"],
    farewell: ["adiós","hasta luego","hasta pronto","nos vemos"],
    thanks: ["gracias","muchas gracias"],
    ask_name: ["quién eres","cómo te llamas","tu nombre"],
    smalltalk: ["cómo estás","qué tal","cómo te va"],
    opinion: ["qué piensas","tu opinión","estás de acuerdo"],
    instruction: ["cómo hago","paso a paso","tutorial","guía","enséñame"]
  }
};

async function detectIntent(text, lang) {
  const lx = intentLexicon[lang] || intentLexicon.pt;
  const n = normalize(text);
  for (const [intent, keys] of Object.entries(lx)) {
    for (const k of keys) if (n.includes(k)) return intent;
  }
  // validação leve pela Wikipedia
  try {
    const hits = await wikiSearch(lang, text, 2);
    const titles = hits.map(h => normalize(h.title)).join(" ");
    if (titles.includes("saudação") || titles.includes("cumprimento") || titles.includes("greeting")) return "greet";
    if (titles.includes("despedida") || titles.includes("goodbye")) return "farewell";
  } catch {}
  if (/\b(como|cómo|how)\b/i.test(text)) return "instruction";
  return "general";
}

function choosePersona(lang) { return persona[lang] || persona.pt; }

// construção de respostas
async function buildInstruction(query, lang) {
  try {
    const hits = await wikiSearch(lang, query, 4);
    if (!hits.length) return null;
    const text = await wikiExtract(lang, hits[0].title);
    if (!text || text.length < 200) return null;
    const steps = text.split(/\n+/).filter(p => p.length > 40).slice(0, 6);
    if (!steps.length) return null;
    const intro = (lang==="pt" ? "Vamos por partes:" : lang==="es" ? "Vamos por partes:" : "Let’s break it down:");
    const bullet = "• ";
    const rebuilt = steps.map(s => s.replace(/\s+/g," ").trim()).slice(0,5);
    return `${intro}\n${bullet}${rebuilt.join(`\n${bullet}`)}`;
  } catch { return null; }
}
function deduplicate(arr) {
  const seen = new Set(); const out = [];
  for (const s of arr) {
    const sig = normalize(s).slice(0,140);
    if (seen.has(sig)) continue;
    seen.add(sig); out.push(s);
  }
  return out;
}
async function buildNaturalAnswer(query, lang) {
  try {
    const hits = await wikiSearch(lang, query, 5);
    if (!hits.length) return null;
    const qTokens = tokenize(query, lang);
    const qTF = termFreq(qTokens);
    const sentencePool = [];
    for (const h of hits) {
      const txt = await wikiExtract(lang, h.title);
      const sentences = txt.split(/(?<=[\.\!\?\:])\s+/).slice(0, 800);
      for (const s of sentences) {
        const tokens = tokenize(s, lang);
        if (tokens.length < 3) continue;
        const tf = termFreq(tokens);
        const score = cosineSimilarity(qTF, tf);
        const lengthBonus = Math.min(tokens.length / 20, 1);
        sentencePool.push({ s, score: score*(0.7+0.3*lengthBonus) });
      }
    }
    sentencePool.sort((a,b)=>b.score-a.score);
    const top = deduplicate(sentencePool.map(x=>x.s)).slice(0,6).map(s=>s.replace(/\s+/g," ").trim());
    if (!top.length) return null;
    const preface = (lang==="pt" ? "Em termos simples:" : lang==="es" ? "En términos simples:" : "In simple terms:");
    const connect = (lang==="pt" ? "Além disso, " : lang==="es" ? "Además, " : "Additionally, ");
    if (top.length>1) top[1] = connect + top[1];
    return `${preface} ${top.join(" ")}`;
  } catch { return null; }
}

async function planResponse(text, lang) {
  const intent = await detectIntent(text, lang);
  const p = choosePersona(lang);
  if (intent === "greet") {
    const small = p.smalltalk[Math.floor(Math.random()*p.smalltalk.length)];
    return `${p.greet} ${small}`;
  }
  if (intent === "farewell") return p.farewell;
  if (intent === "thanks") return (lang==="pt" ? "De nada! " : lang==="es" ? "¡De nada! " : "You’re welcome! ") + p.smalltalk[0];
  if (intent === "ask_name") return (lang==="pt" ? "Eu sou a Zenia. " : lang==="es" ? "Soy Zenia. " : "I’m Zenia. ") + p.neutralTone;
  if (intent === "instruction") {
    const guide = await buildInstruction(text, lang);
    if (guide) return guide;
  }
  const answer = await buildNaturalAnswer(text, lang);
  if (answer) return answer;
  return p.neutralTone;
}

// --------- Fluxo principal ---------
async function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;
  const lang = langSelect.value || "pt";
  addMessage(text, "user");
  input.value = "";

  try {
    setStatus("Pensando...", 10);
    const reply = await planResponse(text, lang);
    addMessage(reply, "zenia");
    setStatus("Pronto!", 100);
    // opcional: não exibir fontes na conversa natural, mas podemos mostrar quando for resposta factual
    // Aqui, deixamos sem fontes para manter a naturalidade solicitada.
  } catch (err) {
    console.error(err);
    addMessage((lang==="pt" ? "Não consegui responder agora. Tenta novamente em alguns minutos." :
              lang==="es" ? "No pude responder ahora. Intenta de nuevo en unos minutos." :
              "I couldn’t answer now. Try again in a few minutes."), "zenia");
    setStatus("Erro no processamento", 0);
  }
}
