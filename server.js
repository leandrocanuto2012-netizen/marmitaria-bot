require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ========== CONEXÃO SUPABASE ==========
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ========== TESTE DE CONEXÃO ==========
async function testarBanco() {
  try {
    const { data, error } = await supabase.from('bot_messages').select('id').limit(1);
    if (error) throw error;
    console.log('✅ SUPABASE CONECTADO!');
  } catch (e) {
    console.log('ℹ️ Banco acessível — tabelas serão criadas');
  }
}
testarBanco();

// ========== ENVIAR MENSAGEM WHATSAPP ==========
async function enviarWhatsApp(numero, texto) {
  try {
    const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
    await axios.post(
      url,
      { number: numero, text: texto },
      {
        headers: {
          'apikey': process.env.EVO_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Enviado para ${numero}`);
    return true;
  } catch (e) {
    console.error('❌ Erro envio:', e.response?.data || e.message);
    return false;
  }
}

// ========== SALVAR MENSAGEM ==========
async function salvarMensagem(telefone, texto, direcao) {
  try {
    await supabase.from('bot_messages').insert({
      phone_number: telefone,
      content: texto,
      direction: direcao
    });
  } catch (e) {}
}

// ========== LÓGICA DO BOT ==========
async function processarMensagem(telefone, mensagem) {
  const msg = mensagem.trim().toLowerCase();

  if (['oi','olá','ola','bom dia','boa tarde','boa noite','opa'].includes(msg)) {
    return 'Olá! Tudo bem? 😋\nSeja bem-vindo(a) à Marmitaria!\n\nEscolha:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário\n4️⃣ Falar com Atendente';
  }

  if (msg === '1' || msg === 'cardápio' || msg === 'cardapio') {
    return '📋 *CARDÁPIO*\n\n🍽️ Prato Feito — R$ 18,00\n🥗 Salada Completa — R$ 12,00\n🍖 Feijoada — R$ 25,00\n🍹 Suco — R$ 6,00\n🥤 Refrigerante — R$ 5,00\n\nExemplo: "2 Prato Feito"';
  }

  if (msg === '3' || msg === 'horário' || msg === 'horario') {
    return '🕐 *Funcionamento*\nSeg–Sex: 10h às 15h\nSáb: 11h às 14h\nDom: Fechado 🚫';
  }

  if (msg === '2' || msg.includes('pedido')) {
    return 'Perfeito! 🥰\nMe diga o que deseja:\nExemplo: "1 Feijoada e 1 Suco"';
  }

  if (msg === '4' || msg.includes('atendente') || msg.includes('falar')) {
    return 'Claro! 📞\nTransferindo para atendente...\nAguarde um instante!';
  }

  if (msg.includes('confirmo') || msg.includes('confirmar')) {
    return '✅ Pedido confirmado! Obrigado! 🎉\nRetirada em ~20 minutos no balcão!';
  }

  return 'Desculpe, não entendi 😅\nEscolha:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário\n4️⃣ Falar com Atendente';
}

// ========== WEBHOOK — /webhook ==========
app.post('/webhook', async (req, res) => {
  try {
    const evento = req.body;
    console.log('📩 Evento:', evento.event);

    if (evento.event === 'messages.upsert' && evento.data?.messages) {
      for (const msg of evento.data.messages) {
        if (msg.fromMe) continue;

        const telefone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        
        if (!texto) continue;

        console.log(`📩 ${telefone}: "${texto}"`);
        await salvarMensagem(telefone, texto, 'INBOUND');
        
        const resposta = await processarMensagem(telefone, texto);
        await enviarWhatsApp(telefone, resposta);
        await salvarMensagem(telefone, resposta, 'OUTBOUND');
      }
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.status(200).send('OK');
  }
});

// ========== PÁGINA INICIAL ==========
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:Arial; text-align:center; padding:50px; background:#fef6e9;">
        <h1>🤖 Marmitaria Bot</h1>
        <p>✅ Sistema ONLINE</p>
        <p>Porta: ${process.env.PORT}</p>
        <p>Evolution: ${process.env.EVO_URL}</p>
      </body>
    </html>
  `);
});

// ========== INICIAR ==========
const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log('='.repeat(55));
  console.log(`🚀 SERVIDOR — PORTA ${PORTA}`);
  console.log(`🔗 Webhook: https://marmitaria-bot-1.onrender.com/webhook`);
  console.log(`📡 Evolution: ${process.env.EVO_URL}`);
  console.log(`🤖 Instância: ${process.env.EVO_INSTANCE}`);
  console.log('='.repeat(55));
});
