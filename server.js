require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const app = express();

// =============================================
// MIDDLEWARE DE PARSING — DEVE VIR PRIMEIRO!
// =============================================
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(express.static('public'));

// =============================================
// LOG COMPLETO — VAMOS VER TUDO QUE CHEGA
// =============================================
app.use((req, res, next) => {
  console.log('========================================');
  console.log(`📥 ${req.method} ${req.path}`);
  console.log('📦 CORPO DA REQUISIÇÃO:', JSON.stringify(req.body, null, 2));
  console.log('📋 HEADERS:', JSON.stringify(req.headers, null, 2));
  next();
});

// =============================================
// BANCO DE DADOS — SUPABASE
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO DE DADOS:', erro.message);
  }
}

testarBanco();

// =============================================
// EVOLUTION API — CONFIGURAÇÃO
// =============================================
const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🔍 VARIÁVEIS CARREGADAS:');
console.log('🔗 EVO_URL:', EVO_URL || '❌ FALTA');
console.log('🔑 EVO_KEY:', EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('📦 EVO_INSTANCE:', EVO_INSTANCE);
console.log('🚀 NA PORTA:', process.env.PORT || 10000);

// =============================================
// ENVIAR MENSAGEM — WHATSAPP
// =============================================
async function enviarMensagem(telefone, texto) {
  try {
    const resposta = await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      {
        number: telefone,
        text: texto
      },
      {
        headers: { apikey: EVO_KEY },
        timeout: 15000
      }
    );
    console.log(`✅ MENSAGEM ENVIADA PARA: ${telefone}`);
    return resposta.data;
  } catch (erro) {
    console.error('❌ ERRO AO ENVIAR MENSAGEM:', erro.response?.data || erro.message);
  }
}

// =============================================
// EXTRAIR TEXTO — DE TODOS OS LUGARES POSSÍVEIS
// =============================================
function extrairTextoMensagem(mensagem) {
  if (!mensagem || !mensagem.message) {
    console.log('⚠️ Objeto mensagem vazio ou sem campo message');
    return 'SEM_TEXTO';
  }

  const texto =
    mensagem.message.conversation ||
    mensagem.message.extendedTextMessage?.text ||
    mensagem.message.surfaceMessage?.body ||
    mensagem.message.imageMessage?.caption ||
    mensagem.message.videoMessage?.caption ||
    mensagem.message.documentMessage?.caption ||
    Object.values(mensagem.message)[0]?.text ||
    'NAO_CONSEGUIU_LER';

  console.log(`📝 TEXTO EXTRAÍDO: "${texto}"`);
  return texto;
}

// =============================================
// PROCESSAR E RESPONDER
// =============================================
async function processarMensagem(telefone, texto) {
  const textoLimpo = String(texto).trim().toLowerCase();
  console.log(`💬 PROCESSANDO → "${textoLimpo}" de ${telefone}`);

  if (!textoLimpo || textoLimpo === 'sem_texto' || textoLimpo === 'nao_conseguiu_ler') {
    await enviarMensagem(telefone, 'Recebi sua mensagem! ✅ Pode digitar *cardápio* para ver nossas opções?');
    return;
  }

  // Saudação
  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(textoLimpo)) {
    await enviarMensagem(telefone,
      'Olá! Tudo bem? 😋\n\n' +
      'Seja bem-vindo(a) à nossa Marmitaria!\n' +
      'Digite *cardápio* para ver nossos pratos.'
    );
  }
  // Cardápio
  else if (['cardápio', 'cardapio', 'menu', '1'].includes(textoLimpo)) {
    await enviarMensagem(telefone,
      '🍽️ *NOSSO CARDÁPIO* 🍽️\n\n' +
      '1️⃣ Marmita Pequena — R$ 15,00\n' +
      '2️⃣ Marmita Média — R$ 18,00\n' +
      '3️⃣ Marmita Grande — R$ 22,00\n' +
      '4️⃣ Verificar Fiado\n' +
      '0️⃣ Falar com Atendente\n\n' +
      'Digite o número ou nome do item!'
    );
  }
  // Fiado
  else if (['fiado', '4', 'saldo', 'conta'].includes(textoLimpo)) {
    await enviarMensagem(telefone, 'Vou verificar seu saldo... um momento! 🔄');
  }
  // Atendente
  else if (['0', 'atendente', 'falar', 'humano'].includes(textoLimpo)) {
    await enviarMensagem(telefone, 'Certo! Estou transferindo para um atendente... 📞');
  }
  // Resposta padrão
  else {
    await enviarMensagem(telefone,
      `Recebi: "${texto}" ✅\n\n` +
      'Digite *cardápio* para ver nossas opções!'
    );
  }
}

// =============================================
// WEBHOOK — PONTO DE ENTRADA (VERSÃO CORRIGIDA)
// =============================================
app.post('/api/bot/webhook', async (req, res) => {
  // Responde RÁPIDO para não dar timeout ⚡
  res.status(200).json({ ok: true, recebido: true });

  try {
    console.log('\n🔍 ANALISANDO WEBHOOK RECEBIDO...');
    console.log('RAW BODY:', JSON.stringify(req.body, null, 2));

    const { event, data } = req.body;

    console.log('📩 EVENTO:', event);
    console.log('📦 DATA:', JSON.stringify(data, null, 2));

    // Suporta múltiplos formatos possíveis
    if (event === 'messages.upsert') {
      let mensagem = null;

      // Tenta vários caminhos possíveis
      if (data?.messages?.[0]) {
        mensagem = data.messages[0];
        console.log('✅ Mensagem encontrada em: data.messages[0]');
      } else if (data?.message) {
        mensagem = data.message;
        console.log('✅ Mensagem encontrada em: data.message');
      } else if (req.body?.messages?.[0]) {
        mensagem = req.body.messages[0];
        console.log('✅ Mensagem encontrada em: req.body.messages[0]');
      } else {
        console.log('❌ ERRO: Nenhuma mensagem encontrada em nenhum caminho esperado');
        console.log('Estrutura recebida:', Object.keys(data || {}));
        return;
      }

      console.log('📨 MENSAGEM COMPLETA:', JSON.stringify(mensagem, null, 2));

      // Verifica se é mensagem enviada pelo bot
      if (mensagem.fromMe) {
        console.log('↩️ Ignorando — mensagem enviada pelo próprio bot');
        return;
      }

      // Extrai telefone
      const telefone = mensagem.key?.remoteJid?.replace('@s.whatsapp.net', '');
      console.log('📞 TELEFONE IDENTIFICADO:', telefone);

      if (!telefone) {
        console.log('❌ ERRO: Telefone não identificado em:', mensagem.key);
        return;
      }

      // Extrai texto
      const texto = extrairTextoMensagem(mensagem);

      // Processa a mensagem
      if (texto) {
        await processarMensagem(telefone, texto);
      }
    } else {
      console.log(`⚠️ Evento não suportado: ${event}`);
    }

  } catch (erro) {
    console.error('❌ ERRO NO PROCESSAMENTO:', erro.message);
    console.error('Stack:', erro.stack);
  }

  console.log('========================================\n');
});

// =============================================
// PÁGINA DE TESTE
// =============================================
app.get('/', (req, res) => {
  res.send('🚀 Marmitaria Bot — ONLINE E FUNCIONANDO! ✅');
});

// =============================================
// INICIAR SERVIDOR
// =============================================
const PORTA = process.env.PORT || 10000;
app.listen(PORTA, () => {
  console.log('========================================');
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`🔗 WEBHOOK: /api/bot/webhook`);
  console.log('📍 URL PÚBLICA: https://marmitaria-bot-production.up.railway.app');
  console.log('========================================');
});
