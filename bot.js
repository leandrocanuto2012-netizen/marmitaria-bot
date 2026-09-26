const axios = require('axios');

// 🔔 NÚMERO DO ADMIN QUE RECEBE OS PEDIDOS
const ADMIN_WHATSAPP = '5541996955993'; // ← COLOQUE SEU NÚMERO AQUI!

module.exports.init = function(app, pool) {

  // === Enviar mensagem ===
  async function enviarWhatsApp(numero, mensagem) {
    try {
      await axios.post(
        `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`,
        { number: numero, text: mensagem },
        { headers: { apikey: process.env.EVO_KEY } }
      );
      console.log(`✅ Mensagem enviada para ${numero}`);
      return true;
    } catch (erro) {
      console.error('❌ Erro ao enviar:', erro.response?.data || erro.message);
      return false;
    }
  }

  // === 🔔 AVISAR ADMIN DE NOVO PEDIDO ===
  module.exports.avisarPedidoNoWhatsApp = async function(pedido, itens) {
    const listaItens = itens.map(i => 
      `• ${i.quantity}x ${i.name} — R$ ${(i.quantity * i.unit_price).toFixed(2).replace('.', ',')}`
    ).join('\n');

    const mensagemAdmin = `
📢 *NOVO PEDIDO RECEBIDO!* 🎉

━━━━━━━━━━━━━━━━━━━━
👤 *Cliente:* ${pedido.customer_name}
📱 *Telefone:* ${pedido.customer_phone}
📍 *Endereço:* ${pedido.customer_address || 'Retirada no local'}

📋 *Itens do Pedido:*
${listaItens}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL:* R$ ${pedido.total_amount.toFixed(2).replace('.', ',')}
💳 *Pagamento:* ${pedido.payment_method || 'Não informado'}
📝 *Observações:* ${pedido.observacoes || 'Nenhuma'}
━━━━━━━━━━━━━━━━━━━━
✅ *Status:* Aguardando confirmação
    `.trim();

    // Avisa o ADMIN
    await enviarWhatsApp(ADMIN_WHATSAPP, mensagemAdmin);

    // Confirma para o cliente
    const mensagemCliente = `
✅ *PEDIDO CONFIRMADO!* 🎉

Olá ${pedido.customer_name}! Recebemos seu pedido e já estamos preparando tudo com muito carinho! 🍽️

📋 *Resumo do seu pedido:*
${listaItens}

💰 *Total:* R$ ${pedido.total_amount.toFixed(2).replace('.', ',')}
💳 *Pagamento:* ${pedido.payment_method || 'A combinar'}

Obrigado pela preferência! 💛
    `.trim();

    await enviarWhatsApp(pedido.customer_phone, mensagemCliente);
  };

  // === Webhook — Responder mensagens ===
  app.post('/api/bot/webhook', async (req, res) => {
    console.log('📥 === EVENTO RECEBIDO ===');
    console.log('Tipo:', req.body.event);

    const evento = req.body;
    
    // Ignorar eventos que não são mensagens
    if (evento.event !== 'message.upsert' && evento.event !== 'message') {
      console.log('⚠️ Evento ignorado:', evento.event);
      return res.json({ ok: true });
    }

    const dados = evento.data || {};
    const remetente = dados.key?.remoteJid || dados.remoteJid;
    
    if (!remetente || remetente.includes('@g.us')) {
      return res.json({ ok: true });
    }

    const telefone = remetente.replace('@s.whatsapp.net', '');
    const mensagem = dados.message || {};
    const textoRecebido = 
      mensagem.conversation ||
      mensagem.extendedTextMessage?.text ||
      '';

    console.log(`📱 ${telefone}: "${textoRecebido}"`);

    // === RESPOSTAS AUTOMÁTICAS ===
    const texto = textoRecebido.toLowerCase().trim();
    let resposta = '';

    if (/^(olá|ola|oi|bom dia|boa tarde|boa noite|opa)/i.test(texto)) {
      resposta = `Olá! 👋 Tudo bem? Seja muito bem-vindo(a)! 🎉

Acesse nosso cardápio e faça seu pedido:
🔗 https://marmitaria-bot-1.onrender.com/cardapio.html

Ou me diga o que deseja! 😊`;
    } 
    else if (/^(cardapio|cardápio|menu|pedido|preços)/i.test(texto)) {
      resposta = `🍽️ Nosso Cardápio:
🔗 https://marmitaria-bot-1.onrender.com/cardapio.html

Escolha seus pratos e finalize por lá! É rápido e prático! 😋`;
    }
    else if (/^(horário|horario|funciona|aberto)/i.test(texto)) {
      resposta = `🕒 Funcionamento:
Segunda a Sexta: 11h às 14h / 18h às 22h
Sábado: 11h às 15h
Domingo: Fechado

Estamos te esperando! 💛`;
    }
    else if (texto) {
      resposta = `Recebi sua mensagem! ✅
Estou processando... Em breve te respondo! 😊

Ou faça seu pedido direto:
🔗 https://marmitaria-bot-1.onrender.com/cardapio.html`;
    }

    if (resposta) {
      await enviarWhatsApp(telefone, resposta);
      console.log('✅ Resposta enviada!');
    }

    res.json({ ok: true });
  });

  console.log('🤖 Bot pronto — escutando mensagens!');
};
