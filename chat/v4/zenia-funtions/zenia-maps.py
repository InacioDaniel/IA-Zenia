# script para conceder a zénia acesso ao mpa google 3D e a todas localizações possiveis do mundo e permitir ao usuário aceder a localizações em tempo real, pegar imagens de terrenos territórios e gerar plantas 2D proficionais tecnicas e plantas 3D com todos views perspectivas 3D.

import requests
from PIL import Image, ImageDraw
import os

def get_static_map(lat, lon, zoom=15, size="600x400"):
    """
    Obtém uma imagem de mapa estático (Exemplo usando OpenStreetMap/StaticMap)
    """
    # Exemplo de URL de um serviço de mapas estáticos gratuito (como o do Mapbox ou similar se tiver chave)
    # Por agora, simulamos a obtenção de um link ou usamos um serviço público
    url = f"https://static-maps.yandex.ru/1.x/?ll={lon},{lat}&z={zoom}&l=map&size={size.replace('x',',')}"
    return url

def generate_2d_floor_plan(rooms, filename='planta_2d.png'):
    """
    Gera uma planta 2D técnica simplificada.
    'rooms' é uma lista de dicts: [{'name': 'Sala', 'x': 0, 'y': 0, 'w': 200, 'h': 150}, ...]
    """
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    offset_x, offset_y = 100, 100
    
    for room in rooms:
        x, y = room['x'] + offset_x, room['y'] + offset_y
        w, h = room['w'], room['h']
        
        # Desenha paredes
        draw.rectangle([x, y, x + w, y + h], outline='black', width=3)
        # Nome da divisão
        draw.text((x + 10, y + 10), room['name'], fill='black')
        
    img.save(filename)
    return filename

def generate_3d_view_simulation(prompt, filename='view_3d.png'):
    """
    Simula uma perspectiva 3D (Zénia usará isto para descrever como gerar o Three.js no frontend)
    """
    # No backend Python, poderíamos usar bibliotecas de renderização 3D, 
    # mas para a IA-Zénia, o processamento 3D real acontece no Three.js do index.html.
    # Este script serve como o "gerenciador" de dados para essa renderização.
    print(f"Preparando dados 3D para: {prompt}")
    return "Dados 3D preparados."

if __name__ == "__main__":
    # Teste
    print("Mapa Estático:", get_static_map(-8.8383, 13.2344)) # Coordenadas de Luanda
    rooms = [
        {'name': 'Sala de Estar', 'x': 0, 'y': 0, 'w': 300, 'h': 200},
        {'name': 'Cozinha', 'x': 300, 'y': 0, 'w': 150, 'h': 200},
        {'name': 'Quarto', 'x': 0, 'y': 200, 'w': 200, 'h': 200}
    ]
    generate_2d_floor_plan(rooms)
    print("Planta 2D gerada.")
