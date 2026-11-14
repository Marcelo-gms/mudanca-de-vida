// Diagnóstico de login: mostra qual banco está em uso, se ele é gravável e se o
// e-mail/senha digitados conferem com o que está salvo. A senha nunca é exibida.
// Uso (na raiz da aplicação): node scripts/diagnose-login.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { db } = require('../src/config/database');

// Uma única interface para todas as perguntas: com várias, a primeira consome
// toda a entrada colada/redirecionada e as seguintes ficam sem resposta.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => { if (!muted) write(s); };

// O iterador guarda linhas que chegam antes da pergunta (entrada colada de uma vez).
const lines = rl[Symbol.asyncIterator]();

async function ask(question, hidden = false) {
  process.stdout.write(question);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write('\n');
  return value || '';
}

(async () => {
  const dbPath = path.isAbsolute(env.dbFile) ? env.dbFile : path.resolve(__dirname, '..', env.dbFile);
  console.log('pasta da aplicacao :', path.resolve(__dirname, '..'));
  console.log('NODE_ENV           :', env.nodeEnv);
  console.log('arquivo do banco   :', dbPath);
  try {
    fs.accessSync(dbPath, fs.constants.W_OK);
    fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
    console.log('banco gravavel     : sim');
  } catch {
    console.log('banco gravavel     : NAO (cadastro e login podem falhar)');
  }
  console.log('ADMIN_EMAIL no .env:', JSON.stringify((process.env.ADMIN_EMAIL || '').trim().toLowerCase()));
  console.log('usuarios no banco  :');
  console.table(db.prepare('SELECT email, role, status, created_at FROM users ORDER BY created_at').all());

  const email = (await ask('E-mail que voce digita no login: ')).trim().toLowerCase();
  const password = await ask('Senha que voce digita no login (nao aparece): ', true);

  const user = db.prepare('SELECT role, status, password_hash FROM users WHERE email = ?').get(email);
  if (!user) {
    console.log(`\nRESULTADO: o e-mail ${JSON.stringify(email)} NAO existe neste banco.`);
  } else {
    const ok = bcrypt.compareSync(password, user.password_hash);
    console.log(`\nRESULTADO: e-mail encontrado (role=${user.role}, status=${user.status}). Senha digitada ${ok ? 'CONFERE' : 'NAO confere'}.`);
    console.log(`           tamanho da senha digitada: ${password.length} caracteres`);
  }
  rl.close();
})();
