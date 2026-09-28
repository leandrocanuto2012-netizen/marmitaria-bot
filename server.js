require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();

// =============================================
// ⚡ MIDDLEWARE — LOG DE TUDO QUE CHEGA
// =============================================
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

// =============================================
// 🗄️ BANCO DE DADOS — SUPABASE
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO:', erro.message);
  }
}
testarBanco();

// =============================================
// 🤖 EVOLUTION API — CONFIGURAÇÃO
// =============================================
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 VARIÁVEIS CARREGADAS:');
console.log('EVO_URL:', EVO_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_KEY:', EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('EVO_INSTANCE:', EVO_INSTANCE);

// =============================================
// ✉️ FUNÇÃO — ENVIAR MENSAGEM
// =============================================
async function enviarMensagem(telefone, texto) {
  try {
    const resposta = await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      {
        number: telefone,
        text: texto
      },
      {
        headers: { apikey: EVO_KEY },
        timeout: 15000
      }
    );
    console.log(`✅ MENSAGEM ENVIADA PARA: ${telefone}`);
    return resposta.data;
  } catch (erro) {
    console.error('❌ ERRO AO ENVIAR:', erro.response?.data || erro.message);
  }
}

// =============================================
// 🔍 FUNÇÃO — EXTRAIR TEXTO DA MENSAGEM
// =============================================
function extrairTextoMensagem(mensagem) {
  if (!mensagem?.message) return '';

  return (
    mensagem.message.conversation ||
    mensagem.message.extendedTextMessage?.text ||
    mensagem.message.imageMessage?.caption ||
    mensagem.message.videoMessage?.caption ||
    mensagem.message.documentMessage?.caption ||
    ''
  );
}

// =============================================
// 💬 FUNÇÃO — PROCESSAR MENSAGEM RECEBIDA
// =============================================
async function processarMensagem(telefone, texto) {
  console.log(`💬 RECEBIDO DE ${telefone}: "${texto}"`);

  const textoLimpo = texto.trim().toLowerCase();

  if (!textoLimpo) {
    await enviarMensagem(telefone, 'Desculpe, não consegui entender o texto 😅 Pode digitar novamente?');
    return;
  }

  // === SAUDAÇÃO ===
  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(textoLimpo)) {
    await enviarMensagem(telefone,
      'Olá! Tudo bem? 😋\n\n' +
      'Seja bem-vindo(a) à nossa Marmitaria!\n' +
      'Digite *cardápio* para ver nossos pratos.'
    );
  }

  // === CARDÁPIO ===
  else if (['cardápio', 'cardapio', 'menu', '1'].includes(textoLimpo)) {
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

  // === FIADO ===
  else if (['fiado', '4', 'saldo', 'conta'].includes(textoLimpo)) {
    await enviarMensagem(telefone, 'Vou verificar seu saldo... um momento! 🔄');
  }

  // === FALAR COM ATENDENTE ===
  else if (['0', 'atendente', 'falar com alguém', 'humano'].includes(textoLimpo)) {
    await enviarMensagem(telefone, 'Certo! Estou transferindo para um atendente... 📞');
  }

  // === RESPOSTA PADRÃO ===
  else {
    await enviarMensagem(telefone,
      `Recebi: "${texto}" ✅\n\n` +
      'Digite *cardápio* para ver nossas opções!'
    );
  }
}

// =============================================
// 🌐 ROTA — WEBHOOK (PONTO DE ENTRADA)
// =============================================
app.post('/api/bot/webhook', async (req, res) => {
  // ⚡ RESPONDE RÁPIDO — evita timeout!
  res.status(200).json({ ok: true, recebido: true });

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO RECEBIDO:', event);

    // Só processa evento de mensagem nova
    if (event === 'messages.upsert') {
      const mensagem = data.messages?.[0];

      // Ignora mensagens enviadas pelo próprio bot
      if (!mensagem || mensagem.fromMe) {
        console.log('↩ Ignorando — mensagem do próprio bot');
        return;
      }

      // Extrai dados
      const telefone = mensagem.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = extrairTextoMensagem(mensagem);

      console.log(`📞 Telefone: ${telefone}`);
      console.log(`📝 Texto extraído: "${texto}"`);

      // Processa e responde
      await processarMensagem(telefone, texto);
    }
  } catch (erro) {
    console.error('❌ ERRO NO PROCESSAMENTO:', erro.message);
  }
});

// =============================================
// 🏠 ROTA — PÁGINA INICIAL (VERIFICAR SE ESTÁ ONLINE)
// =============================================
app.get('/', (req, res) => {
  res.send('🚀 Marmitaria Bot — ONLINE E FUNCIONANDO! ✅');
});

// =============================================
// 🚀 INICIAR SERVIDOR
// =============================================
const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => {
  console.log('========================================');
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`🔗 Webhook: /api/bot/webhook`);
  console.log('========================================');
});
