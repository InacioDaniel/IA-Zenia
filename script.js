// A futura melhor ia do mundo

(async () => {
  // DOM refs
  const $ = id => document.getElementById(id);
  const inputEl = $('userInput');
  const sendBtn = $('sendBtn');
  const chatArea = $('chatArea');
  const statusEl = $('status');
  const progressFill = $('modelProgress');
  const clearBtn = $('clearBtn');
  const sourcesEl = $('sources');
  const langSelect = $('langSelect');

  // Config (adjust if desired)
  const EMBED_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
  const GEN_MODEL = 'EleutherAI/gpt-neo-125M'; // small but usable in many browsers
  const CHUNK_SIZE = 800;
  const CHUNK_OVERLAP = 200;
  const TOP_K = 6;

  // State
  let embedPipeline = null;
  let genPipeline = null;
  let ready = false;

  function appendMessage(text, role = 'zenia') {
    const d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'user' : 'zenia');
    d.innerText = text;
    chatArea.appendChild(d);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function setStatus(s, p = 0) {
    if (statusEl) statusEl.innerText = 'Status: ' + s;
    if (progressFill) progressFill.style.width = `${Math.round(p * 100)}%`;
  }

  // safe loader with progress updates
  async function loadModels() {
    setStatus('Carregando modelo de embeddings...', 0.05);
    try {
      embedPipeline = await transformers.pipeline('feature-extraction', EMBED_MODEL, {
        progress: (p) => setStatus('Carregando embeddings...', 0.05 + p * 0.25)
      });
      setStatus('Embeddings prontos', 0.32);
    } catch (e) {
      console.error('Erro ao carregar embeddings', e);
      setStatus('Falha ao carregar embeddings — ver console');
      return;
    }

    setStatus('Carregando modelo de geração (pode demorar)...', 0.35);
    try {
      genPipeline = await transformers.pipeline('text-generation', GEN_MODEL, {
        progress: (p) => setStatus('Carregando gerador...', 0.35 + p * 0.6)
      });
      setStatus('Modelos prontos', 1);
    } catch (e) {
      console.warn('Falha ao carregar modelo de geração (fallback sem geração):', e);
      genPipeline = null;
      setStatus('Modelos prontos (sem gerador)', 1);
    }

    ready = true;
  }

  // text chunking
  function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const end = Math.min(text.length, i + size);
      out.push(text.slice(i, end).trim());
      if (end === text.length) break;
      i = Math.max(0, end - overlap);
    }
    return out;
  }

  // embedding helper
  async function embedText(text) {
    // embedPipeline returns nested arrays; normalize
    const res = await embedPipeline(text);
    // res may be [ [vec] ] or [vec]
    const vec = Array.isArray(res[0]) ? res[0] : res;
    return Float32Array.from(vec);
  }

  async function embedMany(texts, onProgress = null) {
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await embedText(texts[i]));
      if (onProgress) onProgress((i + 1) / texts.length);
    }
    return out;
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
  }

  // Wikimedia helpers
  async function wikiSearchExtract(term, lang = 'pt', limit = 8) {
    if (!term || term.trim().length === 0) return [];
    const api = `https://${lang}.wikipedia.org/w/api.php`;
    const sparams = new URLSearchParams({
      action: 'query', list: 'search', srsearch: term, srlimit: String(limit), format: 'json', origin: '*'
    });
    const sres = await fetch(`${api}?${sparams.toString()}`);
    if (!sres.ok) return [];
    const sjson = await sres.json();
    const sr = (sjson.query && sjson.query.search) || [];
    const results = [];
    for (const item of sr) {
      const pageid = item.pageid;
      const title = item.title;
      const qparams = new URLSearchParams({
        action: 'query', pageids: String(pageid), prop: 'extracts', exintro: '1', explaintext: '1', format: 'json', origin: '*'
      });
      const qres = await fetch(`${api}?${qparams.toString()}`);
      if (!qres.ok) continue;
      const qjson = await qres.json();
      const page = qjson.query && qjson.query.pages && qjson.query.pages[String(pageid)];
      const extract = page && page.extract ? page.extract : '';
      const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      results.push({ title, extract, url });
    }
    return results;
  }

  // RAG core
  async function askZenia(query, lang = 'pt') {
    if (!ready) {
      appendMessage('Modelos ainda carregando — aguarde...', 'zenia');
      return;
    }
    appendMessage(query, 'user');
    appendMessage('⏳ pesquisando e processando contexto...', 'zenia');

    // 1) fetch docs
    const docs = await wikiSearchExtract(query, lang, 12);
    if (!docs.length) {
      appendMessage('Não encontrei artigos relevantes no Wikimedia para essa consulta.', 'zenia');
      return;
    }

    // 2) chunk docs
    const chunks = [];
    docs.forEach(d => {
      const cs = chunkText(d.extract || '');
      cs.forEach((txt, i) => chunks.push({ title: d.title, url: d.url, text: txt, pageIndex: i }));
    });

    // 3) embed chunks (with progress)
    setStatus('Calculando embeddings dos trechos...', 0.1);
    const texts = chunks.map(c => c.text);
    // try to cache in sessionStorage by hash of first 200 chars of text array (lightweight)
    const cacheKey = 'zenia_emb_cache_v1';
    let cache = {};
    try { cache = JSON.parse(sessionStorage.getItem(cacheKey) || '{}'); } catch(e){ cache = {}; }

    const toEmbed = [];
    const toEmbedIdx = [];
    for (let i = 0; i < texts.length; i++) {
      const key = 't_' + (texts[i].slice(0, 120).replace(/\s+/g,'_'));
      if (cache[key]) {
        // use cached
      } else {
        toEmbed.push(texts[i]);
        toEmbedIdx.push(i);
      }
    }

    if (toEmbed.length > 0) {
      const newEmbeds = await embedMany(toEmbed, p => setStatus('Embeddings: ' + Math.round(p * 100) + '%', 0.1 + p * 0.25));
      // store in cache
      for (let k = 0; k < newEmbeds.length; k++) {
        const i = toEmbedIdx[k];
        const key = 't_' + (texts[i].slice(0, 120).replace(/\s+/g,'_'));
        cache[key] = Array.from(newEmbeds[k]);
      }
      try { sessionStorage.setItem(cacheKey, JSON.stringify(cache)); } catch (e) { /* storage full? ignore */ }
    }

    // build embeddings array (Float32)
    const chunkEmbeds = texts.map(t => {
      const key = 't_' + (t.slice(0, 120).replace(/\s+/g,'_'));
      const arr = cache[key];
      return Float32Array.from(arr);
    });

    // 4) embed query
    setStatus('Embeddando pergunta...', 0.5);
    const qemb = (await embedText(query));

    // 5) compute similarities and pick top-k
    const scored = chunks.map((c, i) => ({ ...c, score: cosine(chunkEmbeds[i], qemb) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, TOP_K);

    // 6) build RAG prompt
    let context = '';
    top.forEach((t, i) => {
      context += `Fonte [${i + 1}] ${t.title} (${t.url})\n${t.text}\n\n`;
    });

    const system = `Você é Zenia, assistente inteligente e confiável. Use apenas o contexto para responder e cite fontes usando [n]. Responda na língua solicitada.`;
    const prompt = `${system}\n\nContexto:\n${context}\n\nPergunta: ${query}\n\nResposta (com citações):`;

    // 7) generation
    appendMessage('✍️ gerando resposta (local)...', 'zenia');
    if (genPipeline) {
      try {
        setStatus('Gerando texto...', 0.85);
        // Use conservative generation params to avoid long runs in-browser
        const out = await genPipeline(prompt, { max_new_tokens: 200, do_sample: false });
        // out: [{ generated_text: "..." }]
        const genText = Array.isArray(out) ? (out[0].generated_text || out[0].text || '') : (out.generated_text || '');
        // Ensure we didn't repeat context — postprocess: remove prompt prefix if model echoes it
        let answer = genText;
        // If model echoes the prompt, try to strip occurrences of prompt
        if (answer.startsWith(prompt.slice(0, 120))) {
          answer = answer.replace(prompt, '').trim();
        }
        appendMessage(answer || '(nenhum texto gerado)', 'zenia');

        // show sources
        sourcesEl.innerHTML = '';
        top.forEach((t, i) => {
          const a = document.createElement('a');
          a.href = t.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.innerText = `[${i + 1}] ${t.title}`;
          sourcesEl.appendChild(a);
        });
        setStatus('Resposta gerada localmente', 1);
      } catch (e) {
        console.error('Erro geração local:', e);
        appendMessage('Erro ao gerar texto localmente — mostrando trechos recuperados.', 'zenia');
        appendMessage(context.slice(0, 1500) + (context.length > 1500 ? '...' : ''), 'zenia');
        setStatus('Erro na geração local', 0);
      }
    } else {
      // fallback: show concatenated context with guidance
      appendMessage('Modelo de geração não disponível no navegador — aqui estão os trechos relevantes:', 'zenia');
      appendMessage(context.slice(0, 1500) + (context.length > 1500 ? '...' : ''), 'zenia');
      setStatus('Resposta baseada somente em snippets (sem LLM local)', 1);
      sourcesEl.innerHTML = '';
      top.forEach((t, i) => {
        const a = document.createElement('a');
        a.href = t.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.innerText = `[${i + 1}] ${t.title}`;
        sourcesEl.appendChild(a);
      });
    }
  }

  // initialize models in background
  setStatus('Inicializando modelos — aguarde', 0.02);
  await loadModels();

  // wire UI
  sendBtn.addEventListener('click', async () => {
    const v = inputEl.value && inputEl.value.trim();
    if (!v) return;
    inputEl.value = '';
    const lang = langSelect.value || 'pt';
    await askZenia(v, lang);
  });
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = inputEl.value && inputEl.value.trim();
      if (!v) return;
      inputEl.value = '';
      const lang = langSelect.value || 'pt';
      await askZenia(v, lang);
    }
  });
  clearBtn.addEventListener('click', () => {
    chatArea.innerHTML = '';
    sourcesEl.innerHTML = '';
    setStatus('Conversa limpa', 0);
  });

  // final status
  if (ready) setStatus('Pronto — pergunte algo!', 1);
  else setStatus('Inicialização parcial (ver console)');

})();
