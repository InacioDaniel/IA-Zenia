# script que permitirá ao zénia enviar ao meu e-mail danielinacio475@gmail.com os fadbacks dos usuarios zénia permitir saber se eles gostaram ou não do produto, se clicarem no  botão like no meu e-mail o zénia com nome IA-Zénia Alert dirá "O cliente gostou da resposta" se ele clicar no botão deslike a mensagem será "O cliente ficou irritado ou triste com a resposta" e em seguida irá me enviar a pergunta do usuario e a resposta que ele não gostou.

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

def send_feedback_email(user_question, ai_response, feedback_type):
    """
    Envia feedback para o e-mail do criador.
    """
    creator_email = "danielinacio475@gmail.com"
    sender_email = os.getenv("ZENIA_EMAIL_USER", "ia.zenia.alerts@gmail.com")
    sender_password = os.getenv("ZENIA_EMAIL_PASS", "1234") # Requer senha de app
    
    subject = "IA-Zénia Alert: Novo Feedback do Cliente"
    
    if feedback_type == 'like':
        status_msg = "O cliente gostou da resposta"
    else:
        status_msg = "O cliente ficou irritado ou triste com a resposta"
        
    body = f"""
    Status: {status_msg}
    
    --- DETALHES DO FEEDBACK ---
    Pergunta do Usuário:
    {user_question}
    
    Resposta da Zénia:
    {ai_response}
    ---------------------------
    """
    
    msg = MIMEMultipart()
    msg['From'] = f"IA-Zénia Alert <{sender_email}>"
    msg['To'] = creator_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))
    
    try:
        # Se as credenciais não existirem, apenas simula o envio no log
        if not sender_password:
            print(f"Simulação de E-mail para {creator_email}:")
            print(body)
            return True
            
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Erro ao enviar e-mail: {e}")
        return False

if __name__ == "__main__":
    # Exemplo de teste
    q = "Como criar um foguete em Angola?"
    a = "Para criar um foguete em Angola, precisas de engenheiros da UAN..."
    print("Testando envio de feedback (Like)...")
    send_feedback_email(q, a, 'like')
