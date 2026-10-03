require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚙️ SUAS VARIÁVEIS — CARREGADAS DO .env
const DATABASE_URL = process.env.DATABASE_URL;
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE_ID = process.env.INSTANCE_ID;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/message/marmitaria/webhook';
const PORT = process.env.PORT || 8080;

console.log('========================================');
console.log('🤖 MARMITARIA BOT — SEU SUPABASE');
console.log('🗄️ Banco:', DATABASE_URL?.replace(/:.*@/, ':***@'));
console.log('🔌 Porta: 5432 ✅');
console.log('🆔 Instância:', INSTANCE_ID || '❌ FALTA');
console.log('🔗 Webhook:', WEBHOOK_PATH);
console.log('========================================');

// 🗄️ CONEXÃO COM SEU SUPABASE
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ INICIALIZA BANCO + CRIA TABELA SE PRECISAR
async function inicializarBanco() {
  try {
    const client = await pool.connect();
    console.log('✅ CONECTADO NO SEU SUPABASE!');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        telefone VARCHAR(30) NOT NULL,
        texto TEXT NOT NULL,
        remetente VARCHAR(10) NOT NULL DEFAULT 'cliente',
        data TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela "mensagens" pronta!');

    client.release();
  } catch (e) {
    console.error('❌ ERRO NO BANCO:', e.message);
  }
}
inicializarBanco();

// 🔧 Limpa telefone
function limparTelefone(numero) {
  if (!numero) return null;
  return numero.toString().replace(/\D/g, '');
}

// 📤 ENVIAR RESPOSTA VIA RAILWAY + SALVAR NO SEU BANCO
async function enviarMensagem(telefone, texto) {
  if (!INSTANCE_ID) {
    console.error('⛔ INSTANCE_ID não configurada!');
    return false;
  }

  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) return false;

  try {
    const url = `${EVO_URL}/message/sendText/${INSTANCE_ID}`;
    console.log('📤 Enviando para:', numeroLimpo);

    await axios.post(url, {
      number: numeroLimpo,
      text: texto
    }, {
      headers: {
        apikey: EVO_KEY,
        'Content-Type': 'application/json'
      }
    });

    // ✅ SALVA RESPOSTA NO SEU BANCO
    await pool.query(
      'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
      [numeroLimpo, texto, 'bot']
    );
    console.log('✅ Resposta salva no Supabase!');
    
    return true;
  } catch (e) {
    console.error('❌ Erro envio:', e.response?.data || e.message);
    return false;
  }
}

// 📥 RECEBER MENSAGEM + SALVAR NO SEU BANCO
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

      // Pega telefone de qualquer formato
      let telefone = null;
      if (msg.key?.remoteJid) {
        telefone = limparTelefone(msg.key.remoteJid);
      } else if (data?.remoteJid) {
        telefone = limparTelefone(data.remoteJid);
      } else if (msg.participant) {
        telefone = limparTelefone(msg.participant);
      }

      const texto = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    data?.text || '';

      if (!telefone || !texto) return res.sendStatus(200);

      console.log(`💬 ${telefone}: ${texto.substring(0, 50)}...`);

      // ✅ SALVA MENSAGEM DO CLIENTE
      await pool.query(
        'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
        [telefone, texto, 'cliente']
      );
      console.log('✅ Mensagem salva no Supabase!');

      // Gera e envia resposta
      const resposta = await bot.processar(telefone, texto, pool);
      if (resposta) await enviarMensagem(telefone, resposta);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    res.sendStatus(200);
  }
});

// 📋 VER TUDO SALVO
app.get('/meus-dados', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM mensagens ORDER BY data DESC LIMIT 50'
    );
    res.json({ total: rows.length, mensagens: rows });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h2>🤖 Marmitária Bot</h2>
    <p>✅ Conectado no SEU Supabase (porta 5432)</p>
    <p>🆔 Instância: ${INSTANCE_ID || '❌ FALTA'}</p>
    <p><a href="/meus-dados">📋 Ver todas as mensagens salvas</a></p>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Rodando na porta ${PORT}`);
  console.log(`🔗 Webhook: ${WEBHOOK_PATH}`);
});
