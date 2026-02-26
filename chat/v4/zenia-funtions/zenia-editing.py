# script py que retira impureza de fotos (denoising real) e edita imagens (ajustes reais)
# Este script NÃO gera imagens do zero, ele foca em processar e editar imagens existentes.

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import requests
from io import BytesIO
import os

def download_image(url_or_path):
    """
    Carrega uma imagem a partir de uma URL ou caminho local.
    """
    if url_or_path.startswith(('http://', 'https://')):
        try:
            response = requests.get(url_or_path)
            response.raise_for_status()
            return Image.open(BytesIO(response.content))
        except Exception as e:
            print(f"Erro ao baixar imagem: {e}")
            return None
    else:
        try:
            return Image.open(url_or_path)
        except Exception as e:
            print(f"Erro ao abrir arquivo local: {e}")
            return None

def remove_impurities(image_pil):
    """
    Remove impurezas e ruído de uma imagem usando OpenCV (Denoising Real).
    """
    # Converte PIL para OpenCV (numpy array)
    img_cv = cv2.cvtColor(np.array(image_pil), cv2.COLOR_RGB2BGR)
    
    # Aplica o filtro de remoção de ruído (Fast Non-Local Means Denoising)
    # h: força do filtro (maior = mais limpeza, mas perde detalhe)
    denoised = cv2.fastNlMeansDenoisingColored(img_cv, None, 10, 10, 7, 21)
    
    # Converte de volta para PIL
    return Image.fromarray(cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB))

def apply_real_edits(image_pil, brightness=1.0, contrast=1.0, sharpness=1.0, saturation=1.0):
    """
    Aplica edições reais de ajuste de imagem usando Pillow.
    """
    # Ajuste de Brilho
    enhancer = ImageEnhance.Brightness(image_pil)
    image_pil = enhancer.enhance(brightness)
    
    # Ajuste de Contraste
    enhancer = ImageEnhance.Contrast(image_pil)
    image_pil = enhancer.enhance(contrast)
    
    # Ajuste de Nitidez
    enhancer = ImageEnhance.Sharpness(image_pil)
    image_pil = enhancer.enhance(sharpness)
    
    # Ajuste de Saturação
    enhancer = ImageEnhance.Color(image_pil)
    image_pil = enhancer.enhance(saturation)
    
    return image_pil

def edit_image_advanced(image_pil, instruction):
    """
    Tenta interpretar instruções de edição "reais" baseadas em texto.
    (Simulação de mapeamento de instruções para filtros reais)
    """
    instruction = instruction.lower()
    img = image_pil
    
    if "brilhante" in instruction or "mais brilho" in instruction:
        img = apply_real_edits(img, brightness=1.3)
    if "contraste" in instruction:
        img = apply_real_edits(img, contrast=1.4)
    if "nítido" in instruction or "sharp" in instruction:
        img = apply_real_edits(img, sharpness=2.0)
    if "preto e branco" in instruction:
        img = img.convert('L')
    if "borrar" in instruction or "blur" in instruction:
        img = img.filter(ImageFilter.GaussianBlur(radius=2))
        
    return img

if __name__ == "__main__":
    # Exemplo de uso Real:
    # 1. Carregar imagem (Substitua pelo caminho real ou URL)
    test_img_path = "exemplo.jpg" # Pode ser URL
    
    # Simulação: Criar uma imagem de teste se não existir
    if not os.path.exists(test_img_path):
        print("Criando imagem de teste...")
        dummy = Image.new('RGB', (500, 500), color=(73, 109, 137))
        dummy.save(test_img_path)

    img = download_image(test_img_path)
    if img:
        print("Limpando impurezas (Denoising)...")
        clean_img = remove_impurities(img)
        clean_img.save("imagem_limpa.jpg")
        
        print("Aplicando edições reais (Aumento de contraste e nitidez)...")
        edited_img = apply_real_edits(clean_img, contrast=1.5, sharpness=2.0)
        edited_img.save("imagem_editada.jpg")
        
        print("Processamento concluído com sucesso!")
    else:
        print("Não foi possível carregar a imagem para processar.")

