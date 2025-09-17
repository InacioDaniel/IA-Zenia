/* zenia.js
   Núcleo da IA Zenia — feito para rodar em browser (Netlify/GitHub Pages).
   Funcionalidades:
     - Memória local (IndexedDB fallback para localStorage)
     - Reconhecimento de voz (Web Speech API)
     - Text-to-Speech (speechSynthesis)
     - Interface acessível (atalhos, ARIA updates)
     - Buscas web básicas via fetch + CORS-proxy fallback
     - Aprendizado simples: guarda pares pergunta→resposta e usa para priorizar respostas
   OBS: Este ficheiro é modular e pronto para produção leve.
*/

const SELECTORS = {
  messages: document.getElementById('messages'),
  textInput: document.getElementById('textInput'),
  sendBtn: document.getElementById('sendBtn'),
  speakBtn: document.getElementById('speakBtn'),
  toggleMic: document.getElementById('toggleMic'),
  toggleTheme: document.getElementById('toggleTheme'),
  clearMemoryBtn: document.getElementById('clearMemory'),
  statusText: document.getElementById('statusText'),
  transcriptText: document.getElementById('transcriptText'),
  detectedLang: document.getElementById('detectedLang'),
  memoryCount: document.getElementById('memoryCount')
};

/* ---------- Simple IndexedDB wrapper with localStorage fallback ---------- */
const DB = (function () {
  const DB_NAME = 'zenia_db';
  const STORE = 'memories';
  let db = null;

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = () => resolve(null);
    });
  }

  async function add(item) {
    if (!db) {
      // fallback to localStorage list
      const list = JSON.parse(localStorage.getItem(STORE) || '[]');
      list.push(item);
      localStorage.setItem(STORE, JSON.stringify(list));
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(false);
    });
  }

  async function all() {
    if (!db) {
      return JSON.parse(localStorage.getItem(STORE) || '[]');
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  }

  async function clearAll() {
    if (!db) {
      localStorage.removeItem(STORE);
      return true;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  return { open, add, all, clearAll };
})();

/* ---------- Simple memory-based learner ---------- */
const Learner = (function () {
  // stores {id, type:'qa', q, a, score, createdAt}
  async function rememberPair(q, a) {
    const item = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      type: 'qa',
      q: q.slice(0, 1000),
      a: a.slice(0, 10000),
      score: 1,
      createdAt: new Date().toISOString()
    };
    await DB.add(item);
    updateMemoryCount();
  }
  async function findSimilar(q) {
    // naive similarity: substring or shared words
    const all = await DB.all();
    const qs = q.toLowerCase().split(/\W+/).filter(Boolean);
    let best = null;
    for (const item of all) {
      if (item.type !== 'qa') continue;
      const score = qs.reduce((s, w) => s + (item.q.toLowerCase().includes(w) ? 1 : 0), 0);
      if (!best || score > best.score) best = { item, score };
    }
    if (best && best.score > 0) return best.item.a;
    return null;
  }
  return { rememberPair, findSimilar };
})();

/* ---------- UI helpers ---------- */
function appendMessage(text, who = 'zenia', meta = {}) {
  const li = document.createElement('li');
  li.className = 'message ' + (who === 'user' ? 'user' : 'zenia');
  li.setAttribute('role', 'listitem');
  li.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  SELECTORS.messages.appendChild(li);
  SELECTORS.messages.scrollTop = SELECTORS.messages.scrollHeight;
  return li;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/* ---------- Minimal language detection ---------- */
function detectLanguage(text) {
  // Heuristic: check for Portuguese words, English words, Spanish, French
  const t = text.toLowerCase();
  if (/\b(o|a|e|um|uma|que|pra|tá|olá|nengue)\b/.test(t)) return 'pt';
  if (/\b(the|is|are|you|hello|hi)\b/.test(t)) return 'en';
  if (/\b(el|la|que|hola|buen)\b/.test(t)) return 'es';
  if (/\b(la|le|bonjour|oui)\b/.test(t)) return 'fr';
  return navigator.language ? navigator.language.slice(0,2) : 'en';
}

/* ---------- Speech Recognition (microphone input) ---------- */
const Voice = (function () {
  let recognizer = null;
  let listening = false;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.lang = navigator.language || 'pt-PT';
  }

  function start() {
    if (!recognizer) { setStatus('Reconhecimento de voz não suportado neste navegador'); return; }
    if (listening) return;
    recognizer.lang = navigator.language || 'pt-PT';
    SELECTORS.transcriptText.textContent = '';
    recognizer.start();
    listening = true;
    setStatus('Ouvindo...');
  }
  function stop() {
    if (!recognizer || !listening) return;
    recognizer.stop();
    listening = false;
    setStatus('Parado');
  }

  if (recognizer) {
    recognizer.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      SELECTORS.transcriptText.textContent = final || interim || '—';
      if (final) {
        // Simulate user sending the final transcript
        handleUserMessage(final);
      }
    };
    recognizer.onerror = (e) => {
      console.warn('Reconhecimento erro', e);
      setStatus('Erro no reconhecimento');
      listening = false;
    };
    recognizer.onend = () => {
      listening = false;
      setStatus('Parado');
    };
  }

  return { start, stop, isAvailable: !!recognizer };
})();

/* ---------- Text-to-Speech ---------- */
const TTS = (function () {
  function speak(text, lang) {
    if (!('speechSynthesis' in window)) { setStatus('TTS não suportado'); return; }
    const msg = new SpeechSynthesisUtterance();
    msg.text = stripTags(text);
    msg.lang = (lang || navigator.language) || 'pt-PT';

    // Choose a voice that matches language if possible
    const voices = speechSynthesis.getVoices();
    let v = voices.find(x => x.lang && x.lang.startsWith(msg.lang));
    if (!v) v = voices.find(x => x.default) || voices[0];
    if (v) msg.voice = v;

    speechSynthesis.cancel();
    speechSynthesis.speak(msg);
    setStatus('A falar...');
    msg.onend = () => setStatus('Pronto');
  }
  function stripTags(s) { return String(s).replace(/<\/?[^>]+(>|$)/g, ""); }
  return { speak };
})();

/* ---------- Simple web search (fetch + scraping fallback) ---------- */
async function webSearch(query, maxResults = 3) {
  // Try to use DuckDuckGo's HTML search result (no API). Use allorigins as CORS proxy fallback.
  const ddg = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddg)}`;
  setStatus('A pesquisar web...');
  try {
    const resp = await fetch(proxy);
    if (!resp.ok) throw new Error('proxy fail');
    const html = await resp.text();
    // naive parse: extract <a class="result__a" href="...">Title</a>
    const results = [];
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // ddg uses result__a or links - try query selectors
    const anchors = tmp.querySelectorAll('a.result__a, a.link');
    for (let a of anchors) {
      if (results.length >= maxResults) break;
      let href = a.getAttribute('href') || a.dataset.href || '';
      let title = a.textContent.trim();
      if (!href) continue;
      // Moz: ddg returns /l/?kh=-1&uddg=<encoded url> sometimes
      const m = href.match(/uddg=(.+)$/);
      if (m) {
        try { href = decodeURIComponent(m[1]); } catch (e) {}
      }
      results.push({ title, href });
    }
    setStatus('Pesquisa concluída');
    if (results.length) return results;
    // If none parsed, fallback to returning a link to search
    return [{ title: `Resultados para "${query}"`, href: ddg }];
  } catch (err) {
    console.warn('Search failed:', err);
    setStatus('Pesquisa falhou (CORS).');
    return [{ title: `Pesquisar: ${query}`, href: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` }];
  }
}

/* ---------- Reasoning engine (very simple, pattern-based + memory) ---------- */
async function reason(userText) {
  // 1) try direct memory match
  const mem = await Learner.findSimilar(userText);
  if (mem) return mem;

  // 2) Basic pattern responses
  const t = userText.toLowerCase();
  if (/^(olá|ola|oi|ola|bom dia|boa tarde|boa noite|hey)\b/.test(t)) {
    return "Olá! Eu sou a Zenia — posso ajudar com perguntas, pesquisas web e tarefas. Tenta: 'Procura novidades sobre energia solar' ou 'Resumo: Segunda Guerra Mundial'.";
  }
  if (t.includes('como estás') || t.includes('como voce') || t.includes("tás")) {
    return "Estou pronta! Obrigada por perguntar. Como posso ajudar hoje?";
  }
  if (t.startsWith('pesquisar') || t.startsWith('procura') || t.startsWith('buscar')) {
    // extract query after the verb
    const q = userText.replace(/^(pesquisar|procura|buscar)\s*/i, '');
    if (!q.trim()) return "O que queres que eu pesquise? Diz: 'Pesquisar clima em Luanda' por exemplo.";
    const results = await webSearch(q, 4);
    // build reply summarizing links
    let reply = `Encontrei ${results.length} resultado(s) para "${q}":\n`;
    for (const r of results) reply += `• ${r.title} — ${r.href}\n`;
    return reply;
  }
  if (t.includes('resume') || t.includes('resumo') || t.includes('resuma')) {
    // naive: ask to fetch web summary; try search + ask user to choose result
    const q = userText.replace(/.*(sobre|de|da|do)\s+/i, '').trim() || userText;
    const results = await webSearch(q, 3);
    let reply = `Posso resumir fontes. Encontrei:\n`;
    for (let i = 0; i < results.length; i++) reply += `${i+1}. ${results[i].title}\n`;
    reply += `Diz "Resumo 1" para obter resumo da primeira fonte.`;
    // store the last search for follow-up
    window._lastSearch = { query: q, results };
    return reply;
  }

  if (/^resumo\s+(\d+)/i.test(t) && window._lastSearch) {
    const n = Number(t.match(/^resumo\s+(\d+)/i)[1]) - 1;
    const chosen = window._lastSearch.results && window._lastSearch.results[n];
    if (!chosen) return "Não encontrei essa fonte. Diz 'Resumo 1' ou 'Resumo 2'.";
    // try to fetch chosen.href and give first 300 chars
    try {
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(chosen.href)}`;
      const resp = await fetch(proxy);
      const html = await resp.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?[^>]+(>|$)/g, ' ');
      const snippet = text.replace(/\s+/g, ' ').slice(0, 1200);
      return `Resumo (fonte: ${chosen.title}):\n` + snippet + '\n\n(Resumo automático — pode conter ruído.)';
    } catch (e) {
      return `Não consegui aceder à fonte por CORS. Aqui está o link: ${chosen.href}`;
    }
  }

  // 3) fallback creative answer: try to synthesize helpful reply
  if (t.length < 50) {
    // short prompt: provide suggestion
    return `Interessante! Podes dizer mais? Se queres, eu posso pesquisar "${userText}" na Web ou guardar isto na minha memória.`;
  }

  // Default: attempt a concise summary style reply
  return `Vou tentar ajudar com isso: "${userText}". Se precisares que eu pesquise, escreve "Pesquisar ${userText}".`;
}

/* ---------- Event handlers and orchestration ---------- */
async function handleUserMessage(text) {
  text = String(text).trim();
  if (!text) return;
  appendMessage(text, 'user');
  SELECTORS.textInput.value = '';
  setStatus('A processar...');
  SELECTORS.detectedLang.textContent = detectLanguage(text);

  // small heuristic: if user asks Zenia to remember
  if (/^lembra|guarda|regista|memória/i.test(text)) {
    // pattern: "guarda que X é Y" or "lembra que ..."
    const rest = text.replace(/^(lembra|guarda|regista|memória)\s*(que)?\s*/i, '');
    await Learner.rememberPair(rest, `Lembrete armazenado: ${rest}`);
    const confirmation = `Ok — guardei: "${rest}"`;
    appendMessage(confirmation, 'zenia');
    TTS.speak(confirmation);
    return;
  }

  // compute reasoning
  try {
    const reply = await reason(text);
    appendMessage(reply, 'zenia');
    // store to memory as naive learning: pair user->reply
    await Learner.rememberPair(text, reply);
    // speak the reply
    const lang = detectLanguage(text);
    TTS.speak(reply, lang);
  } catch (err) {
    console.error(err);
    const fallback = "Desculpa, ocorreu um erro ao processar. Tenta de novo.";
    appendMessage(fallback, 'zenia');
    TTS.speak(fallback);
  }
  updateMemoryCount();
}

/* ---------- Status and UI wiring ---------- */
function setStatus(s) {
  SELECTORS.statusText.textContent = s;
}

/* Update memory count */
async function updateMemoryCount() {
  const all = await DB.all();
  SELECTORS.memoryCount.textContent = `Registos: ${all.length}`;
}

/* Keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    toggleMic();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    toggleTheme();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    SELECTORS.textInput.focus();
  }
});

/* Form submit */
document.getElementById('inputForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = SELECTORS.textInput.value.trim();
  if (text) handleUserMessage(text);
});

/* Buttons */
SELECTORS.sendBtn.addEventListener('click', (ev) => {
  ev.preventDefault();
  const text = SELECTORS.textInput.value.trim();
  if (text) handleUserMessage(text);
});
SELECTORS.speakBtn.addEventListener('click', (ev) => {
  ev.preventDefault();
  // read last Zenia message or input
  const last = Array.from(SELECTORS.messages.querySelectorAll('.message.zenia')).pop();
  const text = last ? last.textContent : SELECTORS.textInput.value;
  if (text) TTS.speak(text);
});
SELECTORS.toggleMic.addEventListener('click', toggleMic);
SELECTORS.toggleTheme.addEventListener('click', toggleTheme);
SELECTORS.clearMemoryBtn.addEventListener('click', async () => {
  if (!confirm('Apagar toda a memória local? Esta ação não pode ser desfeita.')) return;
  await DB.clearAll();
  updateMemoryCount();
  appendMessage('Memória local limpa.', 'zenia');
});

/* ---------- Mic toggle ---------- */
function toggleMic() {
  if (!Voice.isAvailable) {
    alert('Reconhecimento de voz não suportado neste navegador.');
    return;
  }
  // start/stop by reading status text
  if (SELECTORS.statusText.textContent === 'Ouvindo...') {
    Voice.stop();
    SELECTORS.toggleMic.classList.remove('active');
  } else {
    Voice.start();
    SELECTORS.toggleMic.classList.add('active');
  }
}

/* ---------- Theme toggle ---------- */
function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', next);
  localStorage.setItem('zenia_theme', next);
}

/* ---------- Initialization ---------- */
async function init() {
  // open DB
  await DB.open();
  // load stored theme
  const theme = localStorage.getItem('zenia_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.setAttribute('data-theme', theme);

  // greet user
  const greeting = `Olá! Eu sou a Zenia — diz olá, pede uma pesquisa (ex: "Pesquisar energia solar") ou fala comigo. Atalhos: Ctrl+M (mic), Ctrl+D (tema).`;
  appendMessage(greeting, 'zenia');
  TTS.speak('Olá! Zenia pronta.', navigator.language || 'pt-PT');

  // wire detection of voices (some browsers populate asynchronously)
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => {};
  }

  // show language
  SELECTORS.detectedLang.textContent = navigator.language || 'pt';

  // load small sample memory if none
  const mem = await DB.all();
  if (!mem.length) {
    await DB.add({ id: 'init_1', type: 'qa', q: 'qual o teu nome', a: 'Chamo-me Zenia — assistente local criada por @inacio.u.daniel e Clério Cuita.', createdAt: new Date().toISOString() });
  }
  updateMemoryCount();
  setStatus('Pronto');
}
init();

/* ---------- Utility: escape for safety (already used) ---------- */

/* End of zenia.js */
