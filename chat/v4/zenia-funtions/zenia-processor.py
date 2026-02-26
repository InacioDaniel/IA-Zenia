# script para fazer com que o servidor use 80% do processador do servidor para trabalhos mais complexos e que exigem mais processamento como geração de video e use apenas 20% do proessador local

import psutil
import os
import time
import multiprocessing

def optimize_cpu_usage(task_complexity):
    """
    Simula a alocação de recursos baseada na complexidade da tarefa.
    Se a complexidade for alta, prioriza o uso de múltiplos cores do servidor.
    """
    cpu_count = multiprocessing.cpu_count()
    
    if task_complexity == 'high':
        # Simula alocação de 80% dos cores do servidor
        cores_to_use = max(1, int(cpu_count * 0.8))
        print(f"Tarefa Complexa: Alocando {cores_to_use}/{cpu_count} cores do servidor.")
        # No mundo real, aqui usaríamos pool de processos com limite
    else:
        # Tarefa simples, usa apenas 20% dos recursos locais
        cores_to_use = max(1, int(cpu_count * 0.2))
        print(f"Tarefa Simples: Usando apenas {cores_to_use} cores locais.")

def monitor_resources():
    """
    Monitora o uso atual de CPU e RAM.
    """
    cpu_usage = psutil.cpu_percent(interval=1)
    ram_usage = psutil.virtual_memory().percent
    print(f"Uso de CPU: {cpu_usage}% | Uso de RAM: {ram_usage}%")
    return cpu_usage, ram_usage

if __name__ == "__main__":
    # Teste de monitoramento
    print("Iniciando Monitor de Processamento Zénia...")
    monitor_resources()
    
    print("\nSimulando alocação para Geração de Vídeo (Complexidade Alta):")
    optimize_cpu_usage('high')
    
    print("\nSimulando alocação para Chat Simples (Complexidade Baixa):")
    optimize_cpu_usage('low')
