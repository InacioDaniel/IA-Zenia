Backend README — passos rápidos

Pré-requisitos:
- Docker & Docker Compose (para Qdrant)
- Python 3.10+ (para executar ingest.py e server.py)
- (Opcional) instância LLM local (text-generation-inference / text-generation-webui / Ollama / llama.cpp server)

1) Subir Qdrant (docker compose)
   cd backend
   docker-compose up -d

2) Criar virtualenv e instalar dependências
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

3) Ingestão inicial (indexar Wikipédia)
   # editar ingest.py se quiser outros termos/idiomas
   python ingest.py
   Isso criará/atualizará a collection em Qdrant.

4) Rodar o servidor FastAPI
   export QDRANT_URL=http://localhost:6333
   export COLLECTION_NAME=wikipedia_chunks_v2
   # Opcional: export LLM_API_URL=http://localhost:8080/generate  (se você tiver um LLM REST)
   uvicorn server:app --host 0.0.0.0 --port 8000

5) Frontend (Netlify)
   - Edite index.html (ou via Netlify) e defina window.BACKEND_URL para apontar para seu servidor (ex: https://minha-maquina.example.com:8000)
   - Faça deploy do site estático no Netlify.

Observações:
- Se você quiser que o backend gere respostas melhores sem depender de serviços externos, rode sua própria instância de LLM (text-generation-inference ou text-generation-webui) numa máquina com GPU. Defina LLM_API_URL para apontar para o endpoint de geração (veja docs do TGI / text-generation-webui).
- Para produção, proteja o backend com autenticação e CORS restrito.