/* ----------------- Reasoning engine (usa semantic search) ----------------- */
async function reason(userText) {
  // 1) try semantic memory match
  const mem = await Learner.findSimilar(userText);
  if (mem) return mem;

  // 2) pattern-based responses (kept as before for direct commands)
  const t = userText.toLowerCase();
  if (/^(olá|ola|oi|ola|bom dia|boa tarde|boa noite|hey)\b/.test(t)) {
    return "Olá! Eu sou a Zenia — posso ajudar com perguntas, pesquisas web e tarefas.";
  }
  if (t.includes('como estás') || t.includes('como voce') || t.includes("tás")) {
    return "Estou pronta! Obrigada por perguntar. Como posso ajudar hoje?";
  }

  // ----- Nova lógica para pesquisar -----
  if (/^(pesquisar|procura|buscar)/i.test(t)) {
    const q = userText.replace(/^(pesquisar|procura|buscar)\s*/i,'').trim();
    if(!q) return "O que queres que eu pesquise? Ex.: 'Pesquisar clima em Luanda'";
    const results = await webSearch(q,1); // pega só 1 link
    const chosen = results[0];
    if(!chosen) return `Não encontrei resultados para "${q}".`;
    try {
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(chosen.href)}`;
      const resp = await fetch(proxy);
      const html = await resp.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi,'')
                       .replace(/<\/?[^>]+(>|$)/g,' ')
                       .replace(/\s+/g,' ')
                       .slice(0,1200);
      return `Resumo automático de "${chosen.title}":\n\n${text}`;
    } catch(e) {
      return `Não consegui aceder ao site. Aqui está o link: ${chosen.href}`;
    }
  }

  // 3) fallback curto
  if (t.length < 50) {
    return `Interessante! Podes dizer mais? Se queres, posso pesquisar "${userText}" na Web ou guardar isto na memória.`;
  }

  // default
  return `Vou tentar ajudar com isso: "${userText}".`;
}
