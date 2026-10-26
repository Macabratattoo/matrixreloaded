const VALOR_SINAL = '50.00';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, email } = req.body || {};
    if (!idAgendamento || !email) return res.status(400).json({ error: 'Agendamento e e-mail são obrigatórios' });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado' });

    const resposta = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${idAgendamento}-pix-${Date.now()}`
      },
      body: JSON.stringify({
        type: 'online',
        total_amount: VALOR_SINAL,
        external_reference: idAgendamento,
        processing_mode: 'automatic',
        transactions: {
          payments: [{ amount: VALOR_SINAL, payment_method: { id: 'pix', type: 'bank_transfer' } }]
        },
        payer: { email }
      })
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('Mercado Pago create order:', resposta.status, dados);
      const causa = Array.isArray(dados.cause)
        ? dados.cause.map(item => item.description || item.message || item.code).filter(Boolean).join('; ')
        : '';
      return res.status(502).json({ error: dados.message || 'Mercado Pago recusou a order Pix', detail: causa || dados.error || JSON.stringify(dados.cause || '') });
    }

    const pagamento = dados.transactions?.payments?.[0] || {};
    const metodo = pagamento.payment_method || {};
    return res.status(200).json({
      ok: true,
      orderId: String(dados.id),
      paymentId: pagamento.id ? String(pagamento.id) : null,
      status: pagamento.status || dados.status,
      statusDetail: pagamento.status_detail || dados.status_detail,
      pix: {
        qrCode: metodo.qr_code || '',
        qrCodeBase64: metodo.qr_code_base64 || '',
        ticketUrl: metodo.ticket_url || ''
      }
    });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao criar order Pix' });
  }
};
