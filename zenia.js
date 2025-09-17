// zenia.js — Motor da IA Zenia
// by @inacio.u.daniel & Clério Cuita

let chatHistory = JSON.parse(localStorage.getItem("zeniaHistory")) || [];
let encoder;

// Banco inicial de conhecimento
let knowledgeBase = [
  { q: "olá", a: ["Olá! Como estás?", "Oi, tudo bem contigo?", "E aí, firmeza?"] },
  { q: "como estás", a: ["Estou ótima! E você?", "Tudo certo por aqui. E contigo?", "Estou bem, valeu por perguntar!"] },
  { q: "qual é o teu nome", a: ["Eu sou a Zenia, prazer em te conhecer!", "Chamo-me Zenia, tua assistente virtual."] },
  { q: "o que sabes fazer", a: ["Consigo conversar, aprender contigo e até procurar informações online.", "Posso bater papo, lembrar coisas e evoluir com o tempo."] }
];

// Carregar modelo de embeddings
async function loadEncoder() {
  encoder = await use.load();
}
loadEncoder();

// Gerar embeddings
async function getEmbedding(text) {
  const emb = await encoder.embed([text]);
  return emb.arraySync()[0];
}

// Similaridade cosseno
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Escolher resposta de forma variada
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Gerar resposta
async function zeniaReply(userInput) {
  if (!encoder) return "Ainda estou a aquecer o cérebro... tenta outra vez daqui a pouco 🔄";

  const userVec = await getEmbedding(userInput);
  let best = { score: -1, answer: "Hmm... não tenho certeza sobre isso. Queres me ensinar?" };

  for (let item of knowledgeBase) {
    let vec = await getEmbedding(item.q);
    let sim = cosineSimilarity(userVec, vec);
    if (sim > best.score) {
      best = { score: sim, answer: pickRandom(item.a) };
    }
  }

  // Aprendizado: guardar histórico
  chatHistory.push({ pergunta: userInput, resposta: best.answer });
  localStorage.setItem("zeniaHistory", JSON.stringify(chatHistory));

  return best.answer;
}

// Mostrar mensagens na tela
function addMessage(text, sender) {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = sender === "user" ? "user-msg" : "bot-msg";
  div.innerText = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// Envio de mensagem
document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  addMessage(msg, "user");
  input.value = "";

  const reply = await zeniaReply(msg);
  setTimeout(() => addMessage(reply, "bot"), 500);
});
