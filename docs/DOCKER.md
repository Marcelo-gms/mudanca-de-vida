# Subindo o projeto com Docker Compose

## Comandos

```bash
docker compose up -d --build   # build + sobe em segundo plano
docker compose logs -f         # acompanha os logs
docker compose down            # para (o banco continua no volume)
docker compose down -v         # para e APAGA o banco (volume tigrinho-data)
```

App em `http://localhost:3000`. Em desenvolvimento, contas demo criadas automaticamente:

| Conta | Senha |
| :--- | :--- |
| `demo@tigrinho.com` (admin, R$ 100,00) | `demo1234` |
| `admin@tigrinho.com` | `admin1234` |

## Deploy em produção: conta de administrador

Com `NODE_ENV=production` as contas demo **não** são criadas (e, se existirem num banco vindo de dev, são rebaixadas, bloqueadas e têm a senha trocada por uma aleatória). O admin vem do `.env`:

```env
NODE_ENV=production
ADMIN_EMAIL=voce@seudominio.com
ADMIN_PASSWORD=uma-senha-longa-de-12+-caracteres   # ex: openssl rand -base64 24
ADMIN_NAME=Seu Nome
ADMIN_DOCUMENT=                                     # CPF, opcional (só p/ sacar)
```

1. Preencha o `.env` e rode `docker compose up -d --build`.
2. Confira em `docker compose logs` a linha `Created admin from env: ...`. Se aparecer `[ADMIN] ... skipped`, a mensagem diz o motivo (senha fraca, variável faltando, CPF já usado).
3. Entre em `/admin` com esse e-mail e senha (precisa de HTTPS, ver `NODE_ENV` abaixo).
4. Depois do primeiro boot, você pode apagar `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env` (os dois juntos): a conta já existe no banco e o seed não mexe na senha dela.

- **Trocar/recuperar a senha:** coloque a nova em `ADMIN_PASSWORD`, `ADMIN_RESET_PASSWORD=true`, reinicie (`docker compose up -d`) e depois remova a flag.
- **Promover uma conta já cadastrada em `/register`:** use o e-mail dela em `ADMIN_EMAIL` (com qualquer `ADMIN_PASSWORD` válida) e reinicie. A senha atual dela é mantida.

## Como funciona

- **Imagem:** `node:22-bookworm-slim` (mesma versão do `.nvmrc`). O `better-sqlite3` usa binário pré-compilado; se o download falhar, o Dockerfile instala `python3/make/g++` só para compilar e remove depois.
- **Inicialização:** o container roda `scripts/initDb.js` e depois `src/server.js`. O `initDb` é idempotente (cria schema, contas demo fora de produção e o admin de `ADMIN_*`).
- **Banco:** SQLite em `/app/data`, persistido no volume nomeado `tigrinho-data`.
- **Variáveis:** lidas do `.env` se ele existir (opcional). `PORT` interno é sempre 3000; a porta do host segue `${PORT:-3000}`.
- **`NODE_ENV`:** padrão `development`. Em `production` o cookie de sessão vira `secure` e o login **não funciona via http://localhost**; só use `production` atrás de HTTPS.

## Decisões

- Pedido do usuário (2026-11-05): criar Docker Compose para facilitar subir o projeto.
- Motivo técnico extra: o `better-sqlite3@11` não compila no Node 26 da máquina local; o container fixa Node 22 e elimina esse problema.
- `docs/` e `tests/` ficam fora da imagem (`.dockerignore`) para mantê-la enxuta.
