FROM coffito/quadro-pessoal:organizacao-teste
USER root
RUN pip install pytest==8.3.5 httpx==0.28.1 sqlalchemy==2.0.43 psycopg2-binary==2.9.10 pydantic-settings==2.11.0 python-dateutil==2.9.0.post0 reportlab==4.4.5 'pwdlib[argon2]==0.2.1' email-validator==2.3.0 pypdf==6.1.1
ENV PYTHONDONTWRITEBYTECODE=1
USER quadro
