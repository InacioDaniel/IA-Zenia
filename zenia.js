/* ----------------- External datasets loader ----------------- */
async function loadExternalJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Erro ao carregar dataset: " + url);
    return await resp.json();
  } catch (err) {
    console.error("Falha no fetch:", err);
    return null;
  }
}

async function importSQuAD(url) {
  const squad = await loadExternalJSON(url);
  if (!squad) return;
  for (const entry of squad.data) {
    for (const p of entry.paragraphs) {
      for (const qa of p.qas) {
        if (qa.answers.length > 0) {
          await Learner.rememberPair(qa.question, qa.answers[0].text);
        }
      }
    }
  }
  console.log("SQuAD carregado ✅");
}

async function importCoQA(url) {
  const coqa = await loadExternalJSON(url);
  if (!coqa) return;
  for (const d of coqa.data) {
    for (let i = 0; i < d.questions.length; i++) {
      await Learner.rememberPair(d.questions[i], d.answers[i]);
    }
  }
  console.log("CoQA carregado ✅");
}

async function importQuAC(url) {
  const quac = await loadExternalJSON(url);
  if (!quac) return;
  for (const entry of quac.data) {
    for (const p of entry.paragraphs) {
      for (const qa of p.qas) {
        if (qa.answers.length > 0) {
          await Learner.rememberPair(qa.question, qa.answers[0].text);
        }
      }
    }
  }
  console.log("QuAC carregado ✅");
}

async function importPersonaChat(url) {
  const persona = await loadExternalJSON(url);
  if (!persona) return;
  for (const utt of persona.utterances || []) {
    if (utt.history.length > 0 && utt.candidates.length > 0) {
      const q = utt.history[utt.history.length - 1];
      const a = utt.candidates[0];
      await Learner.rememberPair(q, a);
    }
  }
  console.log("Persona-Chat carregado ✅");
}

async function importReddit(url) {
  const reddit = await loadExternalJSON(url);
  if (!reddit) return;
  for (const conv of reddit.conversations) {
    for (let i = 0; i < conv.length - 1; i++) {
      await Learner.rememberPair(conv[i], conv[i + 1]);
    }
  }
  console.log("Reddit carregado ✅");
}

/* ----------------- Datasets init ----------------- */
async function initDatasets() {
  // ⚠️ cuidado: são datasets muito grandes, podes comentar os que não quiseres
  await importSQuAD("https://rajpurkar.github.io/SQuAD-explorer/dataset/train-v1.1.json");
  await importCoQA("https://nlp.stanford.edu/data/coqa/coqa-train-v1.0.json");
  await importQuAC("https://s3.amazonaws.com/my89public/quac/train_v0.2.json");
  await importPersonaChat("https://raw.githubusercontent.com/facebookresearch/ParlAI/main/parlai/tasks/convai2/train.json");
  await importReddit("https://raw.githubusercontent.com/poly-ai/reddit-conversational-dataset/master/sample.json");
}

/* ----------------- Zenia INIT ----------------- */
async function init() {
  console.log("🚀 Inicializando Zenia...");

  // carregar memória local, embeddings, tema, TTS/STT...
  await Learner.loadMemory();
  await Embeddings.load();

  Theme.applyCurrent();
  Voice.init();
  Mic.init();

  // dar uma saudação
  speak("Olá, eu sou a Zenia. Como posso ajudar?");

  // carregar datasets externos (grandes)
  initDatasets().then(() => {
    console.log("✅ Todos os datasets externos foram integrados.");
    updateMemoryCount();
  });
}

// arranque da Zenia
window.addEventListener("load", init);
