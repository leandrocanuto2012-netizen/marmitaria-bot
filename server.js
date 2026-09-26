require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ========== FORÇA IPv4 ==========
function extrairConexao(url) {
  const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!m) return null;
  return {
    host: m[3],
    port: parseInt(m[4]),
    user: m[1],
    password: m[2],
    database: m[5],
    ssl: { rejectUnauthorized: false },
    family: 4
  };
}

const config = extrairConexao(process.env.DATABASE_URL);
const pool = new Pool(config);

async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO:', erro.message);
  }
}
testarBanco();

console.log('🔍 VARIÁVEIS:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_URL:', process.env.EVO_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_KEY:', process.env.EVO_KEY ? '✅ OK' : '❌ FALTA');

bot.init(app, pool);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
});
