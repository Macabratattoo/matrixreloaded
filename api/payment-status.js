module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const id = String(req.query.id || '');
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID de pagamento inválido' });
    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return res.status(502).json({ error: 'Não foi possível consultar o pagamento' });
    return res.status(200).json({ ok: true, id: String(dados.id), status: dados.status, statusDetail: dados.status_detail });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao consultar pagamento' });
  }
};
