// ==========================================
// BOT — LÓGICA DE CONVERSA (edite só aqui!)
// ==========================================

module.exports = {
  // Função que decide o que responder
  async responder(numero, texto) {
    // Normaliza o texto
    const t = texto.trim().toLowerCase();

    // 🔹 Saudação
    if (!t || ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(t)) {
      return `Olá! Tudo bem? 😊

Sou o atendimento da Marmitaria!

Digite:
✅ *Cardápio* — ver opções
✅ *Retirada* — buscar no balcão
✅ *Entrega* — receber em casa
✅ *Fiado* — usar conta`;
    }

    // 🔹 Cardápio
    if (t.includes('cardápio') || t.includes('cardapio') || t === '1') {
      return `📋 *CARDÁPIO*

🍽️ Marmita Pq — R$ 18,00
🍽️ Marmita Md — R$ 22,00
🍽️ Marmita Gr — R$ 26,00
🍽️ Marmita Fit — R$ 24,00
🥤 Suco — R$ 5,00
🥤 Refri — R$ 4,50
💧 Água — R$ 3,00
🍮 Pudim — R$ 7,00

Diga o que deseja!`;
    }

    // 🔹 Retirada
    if (t.includes('retirada')) {
      return `Perfeito! ✅

Retirada no balcão.
Segunda a Sexta — 11h às 14h

Pode vir buscar!`;
    }

    // 🔹 Entrega
    if (t.includes('entrega')) {
      return `Certo! 🚚

Tempo estimado: 40 a 60 minutos.
Avisa quando chegar!`;
    }

    // 🔹 Fiado
    if (t.includes('fiado') || t.includes('crédito')) {
      return `Conta fiada liberada! ✅

Pode pedir normalmente!
Avisaremos quando atingir o limite.`;
    }

    // 🔹 Resposta padrão
    return `Entendi! 😊

Digite:
✅ *Cardápio* — ver opções
✅ *Retirada* — buscar no balcão
✅ *Entrega* — receber em casa
✅ *Fiado* — usar conta`;
  }
};
