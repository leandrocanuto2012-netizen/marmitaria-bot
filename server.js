require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// =============================================
// BANCO DE DADOS — SUPABASE
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const client = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    client.release();
  } catch (e) {
    console.error('❌ ERRO NO BANCO:', e.message);
  }
}
testarBanco();

// =============================================
// EVOLUTION API — CONFIGURAÇÃO
// =============================================
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 VARIÁVEIS:');
console.log('EVO_URL:', EVO_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_KEY:', EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('EVO_INSTANCE:', EVO_INSTANCE);

// =============================================
// ROTAS BÁSICAS
// =============================================
app.get('/', (req, res) => {
  res.send('🚀 Servidor Marmitaria funcionando!');
});

// Webhook Evolution
app.post('/webhook/evolution', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const message = data.messages?.[0];
      if (!message || message.fromMe) return res.sendStatus(200);

      const telefone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = message.message.conversation || '';
      
      console.log(`💬 Mensagem de ${telefone}: ${texto}`);
      await processarMensagem(telefone, texto);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Erro webhook:', e);
    res.sendStatus(500);
  }
});

// Enviar mensagem
async function enviarMensagem(telefone, texto) {
  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: telefone, text: texto },
      { headers: { 'apikey': EVO_KEY } }
    );
    console.log('✅ Mensagem enviada');
  } catch (e) {
    console.error('Erro ao enviar:', e.response?.data || e.message);
  }
}

// Processar mensagem do bot
async function processarMensagem(telefone, texto) {
  const t = texto.trim().toLowerCase();

  if (['menu', 'cardapio', '1'].includes(t)) {
    await enviarMensagem(telefone, 
      '🍽️ *CARDÁPIO* 🍽️\n\n' +
      '1️⃣ Marmita Pequena — R$ 15,00\n' +
      '2️⃣ Marmita Média — R$ 18,00\n' +
      '3️⃣ Marmita Grande — R$ 22,00\n' +
      '4️⃣ Consultar Fiado\n' +
      '0️⃣ Falar com Atendente\n\n' +
      'Digite o número do que deseja!'
    );
  } else if (['2', 'pedido'].includes(t)) {
    await enviarMensagem(telefone, 'Ótima escolha! 🥗 Qual item você quer? Digite o número:');
  } else if (['4', 'fiado'].includes(t)) {
    await enviarMensagem(telefone, 'Vou verificar seu saldo... 🔄');
  } else {
    await enviarMensagem(telefone, 
      'Olá! Seja bem-vindo(a) à Marmitaria! 😋\n\n' +
      'Digite *menu* para ver nosso cardápio!'
    );
  }
}

const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
});
