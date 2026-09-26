// Depois de receber o pedido no servidor, envie:
async function avisarNovoPedido(pedido, itens) {
  const texto = `
📢 *NOVO PEDIDO RECEBIDO!*

👤 Cliente: ${pedido.customer_name}
📱 Telefone: ${pedido.customer_phone}
📍 Endereço: ${pedido.customer_address || 'Retirada'}

📋 Itens:
${itens.map(i => `• ${i.quantity}x ${i.name} — R$ ${(i.quantity * i.unit_price).toFixed(2)}`).join('\n')}

💰 *TOTAL: R$ ${pedido.total_amount.toFixed(2)}*
💳 Pagamento: ${pedido.payment_method || 'Não informado'}
📝 Obs: ${pedido.observacoes || 'Nenhuma'}
  `.trim();

  // Enviar para o número do admin
  await axios.post(
    `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`,
    { number: 'SEU-NUMERO-AQUI-COM-DDD', text: texto },
    { headers: { apikey: process.env.EVO_KEY } }
  );
}
