require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ⚙️ CONFIGURAÇÃO
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  EVO_URL: (process.env.EVO_URL || '').replace(/\/$/, ''),
  EVO_KEY: process.env.EVO_KEY,
  INSTANCE_NAME: process.env.EVO_INSTANCE || 'marmitaria',
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/message/marmitaria/webhook',
  PORT: process.env.PORT || 8080
};

console.log('========================================');
console.log('🍽️ MARMITARIA SISTEMA — INICIANDO');
console.log('🗄️ Banco:', CONFIG.DATABASE_URL?.replace(/:.*@/, ':***@'));
console.log('🏪 Instância:', CONFIG.INSTANCE_NAME);
console.log('🔗 Webhook:', CONFIG.WEBHOOK_PATH);
console.log('🚀 Porta:', CONFIG.PORT);
console.log('========================================');

// 🗄️ CONEXÃO BANCO
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Teste de conexão
async function testarBanco() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ Banco conectado!', res.rows[0].now);
    client.release();
  } catch (e) {
    console.error('❌ ERRO BANCO:', e.message);
  }
}
testarBanco();

// 🧹 UTILITÁRIOS
function limparTelefone(numero) {
  if (!numero) return null;
  return numero.toString().replace(/\D/g, '');
}

// 📤 ENVIAR MENSAGEM WHATSAPP
async function enviarMensagem(telefone, texto) {
  if (!CONFIG.EVO_URL || !CONFIG.EVO_KEY) {
    console.log('⚠️ Evolution API não configurada');
    return false;
  }
  
  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) return false;

  try {
    await axios.post(
      `${CONFIG.EVO_URL}/message/sendText/${CONFIG.INSTANCE_NAME}`,
      { number: numeroLimpo, text: texto },
      { headers: { apikey: CONFIG.EVO_KEY, 'Content-Type': 'application/json' } }
    );
    
    await pool.query(
      'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
      [numeroLimpo, texto, 'bot']
    );
    return true;
  } catch (e) {
    console.error('❌ Erro envio WhatsApp:', e.response?.data || e.message);
    return false;
  }
}

// 🤖 LÓGICA DO BOT
async function processarMensagem(telefone, texto) {
  const msg = texto.toLowerCase().trim();

  // Cardápio
  if (msg.includes('cardápio') || msg.includes('cardapio') || msg.includes('menu') || msg.includes('preço') || msg.includes('preco')) {
    try {
      const { rows } = await pool.query('SELECT nome, preco FROM produtos WHERE ativo = true ORDER BY categoria, nome');
      let resposta = '📋 *Nosso Cardápio:*\n\n';
      rows.forEach(p => {
        resposta += `🍽️ ${p.nome} — R$ ${parseFloat(p.preco).toFixed(2)}\n`;
      });
      resposta += '\n👉 Acesse e peça: ' + (process.env.SITE_URL || 'seusite.com') + '/cardapio.html';
      return resposta;
    } catch (e) {
      return 'Desculpe, não consegui carregar o cardápio no momento. Tente novamente mais tarde.';
    }
  }

  // Saudação
  if (msg.match(/^(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|opa|e ai|e aí)/)) {
    return 'Olá! 😊 Seja bem-vindo(a) à Marmitária!\n\nDigite:\n📋 *Cardápio* — ver pratos\n🛒 *Pedir* — fazer pedido\n🕒 *Horário* — horário de atendimento\n💬 *Atendente* — falar com alguém';
  }

  // Fazer pedido
  if (msg.includes('pedir') || msg.includes('pedido') || msg.includes('comprar')) {
    return 'Perfeito! 🥘\n\nFaça seu pedido pelo nosso cardápio online:\n👉 ' + (process.env.SITE_URL || 'seusite.com') + '/cardapio.html\n\nEscolha os pratos, confirme e já preparamos!';
  }

  // Horário
  if (msg.includes('horário') || msg.includes('horario') || msg.includes('funciona') || msg.includes('aberto')) {
    return '🕒 *Horário de Atendimento:*\n\nSegunda a Sexta: 11h às 14h e 18h às 21h\nSábado: 11h às 15h\nDomingo: Fechado\n\nAgradecemos a preferência! 🙏';
  }

  // Atendente
  if (msg.includes('atendente') || msg.includes('falar') || msg.includes('humano') || msg.includes('pessoa')) {
    return '✅ Tudo bem! Em breve um atendente vai falar com você.\n\nEnquanto isso, já pode fazer seu pedido aqui: ' + (process.env.SITE_URL || 'seusite.com') + '/cardapio.html';
  }

  // Ajuda
  if (msg === 'ajuda' || msg === 'comandos' || msg === 'opções') {
    return 'Comandos disponíveis:\n📋 *Cardápio* — ver pratos\n🛒 *Pedir* — fazer pedido\n🕒 *Horário* — horário de atendimento\n💬 *Atendente* — falar com pessoa\n\nOu é só mandar sua mensagem!';
  }

  return null;
}

// 📥 WEBHOOK — RECEBER MENSAGENS
app.post(CONFIG.WEBHOOK_PATH, async (req, res) => {
  const { event, data } = req.body;
  console.log('📥 Evento recebido:', event);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg || msg.key?.fromMe) return res.sendStatus(200);

      const telefone = limparTelefone(
        msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || 
        data?.remoteJid?.replace('@s.whatsapp.net', '') ||
        msg.participant?.replace('@s.whatsapp.net', '')
      );
      const texto = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    data?.text || '';

      if (!telefone || !texto) return res.sendStatus(200);

      console.log(`💬 ${telefone}: ${texto.substring(0, 80)}`);

      // Salvar mensagem
      await pool.query(
        'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
        [telefone, texto, 'cliente']
      );

      // Processar e responder
      const resposta = await processarMensagem(telefone, texto);
      if (resposta) {
        await enviarMensagem(telefone, resposta);
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Erro no webhook:', e.message);
    res.sendStatus(200);
  }
});

// ===== API — PRODUTOS =====

// Listar produtos ativos
app.get('/api/produtos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM produtos WHERE ativo = true ORDER BY categoria, nome'
    );
    res.json(rows);
  } catch (e) {
    console.error('Erro listar produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});

// Cadastrar produto
app.post('/api/produtos', async (req, res) => {
  const { nome, descricao, preco, categoria, estoque_atual } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO produtos (nome, descricao, preco, categoria, estoque_atual)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome, descricao || null, preco, categoria || null, estoque_atual || 0]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Ajustar estoque
app.patch('/api/produtos/:id/estoque', async (req, res) => {
  const { id } = req.params;
  const { quantidade } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE produtos 
       SET estoque_atual = estoque_atual + $1 
       WHERE id = $2 RETURNING estoque_atual, nome`,
      [quantidade, id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ 
      sucesso: true, 
      produto: rows[0].nome,
      novo_estoque: rows[0].estoque_atual 
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ===== API — PEDIDOS =====

// Criar pedido
app.post('/api/pedidos', async (req, res) => {
  const { telefone, nome, itens, tipo, observacao } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Calcular valor total
    let valorTotal = 0;
    for (const item of itens) {
      const { rows } = await client.query(
        'SELECT preco, estoque_atual FROM produtos WHERE id = $1',
        [item.produto_id]
      );
      if (!rows.length) throw new Error(`Produto ${item.produto_id} não encontrado`);
      if (rows[0].estoque_atual < item.quantidade) {
        throw new Error(`Estoque insuficiente para o produto: ${item.produto_id}`);
      }
      valorTotal += rows[0].preco * item.quantidade;
    }

    // Inserir pedido
    const pedidoResult = await client.query(
      `INSERT INTO pedidos 
       (telefone_cliente, nome_cliente, valor_total, tipo, observacao)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, valor_total, created_at`,
      [limparTelefone(telefone), nome, valorTotal, tipo, observacao]
    );
    const pedidoId = pedidoResult.rows[0].id;

    // Inserir itens e baixar estoque
    for (const item of itens) {
      const { rows } = await client.query(
        'SELECT preco FROM produtos WHERE id = $1',
        [item.produto_id]
      );
      await client.query(
        `INSERT INTO pedido_itens 
         (pedido_id, produto_id, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, item.produto_id, item.quantidade, rows[0].preco]
      );
      await client.query(
        `UPDATE produtos 
         SET estoque_atual = estoque_atual - $1 
         WHERE id = $2`,
        [item.quantidade, item.produto_id]
      );
    }

    await client.query('COMMIT');

    // Avisar cliente no WhatsApp
    await enviarMensagem(
      telefone,
      `✅ Pedido recebido!\n\nPedido #${pedidoId}\nCliente: ${nome}\nValor: R$ ${valorTotal.toFixed(2)}\n\nEm breve estará pronto! 🥘`
    );

    res.json({ sucesso: true, pedidoId, valorTotal });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// Listar pedidos
app.get('/api/pedidos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Atualizar status do pedido
app.patch('/api/pedidos/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const pedidoResult = await pool.query(
      'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (!pedidoResult.rows.length) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pedido = pedidoResult.rows[0];

    // Avisar cliente no WhatsApp
    if (pedido.telefone_cliente) {
      let mensagem;
      switch (status) {
        case 'preparando':
          mensagem = `🔥 Pedido #${id} — Já estamos preparando! Em breve fica pronto!`;
          break;
        case 'pronto':
          mensagem = `✅ Pedido #${id} está PRONTO! Pode retirar! 🍽️`;
          break;
        case 'entregue':
          mensagem = `✅ Pedido #${id} entregue! Obrigado pela preferência! 🙏`;
          break;
        default:
          mensagem = `📦 Pedido #${id}: ${status}`;
      }
      await enviarMensagem(pedido.telefone_cliente, mensagem);
    }

    res.json(pedido);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ===== API — CAIXA =====

// Abrir caixa
app.post('/api/caixa/abrir', async (req, res) => {
  const { operador, saldoInicial } = req.body;
  try {
    // Fechar caixa anterior se aberto
    await pool.query("UPDATE caixa SET status = 'fechado' WHERE status = 'aberto'");
    
    const { rows } = await pool.query(
      `INSERT INTO caixa (operador, saldo_inicial) VALUES ($1, $2) RETURNING *`,
      [operador, saldoInicial || 0]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Fechar caixa
app.post('/api/caixa/fechar', async (req, res) => {
  try {
    const caixa = await pool.query(
      "SELECT * FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1"
    );
    if (!caixa.rows.length) {
      return res.status(400).json({ erro: 'Nenhum caixa aberto' });
    }

    const caixaAtual = caixa.rows[0];
    
    // Calcular total de movimentos
    const movimentos = await pool.query(
      `SELECT tipo, COALESCE(SUM(valor), 0) as total 
       FROM caixa_movimentos 
       WHERE caixa_id = $1 GROUP BY tipo`,
      [caixaAtual.id]
    );

    let totalEntradas = 0, totalSaidas = 0;
    movimentos.rows.forEach(m => {
      if (m.tipo === 'entrada') totalEntradas = parseFloat(m.total);
      if (m.tipo === 'saida') totalSaidas = parseFloat(m.total);
    });

    const saldoFinal = parseFloat(caixaAtual.saldo_inicial) + totalEntradas - totalSaidas;

    const { rows } = await pool.query(
      `UPDATE caixa 
       SET status = 'fechado', saldo_final = $1, fechamento = NOW() 
       WHERE id = $2 RETURNING *`,
      [saldoFinal, caixaAtual.id]
    );

    res.json({
      caixa: rows[0],
      totalEntradas,
      totalSaidas,
      saldoFinal
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Registrar movimento
app.post('/api/caixa/movimento', async (req, res) => {
  const { tipo, valor, descricao } = req.body;
  try {
    const caixa = await pool.query(
      "SELECT id FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1"
    );
    if (!caixa.rows.length) {
      return res.status(400).json({ erro: 'Nenhum caixa aberto no momento' });
    }

    const { rows } = await pool.query(
      `INSERT INTO caixa_movimentos (caixa_id, tipo, valor, descricao)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [caixa.rows[0].id, tipo, valor, descricao]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ===== API — RESUMO GERAL =====

app.get('/api/resumo', async (req, res) => {
  try {
    // Total vendas hoje
    const vendas = await pool.query(
      "SELECT COALESCE(SUM(valor_total), 0) as total FROM pedidos WHERE DATE(created_at) = CURRENT_DATE"
    );
    
    // Caixa aberto
    const caixa = await pool.query(
      "SELECT * FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1"
    );

    res.json({
      vendasHoje: parseFloat(vendas.rows[0].total),
      caixaAberto: caixa.rows[0] || null
    });
  } catch (e) {
    res.json({ erro: e.message, vendasHoje: 0, caixaAberto: null });
  }
});

// ===== API — CLIENTES =====

// Verificar se cliente já existe
app.get('/api/clientes/verificar/:telefone', async (req, res) => {
  const { telefone } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, telefone, restricoes FROM clientes WHERE telefone = $1',
      [telefone.replace(/\D/g, '')]
    );
    if (rows.length > 0) {
      res.json({ existe: true, cliente: rows[0] });
    } else {
      res.json({ existe: false });
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Listar clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes ORDER BY ultimo_pedido DESC NULLS LAST'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ===== API — FORNECEDORES =====

// Listar fornecedores
app.get('/api/fornecedores', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM fornecedores ORDER BY razao_social'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Cadastrar fornecedor
app.post('/api/fornecedores', async (req, res) => {
  const { razao_social, nome_fantasia, cnpj, telefone, email, endereco, categoria, contato, observacoes } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fornecedores 
       (razao_social, nome_fantasia, cnpj, telefone, email, endereco, categoria, contato, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [razao_social, nome_fantasia || null, cnpj || null, telefone || null, email || null, endereco || null, categoria || null, contato || null, observacoes || null]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Ativar/desativar fornecedor
app.patch('/api/fornecedores/:id/status', async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE fornecedores SET ativo = $1 WHERE id = $2 RETURNING *',
      [ativo, id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ===== ATUALIZAÇÃO — Modifica a rota de criar pedido para cadastrar cliente =====
// SUBSTITUI a rota app.post('/api/pedidos' existente por esta:

app.post('/api/pedidos', async (req, res) => {
  const { telefone, nome, email, restricoes, itens, tipo, observacao } = req.body;
  const telefoneLimpo = limparTelefone(telefone);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1️⃣ Cadastra ou atualiza cliente automaticamente
    let clienteId;
    const clienteExistente = await client.query(
      'SELECT id, restricoes FROM clientes WHERE telefone = $1',
      [telefoneLimpo]
    );

    if (clienteExistente.rows.length > 0) {
      // Atualiza dados do cliente
      clienteId = clienteExistente.rows[0].id;
      await client.query(
        `UPDATE clientes 
         SET nome = $1, email = COALESCE($2, email), 
             restricoes = CASE WHEN $3 IS NOT NULL AND $3 <> '' THEN $3 ELSE restricoes END,
             ultimo_pedido = CURRENT_TIMESTAMP,
             total_pedidos = total_pedidos + 1
         WHERE id = $4`,
        [nome, email, restricoes, clienteId]
      );
    } else {
      // Novo cadastro
      const novoCliente = await client.query(
        `INSERT INTO clientes (nome, telefone, email, restricoes, total_pedidos, ultimo_pedido)
         VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP) RETURNING id`,
        [nome, telefoneLimpo, email || null, restricoes || null]
      );
      clienteId = novoCliente.rows[0].id;
    }

    // 2️⃣ Calcular valor total
    let valorTotal = 0;
    for (const item of itens) {
      const prod = await client.query(
        'SELECT preco, estoque_atual FROM produtos WHERE id = $1',
        [item.produto_id]
      );
      if (!prod.rows.length) throw new Error(`Produto ${item.produto_id} não encontrado`);
      if (prod.rows[0].estoque_atual < item.quantidade) {
        throw new Error(`Estoque insuficiente: ${prod.rows[0].nome}`);
      }
      valorTotal += prod.rows[0].preco * item.quantidade;
    }

    // 3️⃣ Inserir pedido vinculado ao cliente
    const pedidoResult = await client.query(
      `INSERT INTO pedidos 
       (telefone_cliente, nome_cliente, cliente_id, valor_total, tipo, observacao)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, valor_total, created_at`,
      [telefoneLimpo, nome, clienteId, valorTotal, tipo, observacao]
    );
    const pedidoId = pedidoResult.rows[0].id;

    // 4️⃣ Inserir itens e baixar estoque
    for (const item of itens) {
      const prod = await client.query('SELECT preco FROM produtos WHERE id = $1', [item.produto_id]);
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, item.produto_id, item.quantidade, prod.rows[0].preco]
      );
      await client.query(
        'UPDATE produtos SET estoque_atual = estoque_atual - $1 WHERE id = $2',
        [item.quantidade, item.produto_id]
      );
    }

    await client.query('COMMIT');

    // 5️⃣ Mensagem com restrições se houver
    let msgCliente = `✅ Pedido recebido!\n\nPedido #${pedidoId}\nValor: R$ ${valorTotal.toFixed(2)}`;
    if (restricoes) {
      msgCliente += `\n⚠️ Atenção: Restrições alimentares registradas!`;
    }
    msgCliente += `\nEm breve estará pronto! 🥘`;

    await enviarMensagem(telefoneLimpo, msgCliente);

    res.json({ sucesso: true, pedidoId, valorTotal });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// ANÁLISE DE VENDAS POR DIA DA SEMANA
app.get('/api/analise-vendas', async (req, res) => {
  try {
    const diaSemana = parseInt(req.query.dia_semana || '1'); // 0=Dom, 1=Seg...
    
    // Pega os últimos 4 dias com esse dia da semana
    const semanas = [];
    const ranking = {};
    
    const result = await pool.query(`
      SELECT 
        EXTRACT(DOW FROM created_at) as dia_semana,
        DATE(created_at) as data,
        DATE_TRUNC('week', created_at) as semana,
        p.id,
        p.nome_cliente,
        p.valor_total,
        p.status,
        pi.nome_produto,
        pi.quantidade,
        pi.preco_unitario
      FROM pedidos p
      LEFT JOIN pedido_itens pi ON p.id = pi.pedido_id
      WHERE EXTRACT(DOW FROM p.created_at) = $1
        AND p.status = 'entregue'
        AND p.created_at >= NOW() - INTERVAL '60 days'
      ORDER BY data DESC, p.id DESC
    `, [diaSemana]);

    const agrupado = {};
    result.rows.forEach(row => {
      const data = row.data;
      if (!agrupado[data]) {
        agrupado[data] = { valor_total: 0, qtd_pedidos: 0, semana: row.semana, pedidos: {} };
      }
      agrupado[data].valor_total += parseFloat(row.valor_total || 0);
      
      if (!agrupado[data].pedidos[row.id]) {
        agrupado[data].pedidos[row.id] = true;
        agrupado[data].qtd_pedidos++;
      }
      
      // Ranking de itens
      if (row.nome_produto) {
        if (!ranking[row.nome_produto]) {
          ranking[row.nome_produto] = { nome: row.nome_produto, qtd: 0, total: 0 };
        }
        ranking[row.nome_produto].qtd += parseInt(row.quantidade || 1);
        ranking[row.nome_produto].total += parseFloat(row.preco_unitario || 0) * parseInt(row.quantidade || 1);
      }
    });

    // Monta lista das últimas 4 ocorrências
    const datasOrdenadas = Object.keys(agrupado).sort((a,b) => b.localeCompare(a)).slice(0,4);
    datasOrdenadas.forEach(data => {
      semanas.push({
        data: new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}),
        valor_total: agrupado[data].valor_total,
        qtd_pedidos: agrupado[data].qtd_pedidos
      });
    });

    // Cálculos
    const valores = semanas.map(s => s.valor_total);
    const media_geral = valores.length ? valores.reduce((a,b) => a+b, 0) / valores.length : 0;
    const crescimento = valores.length >= 2 
      ? ((valores[0] - valores[1]) / valores[1]) * 100 
      : 0;
    const variacao = [];
    for (let i = 1; i < valores.length; i++) {
      variacao.push(valores[i] ? ((valores[0] - valores[i]) / valores[i]) * 100 : 0);
    }

    // Ranking ordenado
    const rankingOrdenado = Object.values(ranking).sort((a,b) => b.total - a.total);

    res.json({
      semanas,
      media_geral,
      crescimento,
      variacao,
      ranking: rankingOrdenado
    });
  } catch (e) {
    console.error('Análise de vendas:', e);
    res.json({ semanas: [], media_geral: 0, crescimento: 0, variacao: [], ranking: [] });
  }
});

// === LANÇAR VENDA MANUAL ===
app.post('/api/pedidos/manual', async (req, res) => {
  try {
    const { nome_cliente, telefone_cliente, tipo, observacao, valor_total, itens, status } = req.body;
    
    // Insere o pedido
    const pedidoRes = await pool.query(`
      INSERT INTO pedidos 
      (nome_cliente, telefone_cliente, tipo, observacao, valor_total, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [nome_cliente, telefone_cliente, tipo, observacao, valor_total, status]);
    
    const pedido = pedidoRes.rows[0];
    
    // Insere os itens
    for (const item of itens) {
      await pool.query(`
        INSERT INTO pedido_itens (pedido_id, nome_produto, quantidade, preco_unitario)
        VALUES ($1, $2, $3, $4)
      `, [pedido.id, item.nome, item.quantidade, item.preco_unitario]);
    }
    
    res.json(pedido);
  } catch (e) {
    console.error('Venda manual:', e);
    res.status(500).json({erro: e.message});
  }
});

// === CLIENTES ===
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM clientes ORDER BY nome`);
    res.json(result.rows);
  } catch (e) {
    console.error('Listar clientes:', e);
    res.status(500).json({erro: e.message});
  }
});

app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM clientes WHERE id = $1`, [parseInt(id)]);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({erro: e.message});
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { nome, telefone, email, endereco, bairro, cidade, limite_fiado, observacao } = req.body;
    const result = await pool.query(`
      INSERT INTO clientes (nome, telefone, email, endereco, bairro, cidade, limite_fiado, saldo_fiado, observacao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
      RETURNING *
    `, [nome, telefone||null, email||null, endereco||null, bairro||null, cidade||null, limite_fiado||500, observacao||null]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Cadastrar cliente:', e);
    res.status(500).json({erro: e.message});
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nome, telefone, email, endereco, bairro, cidade, limite_fiado, observacao } = req.body;
    const result = await pool.query(`
      UPDATE clientes SET 
        nome = $1, telefone = $2, email = $3, endereco = $4, bairro = $5, cidade = $6, 
        limite_fiado = $7, observacao = $8, updated_at = NOW()
      WHERE id = $9 RETURNING *
    `, [nome, telefone||null, email||null, endereco||null, bairro||null, cidade||null, limite_fiado, observacao||null, id]);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({erro: e.message});
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM clientes WHERE id = $1`, [id]);
    res.json({ok: true});
  } catch (e) {
    res.status(500).json({erro: e.message});
  }
});

// === FIADO ===
app.get('/api/fiado/:cliente_id', async (req, res) => {
  try {
    const cliente_id = parseInt(req.params.cliente_id);
    const result = await pool.query(`
      SELECT * FROM fiado_movimentos 
      WHERE cliente_id = $1 
      ORDER BY data_movimento DESC
    `, [cliente_id]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({erro: e.message});
  }
});

app.post('/api/fiado', async (req, res) => {
  try {
    const { cliente_id, tipo, valor, descricao } = req.body;
    const cid = parseInt(cliente_id);
    
    await pool.query(`
      INSERT INTO fiado_movimentos (cliente_id, tipo, valor, descricao)
      VALUES ($1, $2, $3, $4)
    `, [cid, tipo, valor, descricao]);
    
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE -valor END), 0) as saldo
      FROM fiado_movimentos WHERE cliente_id = $1
    `, [cid]);
    
    const novoSaldo = saldoResult.rows[0].saldo;
    await pool.query(`UPDATE clientes SET saldo_fiado = $1 WHERE id = $2`, [novoSaldo, cid]);
    
    res.json({ok: true, novo_saldo: novoSaldo});
  } catch (e) {
    console.error('Lançar fiado:', e);
    res.status(500).json({erro: e.message});
  }
});

app.delete('/api/fiado/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const mov = await pool.query(`SELECT cliente_id FROM fiado_movimentos WHERE id = $1`, [id]);
    if (!mov.rows.length) return res.status(404).json({erro: 'Não encontrado'});
    const cliente_id = mov.rows[0].cliente_id;
    
    await pool.query(`DELETE FROM fiado_movimentos WHERE id = $1`, [id]);
    
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE -valor END), 0) as saldo
      FROM fiado_movimentos WHERE cliente_id = $1
    `, [cliente_id]);
    
    await pool.query(`UPDATE clientes SET saldo_fiado = $1 WHERE id = $2`, [saldoResult.rows[0].saldo, cliente_id]);
    
    res.json({ok: true});
  } catch (e) {
    res.status(500).json({erro: e.message});
  }
});

// ===== INICIAR SERVIDOR =====
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 SERVIDOR ONLINE — Porta ${CONFIG.PORT}`);
  console.log(`📋 Página inicial: http://localhost:${CONFIG.PORT}/`);
  console.log(`🤖 Webhook: http://localhost:${CONFIG.PORT}${CONFIG.WEBHOOK_PATH}`);
});
