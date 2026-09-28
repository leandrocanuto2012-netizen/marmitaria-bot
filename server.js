require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { processar, setBanco } = require('./bot');

const app = express();

// log de tudo
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: '5mb' }));

// banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function iniciar() {
  try {
    const client = await pool.connect();
    client.release();
    console.log('✅ BANCO CONECTADO');
    setBanco(pool);
  } catch (e) {
    console.error('❌ ERRO AO CONECTAR NO BANCO:', e.message);
  }
}
iniciar();

// rota health
app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'bot-whatsapp',
    webhook: '/api/bot/webhook'
  });
});

// webhook
app.post('/api/bot/webhook', async (req, res) => {
  // responde rápido pro serviço não reenviar
  res.status(200).json({ ok: true });

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event !== 'messages.upsert') return;

    const msg = data?.messages?.[0];
    if (!msg || msg.key?.fromMe || msg.fromMe) return;

    const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '')?.replace('@g.us', '');
    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';

    const pushName = msg.pushName || 'Cliente';

    console.log(`📞 ${telefone} | "${texto}"`);

    if (telefone && texto) {
      await processar(telefone, texto, pushName);
    }
  } catch (e) {
    console.error('❌ ERRO NO WEBHOOK:', e.message);
  }
});

const PORTA = process.env.PORT || 1000;
app.listen(PORTA, () => {
  console.log('========================================');
  console.log(`🚀 RODANDO NA PORTA ${PORTA}`);
  console.log(`🔗 WEBHOOK: ${process.env.WEBHOOK_URL || 'configure WEBHOOK_URL no .env'}`);
  console.log('========================================');
});
