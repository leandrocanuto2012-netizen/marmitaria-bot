module.exports.processar = async function(telefone, texto, pool) {
  const msg = texto.toLowerCase().trim();

  // Cardápio
  if (msg.includes('cardapio') || msg.includes('menu') || msg.includes('preço')) {
    const { rows } = await pool.query('SELECT nome, preco FROM produtos WHERE ativo = true ORDER BY categoria, nome');
    let resposta = '📋 *Nosso Cardápio:*\n\n';
    rows.forEach(p => {
      resposta += `🍽️ ${p.nome} — R$ ${p.preco.toFixed(2)}\n`;
    });
    resposta += '\nPara pedir, acesse: seusite.com/pedido.html \nOu diga "pedir"!';
    return resposta;
  }

  // Saudação
  if (msg.match(/^(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem)/)) {
    return 'Olá! 😊 Seja bem-vindo(a)! Digite *cardápio* para ver nossos pratos ou *pedir* para fazer seu pedido.';
  }

  // Fazer pedido
  if (msg.includes('pedir') || msg.includes('pedido')) {
    return 'Perfeito! 🥘 Acesse nosso cardápio e faça seu pedido direto:\n\n👉 seusite.com/pedido.html\n\nEscolha os pratos, confirme e já preparamos!';
  }

  // Horário
  if (msg.includes('horário') || msg.includes('funciona')) {
    return '🕒 Funcionamos de Segunda a Sábado, das 11h às 14h e das 18h às 21h!';
  }

  // Ajuda
  if (msg.includes('ajuda') || msg === 'ajuda') {
    return 'Comandos disponíveis:\n📋 *Cardápio* — ver pratos\n🛒 *Pedir* — fazer pedido\n🕒 *Horário* — horário de atendimento\n💬 Fale com o atendente a qualquer momento!';
  }

  return null; // Deixa sem resposta se não entender
};
