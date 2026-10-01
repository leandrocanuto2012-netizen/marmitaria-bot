require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Conexão com o banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ Banco conectado!');
    c.release();
  } catch(e) {
    console.error('❌ ERRO NO BANCO:', e.message);
  }
}
testarBanco();

// Enviar mensagem pela Evolution
async function enviarMensagem(telefone, texto) {
  try {
    const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
    await axios.post(url, {
      number: telefone,
      text: texto
    }, {
      headers: {
        'apikey': process.env.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('📤 Mensagem enviada para:', telefone);
  } catch(e) {
    console.error('❌ Erro ao enviar:', e.response?.data || e.message);
  }
}

// Webhook — caminho correto!
app.post('/api/bot/webhook', async (req, res) => {
  try {
    const evento = req.body;
    console.log('📥 Evento recebido:', evento?.event);

    // Só processa mensagens recebidas
    if (evento.event === 'messages.upsert' && evento.data?.message) {
      const msg = evento.data.message;
      
      // Ignora mensagens enviadas pelo próprio bot
      if (msg.fromMe) return res.sendStatus(200);

      const telefone = msg.key.remoteJid.replace('@c.us', '');
      const textoRecebido = msg.text || '';
      
      console.log(`💬 De ${telefone}: ${textoRecebido}`);

      // Processa a resposta no bot
      const resposta = await bot.processar(telefone, textoRecebido, pool);
      
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      }
    }

    res.sendStatus(200);
  } catch(e) {
    console.error('❌ Erro no webhook:', e.message);
    res.sendStatus(500);
  }
});

// Rota de teste
app.get('/', (req, res) => {
  res.send('🤖 Bot da Marmitária está funcionando!');
});

const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
  console.log(`🔗 Webhook: https://marmita-bot-1.onrender.com/api/bot/webhook`);
});
