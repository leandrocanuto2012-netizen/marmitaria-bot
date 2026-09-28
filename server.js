require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// =============================================
// BANCO DE DADOS
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ BANCO CONECTADO!');
    c.release();
  } catch (e) {
    console.error('❌ BANCO:', e.message);
  }
}
testarBanco();

// =============================================
// EVOLUTION API
// =============================================
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 EVO_URL:', EVO_URL ? '✅' : '❌');
console.log('🔍 EVO_KEY:', EVO_KEY ? '✅' : '❌');

// =============================================
// ENVIAR MENSAGEM
// =============================================
async function enviarMensagem(telefone, texto) {
  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: telefone, text: texto },
      { headers: { apikey: EVO_KEY } }
    );
    console.log('✅ RESPOSTA ENVIADA');
  } catch (e) {
    console.error('❌ Erro ao enviar:', e.response?.data || e.message);
  }
}

// =============================================
// PROCESSAR MENSAGEM
// =============================================
async function processarMensagem(telefone, texto) {
  const t = texto.trim().toLowerCase();

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(t)) {
    await enviarMensagem(telefone,
      'Olá! Tudo bem? 😋\n\n' +
      'Seja bem-vindo(a) à nossa Marmitaria!\n' +
      'Digite *cardápio* para ver nossos pratos.'
    );
  }
  else if (['cardápio', 'cardapio', 'menu', '1'].includes(t)) {
    await enviarMensagem(telefone,
      '🍽️ *NOSSO CARDÁPIO* 🍽️\n\n' +
      '1️⃣ Marmita Pequena — R$ 15,00\n' +
      '2️⃣ Marmita Média — R$ 18,00\n' +
      '3️⃣ Marmita Grande — R$ 22,00\n' +
      '4️⃣ Verificar Fiado\n' +
      '0️⃣ Falar com Atendente\n\n' +
      'Digite o número ou nome do item!'
    );
  }
  else if (['fiado', '4', 'saldo'].includes(t)) {
    await enviarMensagem(telefone, 'Vou verificar seu saldo... um momento! 🔄');
  }
  else {
    await enviarMensagem(telefone,
      'Desculpe, não entendi 😅\n' +
      'Digite *cardápio* para ver nossas opções!'
    );
  }
}

// =============================================
// ✅ ROTA DO WEBHOOK — CORRESPONDE AO QUE ESTÁ NO RAILWAY
// =============================================
app.post('/api/bot/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const message = data.messages?.[0];
      if (!message || message.fromMe) return res.sendStatus(200);

      const telefone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || '';
      
      console.log(`💬 ${telefone}: ${texto}`);
      await processarMensagem(telefone, texto);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Erro Webhook:', e);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => res.send('🚀 Marmitaria Bot — ONLINE!'));

const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => console.log(`🚀 Rodando na porta ${PORTA}`));
