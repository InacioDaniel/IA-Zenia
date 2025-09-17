// zenia.js
// Núcleo da IA Zenia - versão com NLP + embeddings
// Feito por @inacio.u.daniel e Clério Cuita

let chatHistory = JSON.parse(localStorage.getItem("zeniaHistory")) || [];

// Carregar bibliotecas externas dinamicamente (sem API_KEY)
async function loadLibs() {
  await Promise.all([
    import("https://cdn.jsdelivr.net/npm/compromise@13.11.3/builds/compromise.min.js"),
    tf = await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.13.0/dist/tf.min.js"),
    use = await import("https://cdn.jsdelivr.net/npm/@tensorflow-models/universal-sentence-encoder")
  ]);
  window.nlp = window.nlp || compromise;
  window.encoder = await use.load();
}
loadLibs();

// Função para gerar embeddings
async function getEmbedding(text) {
  const emb = await window.encoder.embed([text]);
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

// Respostas base locais (banco inicial)
let knowledgeBase = [
  { q: "olá", a: "Olá! Tudo bem contigo?" },
  { q: "como estás", a: "Estou bem, obrigado por perguntar! E você?" },
  { q: "qual é o teu nome", a: "Eu sou a Zenia, sua assistente virtual." },
  { q: "o que sabes fazer", a: "Eu consigo conversar, aprender contigo e até procurar informações online." }
];

// Resposta principal
async function zeniaReply(userInput) {
  if (!window.encoder) return "Carregando meu cérebro... tenta de novo em instantes 🤯";

  // Processamento com compromise (NLP leve)
  let doc = nlp(userInput);
  let intent = doc.topics().out('array').join(", ") || "conversa";

  // Vetorizar entrada do usuário
  let userVec = await getEmbedding(userInput);

  // Procurar a resposta mais próxima semanticamente
  let best = { score: -1, text: "Ainda não sei responder isso... podes me ensinar?" };
  for (let item of knowledgeBase) {
    let vec = await getEmbedding(item.q);
    let sim = cosineSimilarity(userVec, vec);
    if (sim > best.score) best = { score: sim, text: item.a };
  }

  // Aprender com usuário (guardar no histórico)
  chatHistory.push({ pergunta: userInput, resposta: best.text });
  localStorage.setItem("zeniaHistory", JSON.stringify(chatHistory));

  return best.text;
}

// Conectar à interface
async function sendMessage() {
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  addMessage(msg, "user");
  input.value = "";

  const reply = await zeniaReply(msg);
  addMessage(reply, "bot");
}

// Adicionar mensagens no chat
function addMessage(text, sender) {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = sender === "user" ? "user-msg" : "bot-msg";
  div.innerText = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
