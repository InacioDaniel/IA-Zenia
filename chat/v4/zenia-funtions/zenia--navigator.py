# este script permitirá ao zénia navegar na internet navegar entre paginas entrar em site e mandará as informações para a zénia. quando o modo web estiver ativo o zénia terá de buscar informações online ou até mesmo navegar em paginas para encontrar as informações necessárias

import requests
from bs4 import BeautifulSoup
import json
import urllib.parse
import re

def navigate_and_analyze(url):
    """
    Navega para uma URL real, captura o HTML, analisa o design (estrutura) e extrai o texto essencial.
    """
    print(f"Navegando e analisando: {url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        html_content = response.text
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # --- ANÁLISE DE DESIGN/ESTRUTURA ---
        design_info = {
            "has_sidebar": bool(soup.find(['aside', 'nav', 'div'], class_=re.compile(r'sidebar|menu|nav', re.I))),
            "has_header": bool(soup.find(['header', 'div'], class_=re.compile(r'header|top', re.I))),
            "has_footer": bool(soup.find(['footer', 'div'], class_=re.compile(r'footer|bottom', re.I))),
            "main_color": "Não detectada (requer análise de CSS)",
            "layout_type": "Complexo" if len(soup.find_all(['div', 'section'])) > 50 else "Simples"
        }
        
        # --- EXTRAÇÃO DE TEXTO ESSENCIAL ---
        # Remove elementos irrelevantes para a compreensão do conteúdo
        for element in soup(["script", "style", "header", "footer", "nav", "aside", "iframe", "noscript"]):
            element.extract()
            
        # Prioriza o conteúdo principal se detectado
        main_content = soup.find(['main', 'article', 'div'], class_=re.compile(r'content|main|article|post', re.I))
        if main_content:
            text = main_content.get_text(separator=' ')
        else:
            text = soup.get_text(separator=' ')
            
        # Limpeza profunda do texto
        text = re.sub(r'\s+', ' ', text).strip()
        
        return {
            "status": "success",
            "url": url,
            "title": soup.title.string.strip() if soup.title else "Sem título",
            "design": design_info,
            "essential_text": text[:8000], # Retorna até 8000 caracteres para a IA
            "links_internos": [urllib.parse.urljoin(url, a['href']) for a in soup.find_all('a', href=True) if not a['href'].startswith(('http', 'mailto', 'tel'))][:10]
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

def deep_web_search(query):
    """
    Busca real na web usando DuckDuckGo (versão sem JS para maior velocidade).
    """
    search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        response = requests.get(search_url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        for result in soup.find_all('div', class_='result'):
            title_tag = result.find('a', class_='result__a')
            snippet_tag = result.find('a', class_='result__snippet')
            if title_tag:
                results.append({
                    "title": title_tag.get_text(),
                    "url": title_tag['href'],
                    "snippet": snippet_tag.get_text() if snippet_tag else ""
                })
        
        return results[:5] # Top 5 resultados
    except Exception as e:
        return [{"error": f"Erro na busca: {str(e)}"}]

if __name__ == "__main__":
    # Teste de busca e navegação real
    query = "Notícias de tecnologia em Angola"
    print(f"--- TESTANDO BUSCA REAL: {query} ---")
    search_results = deep_web_search(query)
    
    if search_results and "url" in search_results[0]:
        first_url = search_results[0]['url']
        print(f"\n--- ANALISANDO O PRIMEIRO RESULTADO: {first_url} ---")
        analysis = navigate_and_analyze(first_url)
        print(json.dumps(analysis, indent=2, ensure_ascii=False))

