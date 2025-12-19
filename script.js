// script.js

const { pipeline } = window.transformers;

let embedder = null;
let generator = null;
let modelsReady = false;

async function loadModels() {
  try {
    document.getElementById("status").textContent = "Carregando modelos...";

    // Carrega embeddings
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

    // Carrega modelo de geração
    generator = await pipeline("text-generation", "Xenova/distilgpt2"); 
    // use distilgpt2 primeiro para testar, é mais leve

    modelsReady = true;
    document.getElementById("status").textContent = "Modelos carregados!";
    document.getElementById("modelProgress").style.width = "100%";
  } catch (err) {
    console.error("Erro ao carregar modelos", err);
    document.getElementById("status").textContent = "Erro ao carregar modelos.";
  }
}

async function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  if (!modelsReady) {
    addMessage("Modelos ainda não estão prontos.", "zenia");
    return;
  }

  try {
    document.getElementById("status").textContent = "Gerando resposta...";
    const output = await generator(text, { max_new_tokens: 50 });
    addMessage(output[0].generated_text, "zenia");
    document.getElementById("status").textContent = "Pronto!";
  } catch (err) {
    console.error(err);
    addMessage("Erro ao gerar resposta.", "zenia");
    document.getElementById("status").textContent = "Erro.";
  }
}

function addMessage(text, who) {
  const chat = document.getElementById("chatArea");
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

document.getElementById("sendBtn").addEventListener("click", handleUserInput);
document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("chatArea").innerHTML = "";
});

// Inicializa
loadModels();
