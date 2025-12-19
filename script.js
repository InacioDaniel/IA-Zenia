// script.js

let engine = null;
let modelsReady = false;

async function loadModels() {
  try {
    document.getElementById("status").textContent = "Carregando modelo WebLLM...";

    // Inicializa engine com modelo leve (vicuna 7B quantizado)
    engine = await webllm.CreateEngine("vicuna-v1.5-7b-q4f32_0");

    modelsReady = true;
    document.getElementById("status").textContent = "Modelo carregado!";
  } catch (err) {
    console.error("Erro ao carregar modelo", err);
    document.getElementById("status").textContent = "Erro ao carregar modelo.";
  }
}

async function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  if (!modelsReady) {
    addMessage("Modelo ainda não está pronto.", "zenia");
    return;
  }

  try {
    document.getElementById("status").textContent = "Gerando resposta...";
    const reply = await engine.chat.completion([
      { role: "user", content: text }
    ]);
    addMessage(reply.message.content, "zenia");
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
