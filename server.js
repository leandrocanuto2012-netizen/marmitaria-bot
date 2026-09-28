require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { processar, setBanco } = require('./bot'); // ✅ LIGAÇÃO CERTA

const app = express();

// LOG TUDO
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: '5mb' }));

// BANCO
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function iniciar() {
  try {
    await pool.connect();
    console.log('✅ BANCO CONECTADO');
    setBanco(pool); // ✅ PASSA CONEXÃO PRO BOT
  } catch (e) {
    console.error('❌ BANCO:', e.message);
  }
}
iniciar();

// ✅ ROTA — ACEITA OS DOIS CAMINHOS
app.post(['/api/bot/webhook', '//api/bot/webhook'], async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const msg = data?.messages?.[0];
      if (!msg || msg.fromMe) return;

      const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
      const texto = 
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || '';
      const pushName = msg.pushName || 'Cliente';

      console.log(`📞 ${telefone} | "${texto}"`);

      if (telefone && texto) {
        await processar(telefone, texto, pushName); // ✅ CHAMA O BOT
      }
    }
  } catch (e) {
    console.error('❌ ERRO:', e.message);
  }
});

app.get('/', (req, res) => {
  res.send('🚀 ONLINE! Webhook: /api/bot/webhook ✅');
});

const PORTA = process.env.PORT || 1000;
app.listen(PORTA, () => {
  console.log('========================================');
  console.log(`🚀 RODANDO NA PORTA ${PORTA}`);
  console.log(`🔗 https://marmitaria-bot-1.onrender.com/api/bot/webhook`);
  console.log('========================================');
});
