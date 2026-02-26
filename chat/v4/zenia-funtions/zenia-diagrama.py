# script que permitirá ao zénia criar fluxogramas, diagramas super bonitos e modernos.

import graphviz
from PIL import Image, ImageDraw, ImageFont
import os

def create_modern_diagram(nodes, edges, filename='diagrama.png'):
    """
    Cria um diagrama moderno usando Graphviz com estilos personalizados.
    """
    dot = graphviz.Digraph(comment='IA-Zénia Modern Diagram')
    
    # Estilos Globais
    dot.attr('node', shape='rectangle', style='filled,rounded', 
             fillcolor='#1e3a5f', fontcolor='white', fontname='Arial',
             color='#3b5bdb', penwidth='2')
    dot.attr('edge', color='#9ca3af', penwidth='1.5', arrowhead='vee')
    dot.attr(bgcolor='transparent')

    # Adiciona Nodos
    for node in nodes:
        dot.node(node['id'], node['label'])

    # Adiciona Arestas
    for edge in edges:
        dot.edge(edge['from'], edge['to'], edge.get('label', ''))

    # Renderiza
    dot.format = 'png'
    dot.render(filename.replace('.png', ''), cleanup=True)
    return filename

def create_hand_drawn_diagram(title, steps, filename='hand_drawn.png'):
    """
    Simula um diagrama desenhado à mão ou infográfico simples usando PIL.
    """
    width, height = 800, 600
    img = Image.new('RGB', (width, height), color='#0b0d11')
    draw = ImageDraw.Draw(img)
    
    # Desenha título
    draw.text((width//2 - 50, 20), title, fill='#e5e7eb')
    
    # Desenha blocos
    y = 80
    for step in steps:
        # Caixa do bloco
        draw.rectangle([200, y, 600, y + 60], outline='#3b5bdb', width=3)
        draw.text((300, y + 20), step, fill='#text-primary')
        
        # Seta para o próximo
        if step != steps[-1]:
            draw.line([400, y + 60, 400, y + 100], fill='#9ca3af', width=2)
        y += 100
        
    img.save(filename)
    return filename

if __name__ == "__main__":
    # Exemplo de uso
    nodes = [
        {'id': 'A', 'label': 'Início'},
        {'id': 'B', 'label': 'Processamento'},
        {'id': 'C', 'label': 'Fim'}
    ]
    edges = [
        {'from': 'A', 'to': 'B', 'label': 'vai para'},
        {'from': 'B', 'to': 'C'}
    ]
    
    print("Gerando diagrama moderno...")
    # create_modern_diagram(nodes, edges) # Requer Graphviz instalado no sistema
    print("Gerando infográfico simples...")
    create_hand_drawn_diagram("Fluxo Zénia", ["Input", "Processamento", "Output"])
