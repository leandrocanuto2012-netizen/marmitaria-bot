require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { processarMensagem } = require('./bot.js');
const app = express();

// ==============================================
// ✅ PASSO 1 — JSON PRIMEIRO
// ==============================================
app.use(express.json());

// ==============================================
// ✅ PASSO 2 — WEBHOOK ANTES DE TUDO! SEMPRE!
// ==============================================
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
        
        if (!texto) {
          console.log('↳ Sem texto — ignorada');
          continue;
        }

        console.log(`📩 ${telefone}: "${texto}"`);

        // Processa usando bot.js
        const resposta = processarMensagem(telefone, texto);
        console.log(`🤖 Resposta: "${resposta.substring(0,50)}..."`);

        // Envia resposta
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
    console.error('❌ Erro geral:', e.message);
    res.status(200).send('OK');
  }
  console.log('='.repeat(50) + '\n');
});

// ==============================================
// ✅ PASSO 3 — PASTA public DEPOIS do webhook!
// ==============================================
app.use(express.static('public'));  // ← Cardápio HTML carrega AQUI, sem bloquear nada!

// ==============================================
// ✅ PASSO 4 — PÁGINA INICIAL
// ==============================================
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial; text-align:center; padding:50px; background:#fef6e9;">
        <h1>🤖 marmita-bot-1 — ONLINE ✅</h1>
        <p>Webhook funcionando: <code>/webhook</code></p>
        <p>Cardápio disponível em: <a href="/cardapio.html">/cardapio.html</a></p>
        <p>Evolution: ${process.env.EVO_URL}</p>
      </body>
    </html>
  `);
});

// ==============================================
// ✅ PASSO 5 — INICIAR
// ==============================================
const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log('\n🚀 SERVIDOR RODANDO');
  console.log(`🔗 Webhook: https://marmita-bot-1.onrender.com/webhook`);
  console.log(`📂 Cardápio: https://marmita-bot-1.onrender.com/cardapio.html`);
  console.log(`📡 Evolution: ${process.env.EVO_URL}`);
  console.log('✅ Tudo pronto! 🎉\n');
});
