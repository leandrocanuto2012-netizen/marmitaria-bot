require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();

// =============================================
// LOG COMPLETO
// =============================================
app.use((req, res, next) => {
  console.log('========================================');
  console.log(`📥 ${req.method} ${req.path}`);
  console.log('📦 CORPO:', JSON.stringify(req.body || {}));
  next();
});

app.use(express.json({ limit: '5mb' }));

// =============================================
// BANCO
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect().then(() => console.log('✅ BANCO CONECTADO'))
  .catch(e => console.error('❌ BANCO:', e.message));

// =============================================
// EVOLUTION
// =============================================
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 EVO_URL:', EVO_URL);
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
    console.log('✅ ENVIADO PARA:', telefone);
  } catch (e) {
    console.error('❌ ERRO ENVIO:', e.response?.data || e.message);
  }
}

// =============================================
// BUSCAR CLIENTE
// =============================================
async function buscarCliente(telefone) {
  try {
    const res = await pool.query(
      'SELECT id, name, balance FROM customers WHERE phone = $1 LIMIT 1',
      [telefone]
    );
    return res.rows[0] || null;
  } catch (e) {
    console.error('❌ ERRO BUSCA:', e.message);
    return null;
  }
}

// =============================================
// PROCESSAR E RESPONDER
// =============================================
async function processarMensagem(telefone, texto, pushName) {
  const t = String(texto || '').trim().toLowerCase();
  const cliente = await buscarCliente(telefone);
  const nome = cliente?.name || pushName || 'amigo(a)';

  console.log(`💬 ${nome} (${telefone}): "${texto}"`);

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(t)) {
    await enviarMensagem(telefone,
      `Olá, ${nome}! 😋 Tudo bem?\n\n` +
      'Digite *cardápio* para ver nossos pratos!'
    );
  }
  else if (['cardápio', 'cardapio', 'menu'].includes(t)) {
    await enviarMensagem(telefone,
      `Aqui está, ${nome}! 🍽️\n\n` +
      '1️⃣ Pequena — R$ 15,00\n' +
      '2️⃣ Média — R$ 18,00\n' +
      '3️⃣ Grande — R$ 22,00\n' +
      '4️⃣ Verificar Fiado\n' +
      '0️⃣ Falar com Atendente'
    );
  }
  else if (['fiado', '4', 'saldo'].includes(t)) {
    if (cliente) {
      await enviarMensagem(telefone, `${nome}, seu saldo: R$ ${cliente.balance || 0} 📋`);
    } else {
      await enviarMensagem(telefone, `${nome}, não encontrei seu cadastro. Fale com o atendente!`);
    }
  }
  else {
    await enviarMensagem(telefone, `Recebi, ${nome}! ✅ Digite *cardápio*`);
  }
}

// =============================================
// ✅ ROTA CORRETA — WEBHOOK
// =============================================
app.post('/api/bot/webhook', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO RECEBIDO:', event);

    if (event === 'messages.upsert') {
      const msg = data?.messages?.[0];
      if (!msg || msg.fromMe) return;

      const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
      const texto = 
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';
      const pushName = msg.pushName || 'Cliente';

      if (telefone && texto) {
        await processarMensagem(telefone, texto, pushName);
      }
    }
  } catch (e) {
    console.error('❌ ERRO:', e.message);
  }
});

// =============================================
// ⚠️ PÁGINA DE TESTE — AVISA QUE É PELA EVOLUTION
// =============================================
app.get('/api/bot/webhook', (req, res) => {
  res.send('⚠️ ROTA DO WEBHOOK — Use POST pela Evolution API! ✅');
});

app.get('/webhooksera', (req, res) => {
  res.send('❌ ROTA ERRADA! Use /api/bot/webhook');
});

app.get('/', (req, res) => {
  res.send('🚀 Marmitaria Bot — ONLINE! Use /api/bot/webhook ✅');
});

// =============================================
// INICIAR
// =============================================
const PORTA = process.env.PORT || 1000;
app.listen(PORTA, () => {
  console.log('========================================');
  console.log(`🚀 SERVIDOR NA PORTA ${PORTA}`);
  console.log(`🔗 WEBHOOK: https://marmitaria-bot-1.onrender.com/api/bot/webhook`);
  console.log('========================================');
});
