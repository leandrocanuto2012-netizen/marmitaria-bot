const cardapio = `
🍽️ *CARDÁPIO DO DIA*
━━━━━━━━━━━━━━━━━━━━
🥗 Salada Completa — R$ 12,00
🍖 Carne de Sol com Arroz — R$ 25,00
🐔 Frango Grelhado — R$ 22,00
🍝 Macarrão ao Molho — R$ 18,00
🥩 Feijoada Completa — R$ 28,00
🧃 Suco Natural — R$ 6,00
🥤 Refrigerante — R$ 5,00
━━━━━━━━━━━━━━━━━━━━
📲 Diga o nome do prato + quantidade para pedir!
💳 Aceitamos: Pix, Dinheiro, Cartão
🏠 Retirada no balcão
`;

async function processar(telefone, mensagem, pool) {
  const msg = mensagem.toLowerCase().trim();

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(msg)) {
    return `Olá! Seja bem-vindo(a) à Marmitária! 😊\n\n${cardapio}`;
  }

  if (['cardápio', 'cardapio', 'menu', 'opções', 'preço', 'precos'].includes(msg)) {
    return cardapio;
  }

  if (['horário', 'horario', 'funcionamento', 'abre', 'aberto'].includes(msg)) {
    return '🕒 Funcionamos de Segunda a Sábado, das 10h às 14h.\nRetirada no balcão!';
  }

  if (['fiado', 'crédito', 'credito', 'conta'].includes(msg)) {
    return '📋 Temos sistema de fiado sim!\nProcure o atendente no balcão para cadastrar. ✅';
  }

  if (['ifood', 'i-food', 'entrega'].includes(msg)) {
    return '🚀 Estamos no iFood também!\nOu retire direto aqui na loja — mais rápido e sem taxa de entrega! 📦';
  }

  if (['ajuda', 'comandos'].includes(msg)) {
    return `Comandos que eu entendo:\n\n📋 "Cardápio" — ver opções\n🕒 "Horário" — funcionamento\n💰 "Fiado" — crédito\n📦 "iFood" — entrega\n\nÉ só falar! 😊`;
  }

  return `Desculpa, não entendi! 😅\n\nDiga "Cardápio" para ver nossas opções ou "Ajuda" para saber o que eu posso fazer!`;
}

module.exports = { processar };
