module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const orderId = String(req.query.id || '');
    if (!/^ORD[A-Z0-9]+$/i.test(orderId)) return res.status(400).json({ error: 'ID da order inválido' });
    const resposta = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return res.status(502).json({ error: 'Não foi possível consultar a order Pix' });
    const pagamento = dados.transactions?.payments?.[0] || {};
    const status = pagamento.status || dados.status;
    const normalizado = ['processed', 'approved', 'accredited'].includes(status) ? 'approved'
      : ['rejected', 'cancelled', 'closed'].includes(status) ? 'rejected' : 'pending';
    return res.status(200).json({ ok: true, orderId, paymentId: pagamento.id ? String(pagamento.id) : null, status: normalizado, statusDetail: pagamento.status_detail || dados.status_detail });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao consultar order Pix' });
  }
};
