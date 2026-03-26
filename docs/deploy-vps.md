# Deploy VPS – NEWLAW (API)

## Pré-requisitos
- DNS do subdomínio `api.newlaw.app.br` apontando para `76.13.165.119`.
- Acesso SSH root ou sudo ao VPS.

## 1) Atualizar o sistema e instalar dependências
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip nginx postgresql postgresql-contrib git
```

## 2) Criar banco e usuário PostgreSQL
```bash
sudo -u postgres psql <<'SQL'
CREATE USER newlaw WITH PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE newlaw OWNER newlaw;
\q
SQL
```

## 3) Clonar o projeto
```bash
sudo mkdir -p /opt/newlaw
sudo chown $USER:$USER /opt/newlaw
cd /opt/newlaw
# Substitua pelo seu repositório
# git clone git@github.com:SEU_USUARIO/NEWLAW.git .
```

## 4) Preparar venv e dependências
```bash
cd /opt/newlaw
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

## 5) Criar arquivo de ambiente
Crie `/etc/newlaw.env` com os valores (exemplo):
```bash
sudo tee /etc/newlaw.env >/dev/null <<'ENV'
NEWLAW_ENV=production
NEWLAW_DB=postgresql+psycopg://newlaw:SENHA_FORTE_AQUI@127.0.0.1:5432/newlaw
NEWLAW_STORAGE=/opt/newlaw/storage
NEWLAW_JWT_SECRET=troque_por_um_segredo_forte
NEWLAW_TOKEN_PEPPER=opcional_outro_segredo
NEWLAW_ADMIN_SECRET=troque_por_um_segredo_forte
NEWLAW_MASTER_EMAIL=master@newlaw.app.br
NEWLAW_MASTER_PASSWORD=Newlaw#2026!Master
NEWLAW_MASTER_NAME=Administrador
ENV
```

## 6) Systemd service
Crie `/etc/systemd/system/newlaw-api.service`:
```ini
[Unit]
Description=NEWLAW API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/newlaw
EnvironmentFile=/etc/newlaw.env
ExecStart=/opt/newlaw/backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Ative o serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now newlaw-api
sudo systemctl status newlaw-api --no-pager
```

## 7) Nginx (reverse proxy)
Crie `/etc/nginx/sites-available/newlaw-api`:
```nginx
server {
    listen 80;
    server_name api.newlaw.app.br;
    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative e recarregue:
```bash
sudo ln -s /etc/nginx/sites-available/newlaw-api /etc/nginx/sites-enabled/newlaw-api
sudo nginx -t
sudo systemctl reload nginx
```

## 8) SSL com Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.newlaw.app.br
```

## 9) Verificações
- Healthcheck: `https://api.newlaw.app.br/health`
- Login: `POST https://api.newlaw.app.br/auth/login`

## Observações
- Em produção, troque a senha master e os segredos.
- Se preferir outro usuário systemd, ajuste `User=` no service.
- Se já existia um banco anterior, será necessário migrar o schema (adicionados `locked_until` e tabela `RefreshToken`).
