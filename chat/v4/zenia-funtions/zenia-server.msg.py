# script que permitirá as mensagens entre zénia e usuario serem vistas na console do servidor render.com onde o zénia está hospedado

import sys
import datetime
import json

def log_to_server_console(role, message):
    """
    Formata e imprime mensagens para o console do servidor (Render.com).
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Formatação com cores (códigos ANSI para console Linux/Render)
    color_role = "\033[94m" if role == 'user' else "\033[92m" # Azul para user, Verde para IA
    reset_color = "\033[0m"
    
    log_entry = {
        "timestamp": timestamp,
        "role": role,
        "message": message[:200] + "..." if len(message) > 200 else message # Limita logs longos
    }
    
    # Imprime como JSON para fácil leitura estruturada em logs
    print(f"{color_role}[{role.upper()}] {timestamp}:{reset_color} {json.dumps(log_entry, ensure_ascii=False)}")
    sys.stdout.flush() # Garante que a mensagem apareça imediatamente

if __name__ == "__main__":
    # Teste de log
    print("Iniciando logs de console IA-Zénia...")
    log_to_server_console("user", "Olá Zénia, como estás?")
    log_to_server_console("ai", "Olá! Estou pronta para te ajudar com engenharia e tecnologia em Angola.")
