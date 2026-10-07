require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATABASE_URL = process.env.DATABASE_URL;
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE_ID = process.env.INSTANCE_ID;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/message/marmitaria/webhook';
const PORT = process.env.PORT || 8080;

console.log('========================================');
console.log('🤖 MARMITARIA BOT — CONEXÃO BANCO');
console.log('🔌 Tentando conectar...');
console.log('========================================');

// 🗄️ CONEXÃO — DUAS OPÇÕES PARA GARANTIR!
let pool;

function criarConexao() {
  // Tenta com a URL completa
  if (DATABASE_URL) {
    console.log('📋 Usando DATABASE_URL das variáveis');
    return new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });
  }
  
  // Fallback: monta manualmente
  console.log('📋 Montando conexão manualmente');
  return new Pool({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.rurubtvjhtymhriwlrlr',
    password: 'leandrocanuto123',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

pool = criarConexao();

// ✅ TESTA CONEXÃO
async function testarBanco() {
  try {
    const client = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        telefone VARCHAR(30) NOT NULL,
        texto TEXT NOT NULL,
        remetente VARCHAR(10) NOT NULL DEFAULT 'cliente',
        data TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela mensagens pronta!');
    client.release();
    return true;
  } catch (e) {
    console.error('❌ ERRO DE CONEXÃO:');
    console.error('Mensagem:', e.message);
    
    if (e.message.includes('ENOTFOUND')) {
      console.error('💡 O sistema não está achando o endereço do banco.');
      console.error('💡 Verifique se a URL está correta no Render → Environment');
    }
    
    return false;
  }
}

const bancoConectado = testarBanco();

// 🔧 Limpa telefone
function limparTelefone(numero) {
  if (!numero) return null;
  return numero.toString().replace(/\D/g, '');
}

// 📤 Enviar mensagem
async function enviarMensagem(telefone, texto) {
  if (!INSTANCE_ID) return false;
  
  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) return false;

  try {
    const url = `${EVO_URL}/message/sendText/${INSTANCE_ID}`;
    
    await axios.post(url, {
      number: numeroLimpo,
      text: texto
    }, {
      headers: {
        apikey: EVO_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (await bancoConectado) {
      await pool.query(
        'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
        [numeroLimpo, texto, 'bot']
      );
    }
    
    return true;
  } catch (e) {
    console.error('❌ Erro envio:', e.response?.status || e.message);
    return false;
  }
}

// 📥 Receber mensagem
app.post(WEBHOOK_PATH, async (req, res) => {
  const { event, data } = req.body;
  console.log('📥 EVENTO:', event);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg) return res.sendStatus(200);
      
      if (msg.key?.fromMe) {
        console.log('↩️ Mensagem do bot — ignorada');
        return res.sendStatus(200);
      }

      let telefone = null;
      if (msg.key?.remoteJid) {
        telefone = limparTelefone(msg.key.remoteJid);
      } else if (data?.remoteJid) {
        telefone = limparTelefone(data.remoteJid);
      }

      const texto = msg.message?.conversation || '';
      
      if (!telefone || !texto) return res.sendStatus(200);

      console.log(`💬 ${telefone}: ${texto.substring(0, 40)}...`);

      if (await bancoConectado) {
        await pool.query(
          'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
          [telefone, texto, 'cliente']
        );
      }

      const resposta = await bot.processar(telefone, texto, pool);
      if (resposta) await enviarMensagem(telefone, resposta);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    res.sendStatus(200);
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h2>🤖 Marmitária Bot</h2>
    <p>Banco: ${await bancoConectado ? '✅ Conectado' : '❌ Sem conexão'}</p>
    <p>Webhook: ${WEBHOOK_PATH}</p>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor na porta ${PORT}`);
  console.log(`🔗 Aguardando em: ${WEBHOOK_PATH}`);
});
