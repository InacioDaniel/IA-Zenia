// ========================
// Zenia AI by Inácio Daniel & Clério Cuita
// ========================

// Memória local
let memory = JSON.parse(localStorage.getItem("zeniaMemory")) || [];

// Chat display
const chat = document.getElementById("chat");
function addMessage(text, sender) {
  let div = document.createElement("div");
  div.className = `message ${sender}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// --------------------
// NLP e Raciocínio
// --------------------

// Embeddings locais simples
function textToVector(text) {
  text = text.toLowerCase().replace(/[^a-zá-úà-ùãõç\s]/gi, "");
  let vec = Array(26).fill(0);
  for (let char of text) {
    let code = char.charCodeAt(0) - 97;
    if (code >= 0 && code < 26) vec[code]++;
  }
  return tf.tensor(vec).div(tf.norm(vec));
}

// Similaridade semântica
function cosineSimilarity(vecA, vecB) {
  return vecA.dot(vecB).dataSync()[0];
}

// Geração de resposta
async function generateResponse(userText) {
  // Analisar texto com compromise (NLP básico)
  let doc = nlp(userText);
  let sentiment = doc.sentences().out("sentiment");

  // Embedding do input
  let inputVec = textToVector(userText);

  // Procurar melhor resposta na memória
  let bestMatch = null, bestScore = 0;
  for (let entry of memory) {
    let memVec = textToVector(entry.q);
    let score = cosineSimilarity(inputVec, memVec);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Se encontrou algo parecido, responde parecido
  if (bestScore > 0.6 && bestMatch) {
    return bestMatch.a;
  }

  // Caso contrário, resposta criativa simples
  let fallbackResponses = [
    "Conta-me mais sobre isso!",
    "Interessante, podes explicar melhor?",
    "Hmm, acho que percebi. E depois?",
    "Isso é profundo... o que achas sobre?"
  ];

  let reply = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

  // Aprender interação
  memory.push({ q: userText, a: reply });
  localStorage.setItem("zeniaMemory", JSON.stringify(memory));

  return reply;
}

// --------------------
// Funções principais
// --------------------
async function sendMessage() {
  const input = document.getElementById("userInput");
  const userText = input.value.trim();
  if (!userText) return;

  addMessage(userText, "user");
  input.value = "";

  const response = await generateResponse(userText);
  addMessage(response, "bot");

  speak(response);
}

// --------------------
// Voz e fala
// --------------------
function speak(text) {
  const synth = window.speechSynthesis;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "pt-PT";
  synth.speak(utter);
}

function startVoice() {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "pt-PT";
  recognition.start();

  recognition.onresult = async function(event) {
    let userText = event.results[0][0].transcript;
    addMessage(userText, "user");
    const response = await generateResponse(userText);
    addMessage(response, "bot");
    speak(response);
  };
}

// --------------------
// Dark mode
// --------------------
function toggleDarkMode() {
  if (document.body.style.getPropertyValue("--bg") === "#121212") {
    document.body.style.setProperty("--bg", "#fff");
    document.body.style.setProperty("--text", "#000");
    document.body.style.setProperty("--panel", "#eee");
  } else {
    document.body.style.setProperty("--bg", "#121212");
    document.body.style.setProperty("--text", "#fff");
    document.body.style.setProperty("--panel", "#1e1e1e");
  }
}
