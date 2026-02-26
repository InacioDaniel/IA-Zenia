# script que permitirá ao zénia testar codigos python ou outros possiveis antes de mandar para o usuario, ele testa se detectar erros no pensamento diz "cometí alguns erros deixe-me corrijir" ela corrije e depois testa novamente e se não ouver problemas envia ao usuario e dá explicações sore o que precisará fazer caso use bibliotecas que ele precisa instalar ou ou frameworks.
import subprocess
import sys
import tempfile
import os

def test_python_code(code):
    """
    Cria um arquivo temporário com o código Python e o executa.
    """
    with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as temp_file:
        temp_file.write(code.encode('utf-8'))
        temp_path = temp_file.name

    try:
        # Executa o código e captura a saída/erros
        result = subprocess.run([sys.executable, temp_path], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            return {
                "success": True,
                "output": result.stdout,
                "error": None
            }
        else:
            return {
                "success": False,
                "output": result.stdout,
                "error": result.stderr
            }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "output": "",
            "error": "Timeout: O código demorou mais de 10 segundos para executar."
        }
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": str(e)
        }
    finally:
        # Remove o arquivo temporário
        if os.path.exists(temp_path):
            os.remove(temp_path)

def analyze_and_fix(code, error):
    """
    Simulação de correção automática (No mundo real, Zenia chamaria o LLM aqui).
    """
    print(f"Erro detectado: {error}")
    print("Cometí alguns erros, deixe-me corrigir...")
    
    # Exemplo simples de correção: Se for um erro de sintaxe comum (ex: falta de :)
    # Aqui a IA deveria repensar o código. Para fins de script, apenas notificamos.
    return code  # Retorna o código original para que a IA (Zenia) tente novamente após repensar

if __name__ == "__main__":
    # Exemplo de uso:
    code_to_test = """
def saudacao(nome):
    print("Olá, " + nome)

saudacao("Zenia")
"""
    print("Testando código...")
    res = test_python_code(code_to_test)
    
    if res["success"]:
        print("Código testado com sucesso!")
        print("Saída:", res["output"])
    else:
        print("Falha no teste!")
        fixed_code = analyze_and_fix(code_to_test, res["error"])
        # No fluxo real, isso seria uma recursão onde a Zenia tenta corrigir o código.
