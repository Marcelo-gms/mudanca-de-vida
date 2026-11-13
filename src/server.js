const app = require('./app');
const env = require('./config/env');
const { initSchema } = require('./config/database');

// Garante tabelas criadas antes de iniciar o listener
initSchema();

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🐯 Mini Plataforma iGaming Tigrinho iniciada com sucesso!`);
  console.log(` 🚀 Servidor rodando em: http://localhost:${env.port} ou http://0.0.0.0:${env.port}`);
  console.log(` 📦 Modo: ${env.nodeEnv} | Asaas Mock: ${env.asaas.enableMock}`);
  console.log(`=======================================================`);

  // Avisos de configuração insegura para produção
  if (env.nodeEnv === 'production') {
    if (env.asaas.enableMock) {
      console.warn(' ⚠️  ATENÇÃO: modo mock do Asaas ativo em produção — pagamentos NÃO são reais.');
    }
    if (!env.asaas.webhookToken) {
      console.warn(' ⚠️  ATENÇÃO: ASAAS_WEBHOOK_TOKEN não configurado — webhooks serão rejeitados.');
    }
    if (env.sessionSecret.includes('fallback')) {
      console.warn(' ⚠️  ATENÇÃO: SESSION_SECRET padrão em uso — defina um segredo forte no .env.');
    }
  }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('Encerrando servidor gracefully...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Encerrando servidor...');
  server.close(() => process.exit(0));
});

