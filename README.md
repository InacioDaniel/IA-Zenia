# 🧠 Zenia IA

![Zenia Banner](https://i.imgur.com/Fa1vO0r.png)  

**Zenia IA** é uma **assistente virtual inteligente e interativa**, criada para conversar, ensinar, analisar imagens, reconhecer emoções vocais e traduzir textos em tempo real. Desenvolvida por [@InacioDaniel](https://github.com/InacioDaniel), ideal para estudos, feiras de tecnologia ou uso pessoal.

---

## 🚀 Funcionalidades

| Módulo | Descrição | Status |
|--------|-----------|--------|
| 💬 Conversa Inteligente | Responde perguntas, reconhece contexto e aprende com interações | ✅ Ativo |
| 🌐 Wikipedia | Busca resumos e informações relevantes | ✅ Ativo |
| 🖼️ Imagem/Camera | Analisa objetos e imagens usando TensorFlow.js | ✅ Ativo |
| 🎤 Emoções Vocais | Detecta emoções pelo microfone | ✅ Em desenvolvimento |
| 🌍 Tradução | Traduz textos com comando `"traduza para [idioma]: texto"` | ✅ Ativo |
| 📄 Código/Arquivos | Aceita arquivos `.txt` e snippets de código | ✅ Ativo |

---

## 🎨 Interface Visual

![Interface Preview](https://i.imgur.com/3sWg6rP.png)  

- **Cabeçalho**: Botões de tema, exportação, microfone, câmera e anexos.  
- **Sidebar**: Estatísticas, módulos ativos e guia de uso rápido.  
- **Chat Principal**: Mensagens, vídeo e canvas de análise de imagens.  

---

## 🧩 Fluxograma da Lógica

```mermaid
flowchart TD
    A[Usuário envia mensagem] --> B{Saudação ou Despedida?}
    B -- Sim --> C[Resposta pronta]
    B -- Não --> D{Base Local de Conhecimento?}
    D -- Sim --> E[Responder com base na similaridade]
    D -- Não --> F{Wikipedia disponível?}
    F -- Sim --> G[Buscar resumo e responder]
    F -- Não --> H[Respostas padrão aleatórias]
    C & E & G & H --> I[Exibir mensagem no chat]
    I --> J[Atualizar estatísticas e contexto]
    J --> K[Falar a mensagem (TTS)]
