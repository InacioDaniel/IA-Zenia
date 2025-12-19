"""
ingest.py
- Busca artigos da Wikipédia (via API),
- Chunka o texto,
- Calcula embeddings (sentence-transformers multilingual),
- Envia para Qdrant.
Configure QDRANT_URL e COLLECTION_NAME via ambiente ou edite aqui.
"""
import os, time, requests
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from tqdm import tqdm

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "wikipedia_chunks_v2")
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

client = QdrantClient(url=QDRANT_URL)
model = SentenceTransformer(EMBED_MODEL)

def ensure_collection():
    colls = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in colls:
        client.recreate_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=model.get_sentence_embedding_dimension(), distance=Distance.COSINE)
        )

def fetch_wiki_search(term="inteligência artificial", lang="pt", limit=20):
    api = f"https://{lang}.wikipedia.org/w/api.php"
    params = {"action":"query","list":"search","srsearch":term,"srlimit":limit,"format":"json","origin":"*"}
    r = requests.get(api, params=params).json()
    return [s["title"] for s in r["query"]["search"]]

def fetch_page_extract(title, lang="pt"):
    api = f"https://{lang}.wikipedia.org/w/api.php"
    params = {"action":"query","titles":title,"prop":"extracts","explaintext":"1","format":"json","origin":"*"}
    r = requests.get(api, params=params).json()
    pages = r["query"]["pages"]
    page = next(iter(pages.values()))
    text = page.get("extract","")
    url = f"https://{lang}.wikipedia.org/wiki/{title.replace(' ','_')}"
    return text, url

def chunk_text(text, chunk_size=800, overlap=200):
    if not text:
        return []
    chunks=[]
    start=0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        chunks.append(chunk)
        start = max(0, end - overlap)
        if end >= len(text): break
    return chunks

def ingest_titles(titles, lang="pt"):
    for title in tqdm(titles):
        text, url = fetch_page_extract(title, lang=lang)
        if not text: continue
        chunks = chunk_text(text)
        embeddings = model.encode(chunks, show_progress_bar=False)
        points = []
        for i,(chunk,emb) in enumerate(zip(chunks, embeddings)):
            payload = {"title": title, "url": url, "lang": lang, "chunk_index": i, "text": chunk}
            points.append({"id": None, "vector": emb.tolist(), "payload": payload})
        # upsert
        client.upsert(collection_name=COLLECTION_NAME, points=points)
        time.sleep(0.1)

if __name__ == "__main__":
    ensure_collection()
    # Exemplo: buscar tópicos e indexar
    terms = ["inteligência artificial", "aprendizado de máquina", "processamento de linguagem natural"]
    titles = []
    for t in terms:
        titles += fetch_wiki_search(term=t, lang="pt", limit=15)
    ingest_titles(list(dict.fromkeys(titles)), lang="pt")
    print("Ingest complete.")