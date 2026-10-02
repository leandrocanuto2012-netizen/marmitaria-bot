require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Banco de Dados
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

// Enviar Mensagem — escolhe automaticamente qual usar
async function enviarMensagem(telefone, texto) {
  try {
    // Se tiver ID, usa ele; senão usa o nome
    const instancia = process.env.EVO_INSTANCE_ID || process.env.EVO_INSTANCE_NOME;
    
    if (!instancia) {
      console.error('❌ Nenhuma instância configurada!');
      return false;
    }

    const url = `${process.env.EVO_URL}/message/sendText/${instancia}`;
    
    console.log('📤 --- ENVIANDO ---');
    console.log('📤 Usando:', instancia);
    console.log('📤 Fonte:', process.env.EVO_INSTANCE_ID ? 'ID' : 'Nome');
    console.log('📤 URL:', url);
    
    const resposta = await axios.post(url, {
      number: telefone,
      text: texto
    }, {
      headers: {
        'apikey': process.env.EVO_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ ENVIADO! Status:', resposta.status);
    return true;
  } catch (erro) {
    console.error('❌ ERRO:');
    console.error('Status:', erro.response?.status);
    console.error('Detalhe:', erro.response?.data || erro.message);
    return false;
  }
}

// Webhook
app.post('/marmitaria/webhook', async (req, res) => {
  console.log('📥 MENSAGEM CHEGOU!');
  
  try {
    const evento = req.body;

    if (evento.event === 'messages.upsert') {
      const msg = evento.data?.message;
      
      if (!msg || msg.key?.fromMe) {
        return res.sendStatus(200);
      }

      const telefone = msg.key?.remoteJid?.replace('@c.us', '');
      const texto = msg.message?.conversation || msg.text || '';
      
      if (!telefone) return res.sendStatus(200);
      
      console.log(`💬 ${telefone}: ${texto}`);

      const resposta = await bot.processar(telefone, texto, pool);
      
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      }
    }

    res.sendStatus(200);
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  const instancia = process.env.EVO_INSTANCE_ID || process.env.EVO_INSTANCE_NOME;
  res.send(`🤖 Bot da Marmitária — ONLINE!<br>Usando: ${instancia}`);
});

const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  const instancia = process.env.EVO_INSTANCE_ID || process.env.EVO_INSTANCE_NOME;
  console.log(`🚀 SERVIDOR NA PORTA ${PORTA}`);
  console.log(`🏪 Instância: ${instancia}`);
  console.log(`🔗 Webhook: /marmitaria/webhook`);
});
