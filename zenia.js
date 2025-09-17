// zenia.js
// Núcleo da IA Zenia - conversação natural com embeddings
// Feito por @inacio.u.daniel e Clério Cuita

let chatHistory = JSON.parse(localStorage.getItem("zeniaHistory")) || [];

// Carregar TensorFlow + USE + Compromise (NLP)
let encoder;
async function loadLibs() {
  await Promise.all([
    import("https://cdn.jsdelivr.net/npm/compromise@13.11.3/builds/compromise.min.js"),
    import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.13.0/dist/tf.min.js"),
    import("https://cdn.jsdelivr.net/npm/@tensorflow-models/universal-sentence-encoder")
  ]).then((mods) => {
    window.nlp = window.nlp || mods[0].default || compromise;
    return mods[2].load();
  }).then((model) => {
    encoder = model;
    document.getElementById("embeddingStatus").textContent = "pronto ✅";
  });
}
loadLibs();

// Função para embeddings
async function getEmbedding(text) {
  const emb = await encoder.embed([text]);
  return emb.arraySync()[0];
}

// Similaridade por cosseno
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Base inicial de conhecimento
let knowledgeBase = [
  { q: "olá", a: "Olá! Como estás hoje?" },
  { q: "como estás", a: "Estou bem, obrigado por perguntar! E você?" },
  { q: "qual é o teu nome", a: "Eu sou a Zenia, tua assistente virtual." },
  { q: "o que sabes fazer", a: "Eu consigo conversar, aprender contigo e até procurar informações online." }
];

// Responder
async function zeniaReply(userInput) {
  if (!encoder) return "Ainda estou a carregar o meu cérebro... 🤯";

  // NLP leve
  let doc = nlp(userInput);
  let sentiment = doc.sentences().sentiment();
  let intent = doc.topics().out('array').join(", ") || "conversa";

  // Vetor do input
  let userVec = await getEmbedding(userInput);

  // Procurar em base + histórico
  let candidates = [...knowledgeBase, ...chatHistory];
  let best = { score: -1, text: "Ainda não sei responder isso... podes me ensinar?" };

  for (let item of candidates) {
    let vec = await getEmbedding(item.q);
    let sim = cosineSimilarity(userVec, vec);
    if (sim > best.score) best = { score: sim, text: item.a };
  }

  // Resposta adaptada
  let resposta = best.text;

  // Ajustar emoção
  if (sentiment < 0) resposta += " (Percebo que não estás muito bem. Queres conversar sobre isso?)";
  if (sentiment > 0.5) resposta += " 😃";

  // Guardar histórico
  chatHistory.push({ q: userInput, a: resposta });
  localStorage.setItem("zeniaHistory", JSON.stringify(chatHistory));
  document.getElementById("memoryCount").textContent = `Registos: ${chatHistory.length}`;

  return resposta;
}

// UI - enviar mensagem
document.getElementById("inputForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("textInput");
  const msg = input.value.trim();
  if (!msg) return;

  addMessage(msg, "user");
  input.value = "";

  const reply = await zeniaReply(msg);
  addMessage(reply, "zenia");

  // Falar resposta
  speak(reply);
});

// Adicionar mensagens no chat
function addMessage(text, sender) {
  const li = document.createElement("li");
  li.className = "message " + sender;
  li.textContent = text;
  document.getElementById("messages").appendChild(li);
  li.scrollIntoView({ behavior: "smooth" });
}

// Text-to-Speech
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  let utter = new SpeechSynthesisUtterance(text);
  utter.lang = "pt-PT";
  window.speechSynthesis.speak(utter);
}

// Atalhos de teclado
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "m") {
    toggleMic();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "d") {
    toggleTheme();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "k") {
    document.getElementById("textInput").focus();
  }
});

// Tema
function toggleTheme() {
  let body = document.body;
  let theme = body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  body.setAttribute("data-theme", theme);
}

// Limpar memória
document.getElementById("clearMemory").addEventListener("click", () => {
  localStorage.removeItem("zeniaHistory");
  chatHistory = [];
  document.getElementById("memoryCount").textContent = "Registos: 0";
  addMessage("Memória limpa 🧹", "zenia");
});
