require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();

// LOG DE TUDO ⬇️
app.use((req, res, next) => {
  console.log('========================================');
  console.log(`📥 ${req.method} ${req.path}`);
  console.log('📦 CORPO:', JSON.stringify(req.body, null, 2));
  next();
});

app.use(express.json({ limit: '5mb' }));

// BANCO
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect().then(() => console.log('✅ BANCO CONECTADO'))
  .catch(e => console.error('❌ BANCO:', e.message));

// EVOLUTION
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 EVO_URL:', EVO_URL);
console.log('🔍 EVO_KEY:', EVO_KEY ? '✅' : '❌');

// ENVIAR
async function enviarMensagem(telefone, texto) {
  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: telefone, text: texto },
      { headers: { apikey: EVO_KEY } }
    );
    console.log('✅ RESPOSTA ENVIADA');
  } catch (e) {
    console.error('❌ ERRO ENVIO:', e.response?.data || e.message);
  }
}

// EXTRAIR TEXTO — TODAS AS FORMAS
function pegarTexto(msg) {
  if (!msg?.message) return 'SEM_MENSAGEM';
  
  const t = 
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.surfaceMessage?.body ||
    Object.values(msg.message)[0]?.text ||
    'NAO_CONSEGUIU_LER';
  
  console.log(`📝 TEXTO LIDO: "${t}"`);
  return t;
}

// PROCESSAR
async function responder(telefone, texto) {
  const t = String(texto).trim().toLowerCase();
  console.log(`💬 PROCESSANDO: "${t}"`);

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(t)) {
    await enviarMensagem(telefone, 'Olá! Tudo bem? 😋 Digite *cardápio* para ver nossos pratos!');
  }
  else if (['cardápio', 'cardapio', 'menu'].includes(t)) {
    await enviarMensagem(telefone, '🍽️ CARDÁPIO:\n1️⃣ Pequena R$15\n2️⃣ Média R$18\n3️⃣ Grande R$22\nDigite o número!');
  }
  else {
    await enviarMensagem(telefone, `Recebi: "${t}" ✅\nDigite *cardápio*!`);
  }
}

// WEBHOOK
app.post('/api/bot/webhook', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const msg = data?.messages?.[0];
      if (!msg) return console.log('⚠️ Sem mensagem no payload');
      if (msg.fromMe) return console.log('↩ Mensagem do bot — ignorando');

      const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
      const texto = pegarTexto(msg);
      
      console.log(`📞 DE: ${telefone}`);
      
      if (telefone && texto && texto !== 'NAO_CONSEGUIU_LER') {
        await responder(telefone, texto);
      } else {
        await enviarMensagem(telefone, 'Recebi sua mensagem! ✅ Digite *cardápio*');
      }
    }
  } catch (e) {
    console.error('❌ ERRO:', e);
  }
});

app.get('/', (req, res) => res.send('🚀 ONLINE!'));

const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => console.log(`🚀 NA PORTA ${PORTA}`));
