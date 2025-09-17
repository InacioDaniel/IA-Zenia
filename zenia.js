/* zenia.js (atualizado) */

/* ----------------- Seletores ----------------- */
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
  memoryCount: document.getElementById('memoryCount'),
  embeddingStatus: document.getElementById('embeddingStatus')
};

/* ----------------- DB wrapper ----------------- */
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
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => resolve(null);
    });
  }

  async function add(item) {
    if (!db) {
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
    if (!db) return JSON.parse(localStorage.getItem(STORE) || '[]');
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  }

  async function clearAll() {
    if (!db) { localStorage.removeItem(STORE); return true; }
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

/* ----------------- Embeddings (USE) ----------------- */
let USEModel = null;
async function loadUSEModel() {
  try {
    SELECTORS.embeddingStatus.textContent = 'a carregar...';
    USEModel = await window['use'].load();
    SELECTORS.embeddingStatus.textContent = 'pronto';
    console.log('USE model loaded');
  } catch (e) {
    console.warn('Falha ao carregar USE model', e);
    USEModel = null;
    SELECTORS.embeddingStatus.textContent = 'não disponível (fallback heurístico)';
  }
}

async function embedText(text) {
  if (!USEModel) return null;
  const embeddings = await USEModel.embed([String(text)]);
  const arr = await embeddings.array();
  embeddings.dispose?.();
  return Float32Array.from(arr[0]);
}

function cosineSimilarity(a, b) {
  if (!a || !b) return -1;
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (na===0||nb===0) return -1;
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}

/* ----------------- Learner / Memory ----------------- */
const Learner = (function() {
  async function rememberPair(q,a){
    const embeddingArr = USEModel ? Array.from(await embedText(q)) : null;
    const item = {
      id:'m_'+Date.now()+'_'+Math.random().toString(36).slice(2,9),
      type:'qa',
      q:q.slice(0,1000),
      a:a.slice(0,10000),
      score:1,
      embedding: embeddingArr,
      createdAt:new Date().toISOString()
    };
    await DB.add(item);
    updateMemoryCount();
  }

  async function findSimilar(q, topK=1){
    const allMem = await DB.all();
    if(!allMem.length) return null;

    if(USEModel){
      const qEmb = await embedText(q);
      if(qEmb){
        const scored = [];
        for(const item of allMem){
          if(!item.embedding) continue;
          const emb = Float32Array.from(item.embedding);
          const sim = cosineSimilarity(qEmb, emb);
          scored.push({item,sim});
        }
        scored.sort((a,b)=>b.sim-a.sim);
        if(scored.length && scored[0].sim>0.55){
          return scored.slice(0,topK).map(s=>s.item.a).join('\n\n');
        }
      }
    }

    // fallback heurístico
    const qs = q.toLowerCase().split(/\W+/).filter(Boolean);
    let best = null;
    for(const item of allMem){
      if(item.type!=='qa') continue;
      const score = qs.reduce((s,w)=>s+(item.q.toLowerCase().includes(w)?1:0),0);
      if(!best || score>best.score) best={item,score};
    }
    if(best && best.score>0) return best.item.a;
    return null;
  }

  async function ensureEmbeddingsForAll(){
    if(!USEModel) return;
    const allMem = await DB.all();
    let updated = 0;
    for(const item of allMem){
      if(item.type==='qa' && (!item.embedding||!item.embedding.length)){
        try{
          const emb = await embedText(item.q);
          item.embedding = Array.from(emb);
          await DB.add(item);
          updated++;
        }catch(e){ console.warn('Erro a gerar embedding',item.id,e);}
      }
    }
    if(updated) console.log(`Atualizados ${updated} memórias com embeddings.`);
  }

  return { rememberPair, findSimilar, ensureEmbeddingsForAll };
})();

/* ----------------- UI helpers ----------------- */
function appendMessage(text, who='zenia'){
  const li = document.createElement('li');
  li.className = 'message ' + (who==='user'?'user':'zenia');
  li.setAttribute('role','listitem');
  li.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  SELECTORS.messages.appendChild(li);
  SELECTORS.messages.scrollTop = SELECTORS.messages.scrollHeight;
  return li;
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');}

/* ----------------- Language detection ----------------- */
function detectLanguage(text){
  const t = (text||'').toLowerCase();
  if(/\b(o|a|e|um|uma|que|pra|tá|olá|nengue)\b/.test(t)) return 'pt';
  if(/\b(the|is|are|you|hello|hi)\b/.test(t)) return 'en';
  if(/\b(el|la|que|hola|buen)\b/.test(t)) return 'es';
  if(/\b(la|le|bonjour|oui)\b/.test(t)) return 'fr';
  return navigator.language?navigator.language.slice(0,2):'en';
}

/* ----------------- Speech Recognition ----------------- */
const Voice=(function(){
  let recognizer=null, listening=false;
  const SpeechRecognition = window.SpeechRecognition||window.webkitSpeechRecognition||null;
  if(SpeechRecognition){
    recognizer = new SpeechRecognition();
    recognizer.continuous=false;
    recognizer.interimResults=true;
    recognizer.lang = navigator.language || 'pt-PT';
  }

  function start(){
    if(!recognizer){ setStatus('Reconhecimento de voz não suportado'); return;}
    if(listening) return;
    recognizer.lang = navigator.language||'pt-PT';
    SELECTORS.transcriptText.textContent='';
    recognizer.start();
    listening=true;
    setStatus('Ouvindo...');
  }
  function stop(){
    if(!recognizer||!listening) return;
    recognizer.stop();
    listening=false;
    setStatus('Parado');
  }

  if(recognizer){
    recognizer.onresult = ev => {
      let interim='', final='';
      for(let i=0;i<ev.results.length;i++){
        if(ev.results[i].isFinal) final+=ev.results[i][0].transcript;
        else interim+=ev.results[i][0].transcript;
      }
      SELECTORS.transcriptText.textContent=final||interim||'—';
      if(final) handleUserMessage(final);
    };
    recognizer.onerror = e => { console.warn('Erro voice',e); setStatus('Erro no reconhecimento'); listening=false; };
    recognizer.onend = ()=>{ listening=false; setStatus('Parado'); };
  }

  return { start, stop, isAvailable: !!recognizer };
})();

/* ----------------- Text-to-Speech ----------------- */
const TTS=(function(){
  function speak(text, lang){
    if(!('speechSynthesis' in window)){ setStatus('TTS não suportado'); return;}
    const msg = new SpeechSynthesisUtterance();
    msg.text = stripTags(text);
    msg.lang = lang||navigator.language||'pt-PT';
    const voices = speechSynthesis.getVoices();
    let v = voices.find(x=>x.lang && x.lang.startsWith(msg.lang));
    if(!v) v = voices.find(x=>x.default)||voices[0];
    if(v) msg.voice=v;
    speechSynthesis.cancel();
    speechSynthesis.speak(msg);
    setStatus('A falar...');
    msg.onend=()=>setStatus('Pronto');
  }
  function stripTags(s){return String(s).replace(/<\/?[^>]+(>|$)/g,'');}
  return { speak };
})();

/* ----------------- Web search ----------------- */
async function webSearch(query,maxResults=3){
  const ddg=`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(ddg)}`;
  setStatus('A pesquisar web...');
  try{
    const resp = await fetch(proxy);
    if(!resp.ok) throw new Error('proxy fail');
    const html = await resp.text();
    const results=[];
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const anchors = tmp.querySelectorAll('a.result__a, a.link');
    for(let a of anchors){
      if(results.length>=maxResults) break;
      let href=a.getAttribute('href')||a.dataset.href||'';
      let title=a.textContent.trim();
      if(!href) continue;
      const m=href.match(/uddg=(.+)$/);
      if(m){ try{ href=decodeURIComponent(m[1]); } catch(e){} }
      results.push({title,href});
    }
    setStatus('Pesquisa concluída');
    if(results.length) return results;
    return [{title:`Resultados para "${query}"`,href:ddg}];
  }catch(err){ console.warn('Search fail',err); setStatus('Pesquisa falhou (CORS).'); return [{title:`Pesquisar: ${query}`,href:`https://duckduckgo.com/?q=${encodeURIComponent(query)}`}]; }
}

/* ----------------- Reasoning engine ----------------- */
async function reason(userText){
  const mem = await Learner.findSimilar(userText);
  if(mem) return mem;

  const t=userText.toLowerCase();
  if(/^(olá|ola|oi|ola|bom dia|boa tarde|boa noite|hey)\b/.test(t)) return "Olá! Eu sou a Zenia — posso ajudar com perguntas, pesquisas web e tarefas.";
  if(t.includes('como estás') || t.includes('como voce') || t.includes("tás")) return "Estou pronta! Obrigada por perguntar. Como posso ajudar hoje?";

  if(/^(pesquisar|procura|buscar)/i.test(t)){
    const q = userText.replace(/^(pesquisar|procura|buscar)\s*/i,'').trim();
    if(!q) return "O que queres que eu pesquise? Ex.: 'Pesquisar clima em Luanda'";
    const results = await webSearch(q,1);
    const chosen = results[0];
    if(!chosen) return `Não encontrei resultados para "${q}".`;
    try{
      const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(chosen.href)}`;
      const resp = await fetch(proxy);
      const html = await resp.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi,'')
                       .replace(/<\/?[^>]+(>|$)/g,' ')
                       .replace(/\s+/g,' ')
                       .slice(0,1200);
      return `Resumo automático de "${chosen.title}":\n\n${text}`;
    }catch(e){
      return `Não consegui aceder ao site. Aqui está o link: ${chosen.href}`;
    }
  }

  if(t.length<50) return `Interessante! Podes dizer mais? Se queres, posso pesquisar "${userText}" na Web ou guardar isto na memória.`;

  return `Vou tentar ajudar com isso: "${userText}".`;
}

/* ----------------- Message handling ----------------- */
async function handleUserMessage(text){
  text=String(text).trim();
  if(!text) return;
  appendMessage(text,'user');
  SELECTORS.textInput.value='';
  setStatus('A processar...');
  SELECTORS.detectedLang.textContent=detectLanguage(text);

  if(/^(lembra|guarda|regista|memória)/i.test(text)){
    const rest=text.replace(/^(lembra|guarda|regista|memória)\s*(que)?\s*/i,'');
    await Learner.rememberPair(rest, `Lembrete armazenado: ${rest}`);
    const confirmation=`Ok — guardei: "${rest}"`;
    appendMessage(confirmation,'zenia');
    TTS.speak(confirmation);
    return;
  }

  try{
    const reply = await reason(text);
    appendMessage(reply,'zenia');
    await Learner.rememberPair(text,reply);
    TTS.speak(reply, detectLanguage(text));
  }catch(err){
    console.error(err);
    const fallback="Desculpa, ocorreu um erro ao processar. Tenta de novo.";
    appendMessage(fallback,'zenia');
    TTS.speak(fallback);
  }
  updateMemoryCount();
}

/* ----------------- UI / State ----------------- */
function setStatus(s){ SELECTORS.statusText.textContent=s; }
async function updateMemoryCount(){ const all = await DB.all(); SELECTORS.memoryCount.textContent=`Registos: ${all.length}`; }

/* ----------------- Buttons / Shortcuts ----------------- */
document.addEventListener('keydown', e=>{
  if(e.ctrlKey && e.key.toLowerCase()==='m'){ e.preventDefault(); toggleMic(); }
  else if(e.ctrlKey && e.key.toLowerCase()==='d'){ e.preventDefault(); toggleTheme(); }
  else if(e.ctrlKey && e.key.toLowerCase()==='k'){ e.preventDefault(); SELECTORS.textInput.focus(); }
});

document.getElementById('inputForm').addEventListener('submit', ev=>{ ev.preventDefault(); const text=SELECTORS.textInput.value.trim(); if(text) handleUserMessage(text); });
SELECTORS.sendBtn.addEventListener('click', ev=>{ ev.preventDefault(); const text=SELECTORS.textInput.value.trim(); if(text) handleUserMessage(text); });
SELECTORS.speakBtn.addEventListener('click', ev=>{ ev.preventDefault(); const last=Array.from(SELECTORS.messages.querySelectorAll('.message.zenia')).pop(); const text=last?last.textContent:SELECTORS.textInput.value; if(text) TTS.speak(text); });
SELECTORS.toggleMic.addEventListener('click', toggleMic);
SELECTORS.toggleTheme.addEventListener('click', toggleTheme);
SELECTORS.clearMemoryBtn.addEventListener('click', async ()=>{
  if(!confirm('Apagar toda a memória local? Esta ação não pode ser desfeita.')) return;
  await DB.clearAll();
  updateMemoryCount();
  appendMessage('Memória local limpa.','zenia');
});

/* ----------------- Toggle mic / theme ----------------- */
function toggleMic(){ if(!Voice.isAvailable){ alert('Reconhecimento de voz não suportado.'); return;}
  if(SELECTORS.statusText.textContent==='Ouvindo...'){ Voice.stop(); SELECTORS.toggleMic.classList.remove('active'); }
  else { Voice.start(); SELECTORS.toggleMic.classList.add('active'); }
}
function toggleTheme(){
  const body=document.body;
  const current=body.getAttribute('data-theme')||'light';
  const next=current==='light'?'dark':'light';
  body.setAttribute('data-theme',next);
  localStorage.setItem('zenia_theme',next);
}

/* ----------------- Initialization ----------------- */
async function init(){
  await DB.open();
  await loadUSEModel();
  await Learner.ensureEmbeddingsForAll();

  const theme = localStorage.getItem('zenia_theme')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.body.setAttribute('data-theme',theme);

  const greeting='Olá! Eu sou a Zenia — agora com busca semântica local (embeddings). Podes pedir para me lembrar de algo, ou dizer "Pesquisar ..."';
  appendMessage(greeting,'zenia');
  TTS.speak('Olá! Zenia pronta.',navigator.language||'pt-PT');

  const mem = await DB.all();
  if(!mem.length){
    await DB.add({
      id:'init_
