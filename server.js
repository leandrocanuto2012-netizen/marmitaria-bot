require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚙️ TUDO DO .env
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  EVO_URL: process.env.EVO_URL?.replace(/\/$/, ''),
  EVO_KEY: process.env.EVO_KEY,
  INSTANCE_ID: process.env.INSTANCE_ID,
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/message/marmitaria/webhook',
  PORT: process.env.PORT || 8080
};

console.log('========================================');
console.log('🔧 CONFIGURAÇÃO CARREGADA');
console.log('🌐 EVO_URL:     ', CONFIG.EVO_URL);
console.log('🔑 EVO_KEY:     ', CONFIG.EVO_KEY?.substring(0, 20) + '...');
console.log('🆔 INSTANCE_ID: ', CONFIG.INSTANCE_ID);
console.log('🔗 WEBHOOK:     ', CONFIG.WEBHOOK_PATH);
console.log('🚀 PORTA:       ', CONFIG.PORT);
console.log('========================================');

// Banco
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ BANCO CONECTADO');
    c.release();
  } catch (e) {
    console.error('❌ BANCO ERRO:', e.message);
  }
}
testarBanco();

// 📤 Enviar Mensagem
async function enviarMensagem(telefone, texto) {
  try {
    const url = `${CONFIG.EVO_URL}/message/sendText/${CONFIG.INSTANCE_ID}`;
    
    console.log('📤 ENVIANDO PARA:', url);
    console.log('📤 Para:', telefone);
    
    const res = await axios.post(url, {
      number: telefone,
      text: texto
    }, {
      headers: {
        apikey: CONFIG.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ RESPOSTA ENVIADA! Status:', res.status);
    return true;
    
  } catch (e) {
    console.error('❌ ERRO NO ENVIO:');
    console.error('Status:', e.response?.status);
    console.error('Detalhe:', e.response?.data || e.message);
    return false;
  }
}

// 📥 RECEBER — CAMINHO EXATO /message/marmitaria/webhook
app.post(CONFIG.WEBHOOK_PATH, async (req, res) => {
  const { event, data } = req.body;
  console.log('📥 EVENTO RECEBIDO:', event);
  console.log('📍 Caminho:', CONFIG.WEBHOOK_PATH);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg) return res.sendStatus(200);
      
      if (msg.key?.fromMe) {
        console.log('↩️ Mensagem do bot — ignorada');
        return res.sendStatus(200);
      }

      const telefone = msg.key?.remoteJid?.replace('@c.us', '');
      const texto = msg.message?.conversation || msg.text || '';
      
      if (!telefone || !texto) return res.sendStatus(200);
      
      console.log(`💬 ${telefone}: ${texto}`);
      
      const resposta = await bot.processar(telefone, texto, pool);
      if (resposta) await enviarMensagem(telefone, resposta);
    }
    
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    res.sendStatus(500);
  }
});

// Página de verificação
app.get('/', (req, res) => {
  res.send(`
    <h2>🤖 Marmitária Bot — ONLINE</h2>
    <p>✅ Banco Conectado</p>
    <p>🔗 Webhook: ${CONFIG.WEBHOOK_PATH}</p>
    <p>🆔 Instância: ${CONFIG.INSTANCE_ID}</p>
  `);
});

// Iniciar
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 SERVIDOR NA PORTA ${CONFIG.PORT}`);
  console.log(`🔗 Aguardando em: ${CONFIG.WEBHOOK_PATH}`);
});
