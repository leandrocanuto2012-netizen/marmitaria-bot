require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot.js'); // âœ… BOT SEPARADO — NÃƒO MEXE!

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// BANCO
// ==========================================
const pool = new Pool({
  string de conexão: process.env.DATABASE_URL,
  ssl: { rejeitarNãoAutorizado: falso }
});

função assíncrona testarBanco() {
  tentar {
    const c = await pool.connect();
    console.log('âœ…Banco CONECTADO!');
    c.release();
  } catch(e) {
    console.error('â Œ Erro Banco:', e.message);
  }
}
testarBanco();

// ==========================================
// EVOLUÇÃO / BOT — INTACTO!
// ==========================================
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('ðŸ¤– Bot carregado | Instância:', INSTANCE);

função assíncrona enviarMensagem(numero, texto) {
  if (!EVO_URL || !EVO_KEY || !numero) return;
  tentar {
    const url = `${EVO_URL}/message/sendText/${INSTANCE}`;
    await axios.post(url, { number: numero, text: texto }, { headers: { 'apikey': EVO_KEY } });
    console.log('âœ… Enviado para:', numero);
  } catch(e) {
    console.error('â Œ Erro envio:', e.response?.status, e.response?.data || e.message);
  }
}

// Webhook — DOIS caminhos para garantir
função assíncrona Webhook(corpo) {
  const { evento, dados } = corpo;
  console.log('ðŸ“© Evento:', evento);
  se (evento !== 'messages.upsert') retorne;

  const mensagem = dados?.mensagens?.[0];
  if (!mensagem || mensagem.key?.fromMe) return;
  if (mensagem.key?.remoteJid?.includes('@g.us')) return; // ignora grupos
  if (mensagem.key?.remoteJid?.includes('status@broadcast')) return; // ignorar status

  const texto = (
    mensagem.mensagem?.conversação ||
    mensagem.message?.extendedTextMessage?.text ||
    mensagem.message?.imageMessage?.caption ||
    (mensagem.message?.audioMessage ? '[áudio]' : '')
  ) || '';
  const numero = mensagem.key?.remoteJid?.replace(/\D/g, '');

  console.log(`ðŸ'¬ ${numero}: ${texto}`);
  const resposta = aguarda bot.responder(numero, texto);
  if (resposta && número) aguardar enviarMensagem(numero, resposta);
}

app.post('/webhook', (req, res) => { res.sendStatus(200); processarWebhook(req.body); });
app.post('/message/marmitaria/webhook', (req, res) => { res.sendStatus(200); processarWebhook(req.body); });

// ==========================================
// ðŸ”§ PRODUTOS — CORRIGIDO (DOIS FORMATOS)
// ==========================================
app.get('/api/produtos', async (req, res) => {
  tentar {
    const result = await pool.query(`
      SELECIONAR
        nome, nome COMO nome,
        preço, preço AS preco,
        estoque, estoque AS estoque
      A partir de produtos, ORDEM POR ID
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==========================================
// ðŸ”§ CAIXA — CORRIGIDO COM id_da_empresa
// ==========================================
app.get('/api/resumo', async (req, res) => {
  tentar {
    const result = await pool.query(`
      SELECIONE * DA FÓRMULA cash_registers
      ONDE status = 'aberto' ORDENAR POR opened_at DESC LIMITAR 1
    `);
    res.json({ caixaAberto: result.rows[0] || null });
  } catch (e) {
    console.error('Resumo:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/caixa/abrir', async (req, res) => {
  tentar {
    const { operador, saldo_inicial } = req.body;
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Nenhuma empresa cadastrada!' });
    const company_id = empresa.rows[0].id;

    const aberto = aguarda pool.query(
      `SELECT id FROM cash_registers WHERE status = 'aberto' AND company_id = $1`,
      [id_da_empresa]
    );
    if (aberto.rows.length > 0) return res.status(400).json({ erro: 'Já existe uma caixa aberta!' });

    const result = await pool.query(`
      INSERT INTO cash_registers (company_id, operator_name, opening_balance, status, opened_at)
      VALORES ($1, $2, $3, 'aberto', AGORA()) RETORNANDO *
    `, [id_empresa, operador, saldo_inicial || 0]);

    res.json({ sucesso: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Abrir Caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/caixa/fechar', async (req, res) => {
  tentar {
    const { saldo_contado, saldo_sistema, diferença } = req.corpo;
    const result = await pool.query(`
      ATUALIZAR caixas registradoras
      DEFINIR status = 'fechado', saldo_de_fechamento = $1, saldo_contado = $2, diferença = $3, fechado_em = AGORA()
      ONDE status = 'aberto' RETORNANDO *
    `, [saldo_sistema, saldo_contado, diferença]);
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Nenhum caixa aberta!' });
    res.json({ sucesso: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Fechar Caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==========================================
// PEDIDOS
// ==========================================
app.get('/api/pedidos', async (req, res) => {
  tentar {
    const result = await pool.query(`SELECT * FROM sales_orders ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/pedidos/manual', async (req, res) => {
  const client = await pool.connect();
  tentar {
    aguarde cliente.query('BEGIN');
    const { nome_cliente, telefone_cliente, tipo, observação, valor_total, itens, status } = req.body;
    const empresa = await client.query(`SELECT id FROM companies LIMIT 1`);
    const company_id = empresa.rows[0].id;

    const pedido = aguarda cliente.query(`
      INSERT INTO sales_orders (company_id, customer_name, customer_phone, order_type, observation, total_amount, status, created_at)
      VALORES ($1, $2, $3, $4, $5, $6, $7, AGORA()) RETORNANDO id
    `, [id_empresa, nome_cliente, telefone_cliente, tipo, observação, valor_total, status]);
    const pedidoId = pedido.rows[0].id;

    para (constante item de itens) {
      aguarde cliente.consulta(`
        INSERT INTO order_items (order_id, product_name, quantity, unit_price)
        VALORES ($1, $2, $3, $4)
      `, [pedidoId, item.nome_produto || item.nome, item.quantidade, item.preco_unitario || item.preco]);
      
      aguarde cliente.consulta(`
        ATUALIZAR produtos DEFINIR estoque = estoque - $1 ONDE nome = $2
      `, [item.quantidade, item.nome_produto || item.nome]);
    }

    aguarde client.query('COMMIT');
    res.json({ sucesso: true, id: pedidoId });
  } catch (e) {
    aguarde client.query('ROLLBACK');
    console.error('Venda:', e);
    res.status(500).json({ erro: e.message });
  } finalmente {
    cliente.liberar();
  }
});
// ==========================================
// ðŸ“… CARDÁ PIO DO DIA
// ==========================================

// Carregar cardápio do dia
app.get('/api/cardapio-dia', async (req, res) => {
  tentar {
    const { data } = req.query;
    const dataAlvo = data || new Date().toISOString().split('T')[0];
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.json([]);

    const result = await pool.query(`
      SELECT id, nome, descrição, preço, categoria, disponível, ordem
      DO menu diário
      ONDE company_id = $1 E data = $2 E disponivel = true
      ORDER BY categoria, ordem, nome
    `, [empresa.rows[0].id, dataAlvo]);

    res.json(result.rows);
  } catch (e) {
    console.error('Cardápio dia:', e);
    res.status(500).json({ erro: e.message });
  }
});

// Salvar/atualizar item do cardápio
app.post('/api/cardapio-dia/salvar', async (req, res) => {
  tentar {
    const {dado, nome, descrição, preço, categoria, disponível, ordem } = req.body;
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Empresa não cadastrada' });

    const result = await pool.query(`
      INSERT INTO daily_menu (company_id, data, nome, descricao, preco, categoria, disponivel, ordem)
      VALORES ($1, $2, $3, $4, $5, $6, $7, $8)
      EM CASO DE CONFLITO (company_id, data, nome) FAÇA ATUALIZAÇÃO DE CONJUNTO
        descrição = EXCLUÍDO. descrição,
        preco = EXCLUÍDO.preco,
        categoria = EXCLUÍDA.categoria,
        disponivel = EXCLUÍDO.disponivel,
        ordem = EXCLUÍDO.ordem
      RETORNANDO *
    `, [empresa.rows[0].id, data || new Date().toISOString().split('T')[0],
        nome, descrição || '', preço, categoria || 'Prato Principal',
        disponível !== falso, ordem || 0]);

    res.json({ sucesso: true, item: result.rows[0] });
  } catch (e) {
    console.error('Salvar cardápio:', e);
    res.status(500).json({ erro: e.message });
  }
});

// Listar produtos para dropdown do PDV
app.get('/api/produtos/lista', async (req, res) => {
  tentar {
    const result = await pool.query(`
      SELECIONE nome AS nome, preço AS preço, estoque AS estoque
      Produtos da FROM
      ONDE estoque > 0
      ORDENAR POR nome
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Lista de produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});
// ==========================================
// ðŸ—'ï¸ EXCLUIR item do cardápio
// ==========================================
app.post('/api/cardapio-dia/excluir', async (req, res) => {
  tentar {
    const { id } = req.body;
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Empresa não cadastrada' });

    const result = await pool.query(`
      EXCLUIR DO menu diário
      ONDE id = $1 E company_id = $2
      RETORNANDO *
    `, [id, empresa.rows[0].id]);

    se (resultado.rowCount === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Item não encontrado' });
    }

    res.json({ sucesso: true });
  } catch (e) {
    console.error('Excluir cartão:', e);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});
// ==========================================
// PAINEL ADM — pede senha
// ==========================================
função abrirAdm() {
  const senha = prompt('ðŸ”' Digite a senha ADM:');
  const SENHA_ADM = 'admin123'; // â† ALTERE A SENHA AQUI SE QUISER
  
  se (senha === SENHA_ADM) {
    sessionStorage.setItem('adm_liberado', 'sim');
    window.location.href = '../dashboard.html';
  } senão se (senha !== null) {
    alert('â ŒSenha incorreta!');
  }
}
// ==========================================
// INICIAR
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`ðŸš€ Servidor na porta ${PORT}`);
  console.log(`ðŸ”— Webhook: /webhook e /message/marmitaria/webhook`);
});