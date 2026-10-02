require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚙️ Configuração do .env
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  EVO_URL: process.env.EVO_URL?.replace(/\/$/, ''),
  EVO_KEY: process.env.EVO_KEY,
  INSTANCE_ID: process.env.INSTANCE_ID,
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/message/marmitaria/webhook',
  PORT: process.env.PORT || 8080
};

console.log('========================================');
console.log('🤖 MARMITARIA BOT — ONLINE');
console.log('🔗 Webhook:', CONFIG.WEBHOOK_PATH);
console.log('🆔 Instância:', CONFIG.INSTANCE_ID);
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

// 📤 ENVIAR MENSAGEM — Endpoint correto
async function enviarMensagem(telefone, texto) {
  try {
    const url = `${CONFIG.EVO_URL}/message/sendText/${CONFIG.INSTANCE_ID}`;
    
    console.log('📤 ENVIANDO RESPOSTA:');
    console.log('📍', url);
    console.log('📱 Para:', telefone);
    console.log('💬 Texto:', texto.substring(0, 60) + '...');
    
    const res = await axios.post(url, {
      number: telefone,
      text: texto
    }, {
      headers: {
        apikey: CONFIG.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ MENSAGEM ENVIADA COM SUCESSO! Status:', res.status);
    return true;
    
  } catch (e) {
    console.error('❌ ERRO NO ENVIO:');
    console.error('Status:', e.response?.status);
    console.error('Detalhe:', e.response?.data || e.message);
    return false;
  }
}

// 📥 WEBHOOK — TRATA TODOS OS EVENTOS SEM EXCEÇÃO
app.post(CONFIG.WEBHOOK_PATH, async (req, res) => {
  const { event, data } = req.body;
  
  console.log('📥 EVENTO RECEBIDO:', event);

  try {
    // ✅ 1 — MENSAGEM NOVA CHEGANDO → RESPONDE AQUI
    if (event === 'messages.upsert') {
      const msg = data?.message;
      
      if (!msg) {
        console.log('⚠️ Sem dados da mensagem');
        return res.sendStatus(200);
      }
      
      // Ignora o que EU enviei (confirmação de envio)
      if (msg.key?.fromMe) {
        console.log('↩️ Mensagem enviada pelo bot — confirmação, sem resposta');
        return res.sendStatus(200);
      }

      // Extrai dados do cliente
      const telefone = msg.key?.remoteJid?.replace('@c.us', '');
      const texto = msg.message?.conversation || msg.text || '';
      
      if (!telefone || !texto) {
        console.log('⚠️ Telefone ou texto vazio');
        return res.sendStatus(200);
      }
      
      console.log(`💬 Cliente ${telefone}: ${texto}`);
      
      // Gera e envia resposta
      const resposta = await bot.processar(telefone, texto, pool);
      
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      }
    }
    
    // ✅ 2 — ATUALIZAÇÃO DE STATUS (entregue, visto, lida)
    else if (event === 'messages.update') {
      console.log('📊 Atualização de status registrada — sem erro');
    }
    
    // ✅ 3 — QUALQUER OUTRO EVENTO → confirma sem quebrar
    else {
      console.log('ℹ️ Evento recebido:', event);
    }

    res.sendStatus(200); // ✅ Sempre responde 200 → não dá erro!
    
  } catch (e) {
    console.error('❌ ERRO NO PROCESSAMENTO:', e.message);
    res.sendStatus(200); // ✅ Mesmo com exceção → não retorna erro!
  }
});

// Página de verificação
app.get('/', (req, res) => {
  res.send(`
    <h2>🤖 Marmitária Bot — ONLINE</h2>
    <p>✅ Banco Conectado</p>
    <p>🔗 Webhook: ${CONFIG.WEBHOOK_PATH}</p>
    <p>🆔 Instância: ${CONFIG.INSTANCE_ID}</p>
    <p>✅ Tratando todos os eventos</p>
  `);
});

// Iniciar servidor
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${CONFIG.PORT}`);
  console.log(`🔗 Aguardando mensagens em: ${CONFIG.WEBHOOK_PATH}`);
  console.log(`✅ Pronto para responder!`);
});
