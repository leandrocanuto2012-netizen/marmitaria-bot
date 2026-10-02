require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚙️ Variáveis
const DATABASE_URL = process.env.DATABASE_URL;
const EVOURL = process.env.EVOURL?.replace(/\/$/, '');
const APIKEY = process.env.APIKEY;
const INSTANCEID = process.env.INSTANCEID;
const WEBHOOKPATH = process.env.WEBHOOKPATH || '/message/marmitaria/webhook';
const PORT = process.env.PORT || 8080;

console.log('========================================');
console.log('🤖 MARMITARIA BOT');
console.log('🆔 INSTANCE_ID:', INSTANCEID || '❌ FALTA');
console.log('🔗 WEBHOOK:', WEBHOOKPATH);
console.log('========================================');

// Banco
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ BANCO CONECTADO');
    c.release();
  } catch (e) {
    console.error('❌ BANCO ERRO:', e.message);
  }
}
testarBanco();

// 🔧 FUNÇÃO: LIMPAR E FORMATAR NÚMERO
function limparTelefone(numero) {
  if (!numero) return null;
  // Remove tudo que não é número
  return numero.toString().replace(/\D/g, '');
}

// 📤 ENVIAR MENSAGEM
async function enviarMensagem(telefone, texto) {
  if (!INSTANCEID) {
    console.error('⛔ INSTANCE_ID NÃO CONFIGURADA!');
    return false;
  }

  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) {
    console.error('⛔ Telefone inválido:', telefone);
    return false;
  }

  try {
    const url = `${EVOURL}/message/sendText/${INSTANCEID}`;
    console.log('📤 ENVIANDO PARA:', numeroLimpo);
    
    const res = await axios.post(url, {
      number: numeroLimpo,
      text: texto
    }, {
      headers: {
        apikey: APIKEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ ENVIADO! Status:', res.status);
    return true;
  } catch (e) {
    console.error('❌ ERRO NO ENVIO:');
    console.error('Status:', e.response?.status);
    console.error('Detalhe:', e.response?.data || e.message);
    return false;
  }
}

// 📥 RECEBER — PEGA TELEFONE DE TODOS OS LUGARES POSSÍVEIS
app.post(WEBHOOKPATH, async (req, res) => {
  const { event, data } = req.body;
  console.log('📥 EVENTO:', event);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg) {
        console.log('⚠️ Sem mensagem');
        return res.sendStatus(200);
      }

      // Ignora mensagens do bot
      if (msg.key?.fromMe) {
        console.log('↩️ Mensagem do bot — ignorada');
        return res.sendStatus(200);
      }

      // 🔍 PEGA O TELEFONE — TENTA TODOS OS CAMINHOS!
      let telefone = null;
      
      // Formato padrão
      if (msg.key?.remoteJid) {
        telefone = limparTelefone(msg.key.remoteJid);
        console.log('📍 De msg.key.remoteJid →', telefone);
      }
      // Formato com lid
      else if (msg.key?.remoteJid?.includes('lid')) {
        telefone = limparTelefone(data?.remoteJid || data?.id || msg.participant);
        console.log('📍 Formato lid detectado →', telefone);
      }
      // Outros caminhos possíveis
      else if (data?.remoteJid) {
        telefone = limparTelefone(data.remoteJid);
        console.log('📍 De data.remoteJid →', telefone);
      }
      else if (msg.participant) {
        telefone = limparTelefone(msg.participant);
        console.log('📍 De msg.participant →', telefone);
      }

      // Extrai o texto
      const texto = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    data?.text || 
                    '';

      console.log(`💬 Telefone: ${telefone} | Mensagem: ${texto.substring(0, 40)}...`);

      if (!telefone || !texto) {
        console.log('⚠️ Falta telefone ou texto');
        return res.sendStatus(200);
      }

      // Processa e responde
      const resposta = await bot.processar(telefone, texto, pool);
      
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      }
    }
    
    // Atualização de status
    else if (event === 'messages.update') {
      console.log('📊 Atualização de status');
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    res.sendStatus(200);
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h2>🤖 Marmitária Bot — ONLINE</h2>
    <p>🆔 Instância: ${INSTANCEID || '❌ FALTA'}</p>
    <p>🔗 Webhook: ${WEBHOOKPATH}</p>
    <p>✅ Pronto para capturar telefone de qualquer formato</p>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Rodando na porta ${PORT}`);
  console.log(`🔗 Aguardando em: ${WEBHOOKPATH}`);
});
