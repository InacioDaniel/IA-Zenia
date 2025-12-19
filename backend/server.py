"""
server.py — FastAPI backend RAG skeleton
- Recebe /query POST { q, lang, top_k }
- Gera embedding (sentence-transformers),
- Busca top_k em Qdrant,
- Monta contexto e: 
    - se LLM_API_URL configurado -> envia prompt para esse LLM (sua instância) e retorna resposta
    - se não -> devolve concatenação/summary simples dos trechos (fallback)
"""
import os, json, requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "wikipedia_chunks_v2")
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
LLM_API_URL = os.getenv("LLM_API_URL", "")  # ex: http://127.0.0.1:8001/generate (sua instância local de geração)

app = FastAPI()
qclient = QdrantClient(url=QDRANT_URL)
embed_model = SentenceTransformer(EMBED_MODEL)

class QueryIn(BaseModel):
    q: str
    lang: str = "pt"
    top_k: int = 5

def build_prompt(query, docs, lang="pt"):
    # Simple prompt template. You can customize it to your LLM format.
    context = "\n\n---\n\n".join([f"[{i+1}] {d['payload'].get('title','')} ({d['payload'].get('url','')})\n{d['payload'].get('text','')}" for i,d in enumerate(docs)])
    system = f"Você é a Zenia, uma assistente útil. Use apenas o contexto abaixo para responder. Responda na língua solicitada ({lang}). Cite fontes por número."
    user = f"Contexto:\n{context}\n\nPergunta: {query}\n\nResposta (cite fontes):"
    return system, user

@app.post("/query")
async def query(body: QueryIn):
    if not body.q.strip():
        raise HTTPException(status_code=400, detail="Empty query")
    # embed
    emb = embed_model.encode([body.q])[0].tolist()
    # search
    hits = qclient.search(collection_name=COLLECTION_NAME, query_vector=emb, top=body.top_k)
    docs = []
    for h in hits:
        docs.append({"score": h.score, "payload": h.payload})
    # call LLM if configured
    system, user_prompt = build_prompt(body.q, docs, body.lang)
    llm_answer = None
    if LLM_API_URL:
        try:
            # Expect external LLM endpoint to accept JSON { "system": "...", "user": "..." } and return {"answer": "..."}
            r = requests.post(LLM_API_URL, json={"system": system, "user": user_prompt}, timeout=60)
            r.raise_for_status()
            llm_answer = r.json().get("answer")
        except Exception as e:
            llm_answer = f"[Erro no LLM externo: {e}]"
    else:
        # simple fallback: return concatenated snippets + short transform
        combined = "\n\n".join([d["payload"].get("text","") for d in docs])
        summary = combined[:2000] + ("..." if len(combined)>2000 else "")
        llm_answer = f"Trechos recuperados (sem LLM configurado). Use uma instância de LLM para respostas melhores.\n\n{summary}"
    sources = [{"title": d["payload"].get("title"), "url": d["payload"].get("url")} for d in docs]
    return {"answer": llm_answer, "sources": sources}