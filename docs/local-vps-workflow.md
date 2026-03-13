# Fluxo Oficial: Local -> VPS -> Build

Este e o fluxo padrao do projeto NEWLAW:

1. **Desenvolver localmente** (sua maquina e a fonte principal)
2. **Sincronizar e validar no VPS** (backend real para teste)
3. **Buildar nova versao** apenas quando juntar mudancas suficientes

## 1) Configuracao unica (so uma vez)

```bash
cd ~/Documents/NEWLAW
cp scripts/vps.env.example scripts/vps.env
chmod +x scripts/vps-sync.sh scripts/vps-deploy.sh
```

## 2) Ciclo do dia a dia

### A. Fazer mudancas locais
- Edita codigo no seu projeto local.
- Testa local (`cargo tauri dev`, chamadas de API, etc.).

### B. Enviar para VPS e validar backend
```bash
cd ~/Documents/NEWLAW
./scripts/vps-deploy.sh
```

Esse comando faz:
- `rsync` do projeto local para `/opt/newlaw` no VPS
- restart do servico `newlaw-api`
- validacao automatica de endpoints (`/health`, `/invite`, `/team-members/capacity`)

### C. Se quiser so sincronizar arquivos (sem restart)
```bash
./scripts/vps-deploy.sh --sync-only
```

### D. Se quiser so reiniciar e validar
```bash
./scripts/vps-deploy.sh --restart-only
```

## 3) Commit e push (o que significa)

Quando voce roda:
```bash
git add .
git commit -m "mensagem"
git push origin main
```

- `git add`: prepara as mudancas que vao entrar no commit.
- `git commit`: cria um "ponto salvo" com historico do que mudou.
- `git push`: envia esse historico para o GitHub.

## 4) Build de nova versao

Quando ja validou mudancas suficientes no VPS:

1. faz commit/push
2. roda pipeline no GitHub Actions
3. gera nova release (EXE/MSI)
4. app instalado detecta atualizacao e baixa pela Central de Atualizacoes

## 5) Opcional: backend de desenvolvimento no VPS

Se quiser separar DEV e PROD no futuro, este fluxo ja suporta:
- `VPS_PATH=/opt/newlaw-dev`
- `VPS_SERVICE=newlaw-api-dev`
- `API_BASE_URL=https://api-dev.seudominio.com`

Basta ajustar no `scripts/vps.env`.
