const VALOR_SINAL = '50.00';

function erroMercadoPago(dados) {
  const causa = Array.isArray(dados.cause)
    ? dados.cause.map(item => item.description || item.message || item.code).filter(Boolean).join('; ')
    : '';
  return causa || dados.message || dados.error || JSON.stringify(dados.cause || dados);
}

function respostaOrder(dados) {
  const pagamento = dados.transactions?.payments?.[0] || {};
  const metodo = pagamento.payment_method || {};
  return {
    ok: true,
    orderId: String(dados.id),
    paymentId: pagamento.id ? String(pagamento.id) : null,
    status: pagamento.status || dados.status,
    statusDetail: pagamento.status_detail || dados.status_detail,
    pix: metodo.id === 'pix' ? {
      qrCode: metodo.qr_code || '',
      qrCodeBase64: metodo.qr_code_base64 || '',
      ticketUrl: metodo.ticket_url || ''
    } : null
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, idempotencyKey, formData = {}, payer: payerInput, paymentTypeId } = req.body || {};
    if (!idAgendamento || !process.env.MP_ACCESS_TOKEN) return res.status(400).json({ error: 'Agendamento ou Mercado Pago não configurado' });

    const paymentMethodId = String(req.body?.paymentMethodId || formData.payment_method_id || '').trim();
    const token = String(req.body?.token || formData.token || '').trim();
    const installments = Number(req.body?.installments || formData.installments || 1);
    const issuerId = req.body?.issuerId || formData.issuer_id;
    const payer = payerInput || formData.payer || {};
    const email = String(payer.email || '').trim();
    const identificacao = payer.identification?.number ? {
      type: String(payer.identification.type || 'CPF').toUpperCase(),
      number: String(payer.identification.number).replace(/\D/g, '')
    } : undefined;

    let metodo;
    if (paymentMethodId === 'pix') {
      metodo = { id: 'pix', type: 'bank_transfer' };
    } else {
      const tipo = String(paymentTypeId || req.body?.paymentType || formData.payment_type_id || '').toLowerCase();
      if (!paymentMethodId || !token || !['credit_card', 'debit_card'].includes(tipo)) {
        return res.status(400).json({ error: 'Dados do cartão incompletos ou tipo inválido' });
      }
      metodo = { id: paymentMethodId, type: tipo, token, installments: Number.isFinite(installments) && installments > 0 ? installments : 1 };
      if (issuerId) metodo.issuer_id = String(issuerId);
    }
    if (!email) return res.status(400).json({ error: 'E-mail do pagador é obrigatório' });

    const orderBody = {
      type: 'online',
      total_amount: VALOR_SINAL,
      external_reference: idAgendamento,
      processing_mode: 'automatic',
      transactions: { payments: [{ amount: VALOR_SINAL, payment_method: metodo }] },
      payer: { email, ...(identificacao ? { identification: identificacao } : {}) }
    };
    const chave = String(idempotencyKey || `${idAgendamento}-${paymentMethodId || 'pix'}-${Date.now()}`).slice(0, 128);
    const resposta = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': chave
      },
      body: JSON.stringify(orderBody)
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('Mercado Pago create order:', resposta.status, dados);
      return res.status(502).json({ error: dados.message || 'Mercado Pago recusou a order', detail: erroMercadoPago(dados) });
    }
    return res.status(200).json(respostaOrder(dados));
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao criar order' });
  }
};
