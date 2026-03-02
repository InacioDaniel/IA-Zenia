import os
import sys
import subprocess
import tempfile

# Tester-Code v5 - Ambiente Seguro de Validação
# Testa se o código Python gerado executa sem erros reais.

class ZeniaTester:
    def __init__(self):
        self.temp_dir = tempfile.gettempdir()

    def test_python_code(self, code):
        """Executa código Python num ambiente temporário e captura erros."""
        tmp_file = os.path.join(self.temp_dir, f"zenia_test_{os.getpid()}.py")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                f.write(code)
            
            # Executa e captura output/erro
            result = subprocess.run(
                [sys.executable, tmp_file],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                return {"status": "SUCESSO", "output": result.stdout}
            else:
                return {"status": "ERRO", "msg": result.stderr}
        except subprocess.TimeoutExpired:
            return {"status": "TIMEOUT", "msg": "O código demorou mais de 5s para executar."}
        except Exception as e:
            return {"status": "FALHA", "msg": str(e)}
        finally:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

    def validate_syntax(self, code):
        """Validação rápida de sintaxe sem executar."""
        try:
            compile(code, "<string>", "exec")
            return True
        except SyntaxError:
            return False

if __name__ == "__main__":
    tester = ZeniaTester()
    print("Tester-Code v5 Ativo.")
