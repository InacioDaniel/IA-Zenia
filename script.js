// script.js — frontend chat que usa o backend RAG (FastAPI + Qdrant + embeddings + LLM optional)
// Configure window.BACKEND_URL (ex: in index.html or via Netlify env injection) to point ao seu backend.

(() => {
  const $ = id => document.getElementById(id);
  const chatArea = $('chatArea');
  const sendBtn = $('sendBtn');
  const input = $('userInput');
  const sourcesEl = $('sources');
  const backendInput = $('backendUrl');

  // allow changing backend URL at runtime
  if (backendInput) {
    backendInput.addEventListener('change', () => window.BACKEND_URL = backendInput.value);
  }

  function appendMessage(text, role='zenia') {
    const d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'user' : 'zenia');
    d.innerText = text;
    chatArea.appendChild(d);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  async function askBackend(q, lang='pt') {
    const url = (window.BACKEND_URL || '').replace(/\/$/,'') + '/query';
    const payload = { q, lang, top_k: 6 };
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Backend error: ' + txt);
    }
    return await res.json();
  }

  async function onSend() {
    const v = input.value && input.value.trim();
    if (!v) return;
    appendMessage(v, 'user');
    input.value = '';
    appendMessage('… buscando resposta (Zenia) …', 'zenia');
    try {
      const data = await askBackend(v, 'pt');
      // replace last zenia "loading" message with actual answer
      const last = Array.from(chatArea.querySelectorAll('.msg.zenia')).pop();
      if (last) last.remove();
      appendMessage(data.answer || '(sem resposta)', 'zenia');

      // show sources
      sourcesEl.innerHTML = '';
      if (data.sources && data.sources.length) {
        const frag = document.createDocumentFragment();
        data.sources.forEach(s => {
          const a = document.createElement('a');
          a.href = s.url || '#';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = s.title || s.url || 'fonte';
          a.style.display = 'inline-block';
          a.style.marginRight = '8px';
          frag.appendChild(a);
        });
        sourcesEl.appendChild(frag);
      }
    } catch (e) {
      console.error(e);
      const last = Array.from(chatArea.querySelectorAll('.msg.zenia')).pop();
      if (last) last.remove();
      appendMessage('Erro: ' + e.message, 'zenia');
    }
  }

  sendBtn.addEventListener('click', onSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSend(); });

  // clear local UI history
  $('clearLocalBtn')?.addEventListener('click', () => { chatArea.innerHTML=''; sourcesEl.innerHTML=''; });

  // initial focus
  input.focus();

  // export helper (not sending to server)
  window.askBackend = askBackend;
})();