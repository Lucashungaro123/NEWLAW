# Manual de Desenvolvimento – NEWLAW

## Visão geral
- App desktop construído com Tauri (janela nativa) + frontend React/Vite + backend FastAPI (Python).
- Tudo roda localmente: o backend expõe HTTP em `http://127.0.0.1:8000` e o frontend consome em `http://127.0.0.1:5173` durante o desenvolvimento.
- O Tauri sobe o frontend dentro de uma janela e pode iniciar/parar o backend.
- Fluxo oficial de entrega e validação no VPS: `docs/local-vps-workflow.md`.

## Disclaimer de execução e renderização
- A interface do app é "renderizada" por um WebView nativo do sistema via Tauri (WebKit no macOS, WebView2 no Windows, WebKitGTK no Linux).
- Não usamos PySide6/Qt para UI; o Python fica restrito ao backend FastAPI.
- Em desenvolvimento, o Tauri abre a janela apontando para o Vite; em build, aponta para os assets estáticos do frontend.

## Componentes
- Backend: `backend/` — FastAPI + SQLModel, banco SQLite local (`data.db` por padrão).
- Frontend: `app/` — React + TypeScript com Vite.
- Shell desktop: `src-tauri/` — Rust/Tauri (gera janela e instalador).
- Scripts: `scripts/` — helpers (ex.: `dev.sh` para backend+Vite).

## Pré-requisitos
- Python 3.12+ instalado. Venv em `backend/.venv`.
- Node (npm) instalado via Homebrew.
- Rust/cargo instalado via `rustup`.

## Como rodar em desenvolvimento
Use dois terminais:
1) Backend:
   ```
   cd ~/Documents/NEWLAW
   source backend/.venv/bin/activate
   uvicorn backend.main:app --reload --port 8000
   ```
2) App desktop (Tauri + Vite):
   ```
   cd ~/Documents/NEWLAW
   VITE_API_URL=https://api.newlaw.app.br cargo tauri dev
   ```
   - Se a porta 5173 estiver ocupada: `pkill -f "vite --host --port 5173"` e rode de novo.
   - Para usar a API local em vez da remota: `VITE_API_URL=http://127.0.0.1:8000 cargo tauri dev`
   - Se precisar definir o Python manualmente, use a variável `NEWLAW_PYTHON` apontando para a venv 3.12 do projeto.

Opcional: subir o frontend no navegador diretamente
```
cd ~/Documents/NEWLAW/app
npm run dev -- --host --port 5173
```
Abra `http://127.0.0.1:5173`.

## Estrutura de pastas
- `backend/main.py`: app FastAPI, rotas de auth demo, licença mock, CRUD básico (clientes, casos, faturas, templates).
- `backend/models.py`: User, Client, Case, Invoice, Template.
- `backend/requirements.txt`: dependências Python.
- `app/src/App.tsx`: navegação e telas mockadas (Dashboard, Clientes, Processos, Financeiro, Modelos, Agenda).
- `app/src/index.css`: tema e layout.
- `src-tauri/tauri.conf.json`: config do Tauri (devUrl, build).
- `src-tauri/src/main.rs`: inicializa comandos (start/stop backend) e a janela.
- `scripts/dev.sh`: sobe backend + Vite (sem Tauri).
- `run-dev.command`: atalho para iniciar backend + Tauri em dev com dois cliques.

## Fluxo de dados
- Frontend chama o backend via HTTP (axios). Ex.: `GET /clients`, `POST /clients`.
- Backend persiste no SQLite (arquivo `data.db` na raiz por padrão; configurável com `NEWLAW_DB`).
- Login master: definido por `NEWLAW_MASTER_EMAIL` e `NEWLAW_MASTER_PASSWORD` (ver `docs/dev-auth.md`).
- Storage local de arquivos: pasta `./storage` (ou definida por `NEWLAW_STORAGE`). Metadados de arquivos podem ir para o banco; arquivos ficam no disco local do usuário.

## Erros comuns e correções
- Porta 5173 ocupada: `pkill -f "vite --host --port 5173"` e rode `cargo tauri dev`.
- `python` não encontrado no Tauri: aponte para a venv em `main.rs`.
- Ícone ausente: arquivo em `src-tauri/icons/icon.png` precisa existir (já criado).

## Próximos passos sugeridos
- Conectar telas ao backend real: substituir dados mock em `App.tsx` por chamadas axios (`/clients`, `/cases`, etc.).
- Ajustar autenticação conforme ambiente de produção (segredos, expirações, envio de e-mail).
- Empacotar Python na build do Tauri (definir caminho fixo do Python/venv no `main.rs` ou embutir runtime).
- Migrar mock de licença para lógica real; adicionar migrações de banco se crescer (Alembic).

## Como gerar versão instalável (quando estiver pronto)
- Backend/Frontend já compilados:
  ```
  cd ~/Documents/NEWLAW
  npm --prefix app run build
  cargo tauri build
  ```
- O instalador/artefato sai em `src-tauri/target/release/bundle/`.
