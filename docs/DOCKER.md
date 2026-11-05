# Subindo o projeto com Docker Compose

## Comandos

```bash
docker compose up -d --build   # build + sobe em segundo plano
docker compose logs -f         # acompanha os logs
docker compose down            # para (o banco continua no volume)
docker compose down -v         # para e APAGA o banco (volume tigrinho-data)
```

App em `http://localhost:3000`. Contas demo criadas automaticamente:

| Conta | Senha |
| :--- | :--- |
| `demo@tigrinho.com` (admin, R$ 100,00) | `demo1234` |
| `admin@tigrinho.com` | `admin1234` |

## Como funciona

- **Imagem:** `node:22-bookworm-slim` (mesma versão do `.nvmrc`). O `better-sqlite3` usa binário pré-compilado; se o download falhar, o Dockerfile instala `python3/make/g++` só para compilar e remove depois.
- **Inicialização:** o container roda `scripts/initDb.js` e depois `src/server.js`. O `initDb` é idempotente (cria schema e contas demo só se não existirem).
- **Banco:** SQLite em `/app/data`, persistido no volume nomeado `tigrinho-data`.
- **Variáveis:** lidas do `.env` se ele existir (opcional). `PORT` interno é sempre 3000; a porta do host segue `${PORT:-3000}`.
- **`NODE_ENV`:** padrão `development`. Em `production` o cookie de sessão vira `secure` e o login **não funciona via http://localhost**; só use `production` atrás de HTTPS.

## Decisões

- Pedido do usuário (2026-11-05): criar Docker Compose para facilitar subir o projeto.
- Motivo técnico extra: o `better-sqlite3@11` não compila no Node 26 da máquina local; o container fixa Node 22 e elimina esse problema.
- `docs/` e `tests/` ficam fora da imagem (`.dockerignore`) para mantê-la enxuta.
