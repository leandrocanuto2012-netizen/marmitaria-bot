require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '5mb' }));

// =============================================
// BANCO
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
// EVOLUTION
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
      { headers: { apikey: EVO_KEY }, timeout: 15000 }
    );
    console.log('✅ ENVIADO PARA:', telefone);
  } catch (e) {
    console.error('❌ ERRO AO ENVIAR:', e.response?.data || e.message);
  }
}

// =============================================
// ✅ FUNÇÃO CORRIGIDA — LÊ O TEXTO DE TODOS OS LUGARES
// =============================================
function extrairTextoMensagem(message) {
  if (!message?.message) return '';
  
  // Tira de TODOS os lugares possíveis 👇
  return (
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    message.message.imageMessage?.caption ||
    message.message.videoMessage?.caption ||
    message.message.documentMessage?.caption ||
    ''
  );
}

async function processarMensagem(telefone, texto) {
  console.log(`💬 RECEBIDO DE ${telefone}: [${texto}]`); // Mostra o que leu!

  const t = texto.trim().toLowerCase();

  if (!t) {
    await enviarMensagem(telefone, 'Desculpe, não entendi o texto 😅 Pode digitar novamente?');
    return;
  }

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(t)) {
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
      `Recebi: "${texto}" ✅\n\n` +
      'Digite *cardápio* para ver nossas opções!'
    );
  }
}

// =============================================
// WEBHOOK
// =============================================
app.post('/api/marmitaria/webhook', async (req, res) => {
  res.status(200).send({ ok: true }); // Responde rápido ⚡

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const message = data.messages?.[0];
      if (!message || message.fromMe) return;

      const telefone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = extrairTextoMensagem(message); // ✅ Agora lê certo!
      
      await processarMensagem(telefone, texto);
    }
  } catch (e) {
    console.error('❌ ERRO:', e.message);
  }
});

app.get('/', (req, res) => {
  res.send('🚀 Marmitaria Bot — ONLINE!');
});

const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => {
  console.log(`🚀 Rodando na porta ${PORTA}`);
});
