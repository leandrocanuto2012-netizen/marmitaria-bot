require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { processarMensagem } = require('./bot.js'); // ← Importa o bot!
const app = express();

// ✅ PRIMEIRO — Webhook (ANTES do express.static!)
app.use(express.json());

// ========== WEBHOOK ==========
app.post('/webhook', async (req, res) => {
  console.log('\n' + '='.repeat(50));
  console.log('📩 RECEBIDO /webhook —', new Date().toLocaleString('pt-BR'));

  try {
    const evento = req.body;

    if (evento.event === 'messages.upsert' && evento.data?.messages) {
      for (const msg of evento.data.messages) {
        if (msg.fromMe) {
          console.log('↳ Mensagem do bot — ignorada');
          continue;
        }

        const telefone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        
        if (!texto) continue;

        console.log(`📩 De: ${telefone} — "${texto}"`);

        // ✅ Usa a função do bot.js
        const resposta = processarMensagem(telefone, texto);
        console.log(`🤖 Resposta pronta`);

        // Envia pelo Evolution
        try {
          await axios.post(
            `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`,
            { number: telefone, text: resposta },
            { headers: { apikey: process.env.EVO_KEY, 'Content-Type': 'application/json' } }
          );
          console.log('✅ RESPOSTA ENVIADA! 🎉');
        } catch (e) {
          console.error('❌ Erro envio:', e.response?.status, e.response?.data || e.message);
        }
      }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(200).send('OK');
  }
  console.log('='.repeat(50) + '\n');
});

// ✅ DEPOIS — Arquivos estáticos (public/cardápio)
app.use(express.static('public'));

// ========== PÁGINA INICIAL ==========
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial; text-align:center; padding:50px; background:#fef6e9;">
        <h1>🤖 marmita-bot-1 — ONLINE ✅</h1>
        <p>Webhook: <code>/webhook</code></p>
        <p>Bot carregado de: <code>bot.js</code></p>
        <p>Evolution: ${process.env.EVO_URL}</p>
      </body>
    </html>
  `);
});

// ========== INICIAR ==========
const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log('\n🚀 SERVIDOR INICIADO');
  console.log(`🔗 Webhook: https://marmita-bot-1.onrender.com/webhook`);
  console.log(`📡 Evolution: ${process.env.EVO_URL}`);
  console.log(`🤖 Instância: ${process.env.EVO_INSTANCE}`);
  console.log(`📂 Bot carregado de: bot.js`);
  console.log('✅ Tudo pronto! 🎉\n');
});
