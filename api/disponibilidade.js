const {
  abaDaCidade,
  disponibilidadeDetalhada,
  parseData
} = require('./_booking-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const aba = abaDaCidade(req.query.cidade);
    const min = parseData(req.query.min);
    const max = parseData(req.query.max);
    if (!aba || !min || !max || min > max) return res.status(400).json({ error: 'Cidade ou intervalo inválido' });
    const resultado = await disponibilidadeDetalhada({ aba, minISO: min, maxISO: max });
    return res.status(200).json({ cidade: aba, indisponiveis: resultado.indisponiveis, ocupados: resultado.ocupados, falhas: resultado.falhas });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Não foi possível consultar a disponibilidade', detail: String(erro.message || '').slice(0, 500) });
  }
};
