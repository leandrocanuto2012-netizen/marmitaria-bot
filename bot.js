// ========== LÓGICA DO BOT — bot.js ==========

function processarMensagem(telefone, mensagem) {
  const msg = mensagem.trim().toLowerCase();

  // Saudação
  if (['oi','olá','ola','bom dia','boa tarde','boa noite','opa'].includes(msg)) {
    return 'Olá! Tudo bem? 😋\nSeja bem-vindo(a) à Marmitaria!\n\nEscolha uma opção:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário de Funcionamento\n4️⃣ Falar com Atendente';
  }

  // Cardápio
  if (msg === '1' || msg === 'cardápio' || msg === 'cardapio') {
    return '📋 *CARDÁPIO*\n\n🍽️ Prato Feito — R$ 18,00\n🥗 Salada Completa — R$ 12,00\n🍖 Feijoada — R$ 25,00\n🍹 Suco Natural — R$ 6,00\n🥤 Refrigerante — R$ 5,00\n\nDigite o nome do prato + quantidade.';
  }

  // Horário
  if (msg === '3' || msg === 'horário' || msg === 'horario') {
    return '🕐 *Funcionamento*\nSegunda a Sexta: 10h às 15h\nSábado: 11h às 14h\nDomingo: Fechado 🚫';
  }

  // Fazer Pedido
  if (msg === '2' || msg.includes('pedido')) {
    return 'Perfeito! 🥰\nMe diga o que deseja:\nExemplo: "1 Feijoada e 1 Suco"';
  }

  // Falar com Atendente
  if (msg === '4' || msg.includes('atendente') || msg.includes('falar')) {
    return 'Claro! 📞\nTransferindo para um atendente...\nAguarde um instante!';
  }

  // Confirmar
  if (msg.includes('confirmo') || msg.includes('confirmar')) {
    return '✅ Pedido confirmado! Obrigado! 🎉\nRetirada em ~20 minutos no balcão!';
  }

  // Padrão
  return 'Desculpe, não entendi 😅\nEscolha:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário\n4️⃣ Falar com Atendente';
}

module.exports = { processarMensagem };
