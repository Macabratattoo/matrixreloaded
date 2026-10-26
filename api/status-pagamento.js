module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const paymentId = String(req.query.id || '');
    const idAgendamento = String(req.query.agendamento || '');
    if (!/^\d+$/.test(paymentId) || !/^AG-(CAS|GRA|CAM)-\d+$/.test(idAgendamento)) {
      return res.status(400).json({ error: 'Dados de pagamento inválidos' });
    }
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado' });

    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const pagamento = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return res.status(502).json({ error: 'Não foi possível consultar o pagamento' });
    if (pagamento.external_reference !== idAgendamento) {
      return res.status(403).json({ error: 'Pagamento não corresponde ao agendamento' });
    }

    const status = pagamento.status === 'approved' ? 'approved'
      : ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(pagamento.status) ? 'rejected'
        : 'pending';
    return res.status(200).json({
      ok: true,
      paymentId: String(pagamento.id),
      status,
      statusDetail: pagamento.status_detail
    });
  } catch (erro) {
    console.error('Falha ao consultar pagamento:', erro);
    return res.status(500).json({ error: 'Falha ao consultar pagamento' });
  }
};
