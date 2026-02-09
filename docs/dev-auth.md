# Guia de Autenticação (Dev) – NEWLAW

## Credenciais master (dev)
- Email: master@newlaw.app.br
- Senha: Newlaw#2026!Master
- Nome: Administrador

## Onde essas credenciais são usadas
- Seed automático do usuário master no startup do backend.
- Pode ser sobrescrito por variáveis de ambiente.

## Variáveis de ambiente essenciais
- NEWLAW_ENV=production (no VPS)
- NEWLAW_DB=postgresql+psycopg://newlaw:SENHA@127.0.0.1:5432/newlaw
- NEWLAW_JWT_SECRET=defina_um_segredo_forte
- NEWLAW_TOKEN_PEPPER=opcional_usar_outro_segredo
- NEWLAW_ADMIN_SECRET=defina_um_segredo_forte
- NEWLAW_MASTER_EMAIL=master@newlaw.app.br
- NEWLAW_MASTER_PASSWORD=Newlaw#2026!Master
- NEWLAW_MASTER_NAME=Administrador
- NEWLAW_DEV_RETURN_RESET_TOKEN=0

## Autenticação implementada
- Hash de senha com bcrypt.
- JWT de acesso (expira em 15 minutos).
- Refresh token (expira em 30 dias) com rotação e hash no banco.
- Bloqueio temporário após 5 tentativas inválidas (15 minutos).
- Política de senha mínima: 8 caracteres, letras e números.
- Reset de senha com token de 1 hora.

## Endpoints de autenticação
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me
- POST /auth/password/request-reset
- POST /auth/password/confirm-reset
- POST /auth/password/change

## Notas importantes
- Para obter o token de reset em desenvolvimento, use NEWLAW_DEV_RETURN_RESET_TOKEN=1.
- Em produção, troque os segredos e a senha master antes de abrir acesso externo.
- Foram adicionados os campos `locked_until` em `User` e a tabela `RefreshToken` no banco.
