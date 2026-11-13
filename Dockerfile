FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 usa binário pré-compilado; toolchain só entra se o download falhar
COPY package*.json ./
RUN npm ci --omit=dev || (apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev && apt-get purge -y python3 make g++ && rm -rf /var/lib/apt/lists/*)

COPY . .

EXPOSE 3000

# initDb é idempotente: cria schema, contas demo (fora de produção) e o admin de ADMIN_* do .env
CMD ["sh", "-c", "node scripts/initDb.js && node src/server.js"]
