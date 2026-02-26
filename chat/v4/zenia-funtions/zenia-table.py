# script que permit ao zénia criar tabelas bem vistosas bonitas ultra modernas super futuristas, tabelas a um novo nível como nunca antes vistas, um novo jeito de fazer tabelas

from PIL import Image, ImageDraw, ImageFont
import os

def create_futuristic_table(headers, rows, filename='tabela_futurista.png'):
    """
    Cria uma tabela com visual futurista (vidro, gradientes, brilho).
    """
    width, height = 1000, 600
    img = Image.new('RGB', (width, height), color='#0a0010') # Fundo Cyberpunk
    draw = ImageDraw.Draw(img)
    
    # Desenha efeito de brilho de fundo
    draw.ellipse([200, 100, 800, 500], fill='#1a003a')
    
    # Configurações da tabela
    start_x, start_y = 50, 100
    col_width = (width - 100) // len(headers)
    row_height = 50
    
    # Desenha Cabeçalho
    draw.rectangle([start_x, start_y, width - 50, start_y + row_height], 
                   fill='#bf00ff', outline='#00f5ff', width=2)
    
    for i, header in enumerate(headers):
        x = start_x + i * col_width
        draw.text((x + 10, start_y + 15), header.upper(), fill='white')
        
    # Desenha Linhas
    for r, row in enumerate(rows):
        y = start_y + row_height + (r * row_height)
        # Efeito de vidro alternado
        fill_color = '#110022' if r % 2 == 0 else '#1a003a'
        draw.rectangle([start_x, y, width - 50, y + row_height], 
                       fill=fill_color, outline='#2a0050', width=1)
        
        for i, cell in enumerate(row):
            x = start_x + i * col_width
            draw.text((x + 10, y + 15), str(cell), fill='#b892ff')
            
    img.save(filename)
    return filename

if __name__ == "__main__":
    # Teste
    headers = ["ID", "Produto", "Status", "Eficiência"]
    rows = [
        ["001", "Zenia Core", "Ativo", "99.9%"],
        ["002", "Neural Link", "Standby", "85.4%"],
        ["003", "Quantum Data", "Processando", "92.1%"]
    ]
    print("Gerando tabela futurista...")
    create_futuristic_table(headers, rows)
    print("Tabela gerada com sucesso.")
