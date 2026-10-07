require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ⚙️ CONFIGURAÇÃO — NOME FIXO, NÃO USA MAIS ID
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  EVO_URL: process.env.EVO_URL?.replace(/\/$/, ''),
  EVO_KEY: process.env.EVO_KEY,
  INSTANCE_NAME: process.env.EVO_INSTANCE || 'marmitaria', // ✅ NOME FIXO
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/message/marmitaria/webhook',
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  PORT: process.env.PORT || 8080
};

console.log('========================================');
console.log('🤖 MARMITARIA BOT — ONLINE');
console.log('🗄️ Banco:', CONFIG.DATABASE_URL?.replace(/:.*@/, ':***@'));
console.log('🌐 EVO_URL:', CONFIG.EVO_URL);
console.log('🏪 Instância (nome):', CONFIG.INSTANCE_NAME);
console.log('🔗 Webhook:', CONFIG.WEBHOOK_PATH);
console.log('========================================');

// 🗄️ CONEXÃO COM SUPABASE
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Inicializa banco
async function inicializarBanco() {
  try {
    const client = await pool.connect();
    console.log('✅ CONECTADO NO SUPABASE!');
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
  } catch (e) {
    console.error('❌ ERRO BANCO:', e.message);
  }
}
inicializarBanco();

// 🧹 Limpa telefone — deixa só números
function limparTelefone(numero) {
  if (!numero) return null;
  return numero.toString().replace(/\D/g, '');
}

// 📤 ENVIAR MENSAGEM — AGORA USA NOME, NÃO ID
async function enviarMensagem(telefone, texto) {
  if (!CONFIG.EVO_URL || !CONFIG.EVO_KEY) {
    console.error('⛔ Faltam EVO_URL ou EVO_KEY!');
    return false;
  }

  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) return false;

  try {
    // ✅ USA INSTANCE_NAME = marmitaria — NÃO QUEBRA MAIS!
    const url = `${CONFIG.EVO_URL}/message/sendText/${CONFIG.INSTANCE_NAME}`;
    console.log(`📤 Enviando para ${numeroLimpo} via ${CONFIG.INSTANCE_NAME}`);

    await axios.post(url, {
      number: numeroLimpo,
      text: texto
    }, {
      headers: {
        apikey: CONFIG.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });

    // Salva resposta no banco
    await pool.query(
      'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
      [numeroLimpo, texto, 'bot']
    );
    console.log('✅ Resposta enviada e salva!');
    return true;
  } catch (e) {
    console.error('❌ ERRO ENVIO:');
    console.error('Status:', e.response?.status);
    console.error('Detalhe:', e.response?.data || e.message);
    return false;
  }
}

// 📥 RECEBER MENSAGEM DO WEBHOOK
app.post(CONFIG.WEBHOOK_PATH, async (req, res) => {
  const { event, instance, data } = req.body;
  console.log(`📥 EVENTO: ${event} | Instância: ${instance || CONFIG.INSTANCE_NAME}`);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg) return res.sendStatus(200);
      
      // Ignora mensagens enviadas pelo próprio bot
      if (msg.key?.fromMe) {
        console.log('↩️ Mensagem do bot — ignorada');
        return res.sendStatus(200);
      }

      // Pega o telefone em qualquer formato
      let telefone = null;
      if (msg.key?.remoteJid) {
        telefone = limparTelefone(msg.key.remoteJid);
      } else if (data?.remoteJid) {
        telefone = limparTelefone(data.remoteJid);
      } else if (msg.participant) {
        telefone = limparTelefone(msg.participant);
      }

      // Pega o texto da mensagem
      const texto = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    data?.text || '';

      if (!telefone || !texto) {
        console.log('⚠️ Telefone ou texto vazio — ignorado');
        return res.sendStatus(200);
      }

      console.log(`💬 ${telefone}: ${texto.substring(0, 60)}...`);

      // Salva mensagem do cliente no banco
      await pool.query(
        'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
        [telefone, texto, 'cliente']
      );
      console.log('✅ Mensagem salva no banco!');

      // Processa com o bot e responde
      const resposta = await bot.processar(telefone, texto, pool);
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      } else {
        console.log('ℹ️ Sem resposta definida para essa mensagem');
      }
    }
    else if (event === 'messages.update') {
      console.log('📊 Status de mensagem atualizado');
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO NO PROCESSAMENTO:', e.message);
    res.sendStatus(200);
  }
});

// 📋 Página de status
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
    <h2>🤖 Marmitária Bot — ONLINE</h2>
    <p>✅ Banco Conectado</p>
    <p>🏪 Instância: ${CONFIG.INSTANCE_NAME}</p>
    <p>🔗 Webhook: ${CONFIG.WEBHOOK_PATH}</p>
    <p><a href="/meus-dados">📋 Ver mensagens salvas</a></p>
  `);
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${CONFIG.PORT}`);
  console.log(`🔗 Aguardando eventos em: ${CONFIG.WEBHOOK_PATH}`);
});
