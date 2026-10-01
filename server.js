require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ Banco CONECTADO');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO BANCO:', erro.message);
  }
}
testarBanco();

// Enviar Mensagem
async function enviarMensagem(telefone, texto) {
  try {
    const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
    
    console.log('📤 Enviando para:', url);
    console.log('📤 Telefone:', telefone);
    
    const resposta = await axios.post(url, {
      number: telefone,
      text: texto
    }, {
      headers: {
        'apikey': process.env.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ MENSAGEM ENVIADA! Status:', resposta.status);
    return true;
  } catch (erro) {
    console.error('❌ ERRO AO ENVIAR:');
    console.error('Status:', erro.response?.status);
    console.error('Detalhe:', erro.response?.data || erro.message);
    return false;
  }
}

// Webhook — CORRIGIDO!
app.post('/api/bot/webhook', async (req, res) => {
  console.log('📥 MENSAGEM CHEGOU! Evento:', req.body?.event);
  console.log('📦 Corpo completo:', JSON.stringify(req.body, null, 2)); // Mostra TUDO que chegou
  
  try {
    const evento = req.body;

    if (evento.event === 'messages.upsert') {
      // 🔑 CORREÇÃO: mensagens vem dentro de "messages" (plural)
      const mensagens = evento.data?.messages || [];
      
      for (const msg of mensagens) {
        if (!msg) continue;
        
        if (msg.fromMe) {
          console.log('↩️ Mensagem do bot — ignorada');
          continue;
        }

        // ✅ Agora pega do lugar CERTO
        const telefone = msg.key?.remoteJid?.replace('@c.us', '');
        const textoRecebido = msg.message?.conversation || msg.text || '';
        
        if (!telefone) {
          console.log('⚠️ Telefone não encontrado!');
          continue;
        }
        
        console.log(`💬 ${telefone}: ${textoRecebido}`);

        const resposta = await bot.processar(telefone, textoRecebido, pool);
        
        if (resposta) {
          await enviarMensagem(telefone, resposta);
        }
      }
    }

    res.sendStatus(200);
  } catch (erro) {
    console.error('❌ ERRO NO WEBHOOK:', erro.message);
    res.sendStatus(500);
  }
});

// Página de teste
app.get('/', (req, res) => {
  res.send('🤖 Bot da Marmitária — ONLINE E FUNCIONANDO!');
});

// Iniciar Servidor
const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`🔗 Webhook: /api/bot/webhook`);
  console.log(`🏪 Instância: ${process.env.EVO_INSTANCE}`);
});
