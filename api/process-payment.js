const VALOR_SINAL = 50;

function siteUrl(req) {
  const configurada = String(process.env.SITE_URL || '').replace(/\/$/, '');
  if (configurada) return configurada;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocolo = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${protocolo}://${host}` : 'https://matrixreloaded.vercel.app';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, idempotencyKey, formData = {}, payer: payerInput } = req.body || {};
    const paymentMethodId = req.body?.paymentMethodId || formData.payment_method_id;
    const token = req.body?.token || formData.token;
    const installments = req.body?.installments || formData.installments;
    const issuerId = req.body?.issuerId || formData.issuer_id;
    const payer = payerInput || formData.payer;
    if (!idAgendamento || !paymentMethodId || !payer?.email) {
      return res.status(400).json({ error: 'Dados de pagamento incompletos' });
    }
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado' });

    const identificacao = payer.identification && payer.identification.number
      ? {
          type: String(payer.identification.type || 'CPF').toUpperCase(),
          number: String(payer.identification.number).replace(/\D/g, '')
        }
      : undefined;
    const pagamento = {
      transaction_amount: VALOR_SINAL,
      description: 'Sinal de agendamento de tatuagem',
      external_reference: idAgendamento,
      payment_method_id: paymentMethodId,
      payer: {
        email: payer.email,
        entity_type: ['individual', 'association'].includes(String(payer.entity_type || '').toLowerCase())
          ? String(payer.entity_type).toLowerCase()
          : 'individual',
        ...(identificacao ? { identification: identificacao } : {})
      }
    };
    if (token) pagamento.token = token;
    if (installments) pagamento.installments = Number(installments);
    if (issuerId) pagamento.issuer_id = String(issuerId);
    pagamento.notification_url = `${siteUrl(req)}/api/mp-webhook`;

    const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': String(idempotencyKey || `${idAgendamento}-${Date.now()}`)
      },
      body: JSON.stringify(pagamento)
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('Mercado Pago process payment:', resposta.status, dados);
      const causa = Array.isArray(dados.cause)
        ? dados.cause.map(item => item.description || item.message || item.code).filter(Boolean).join('; ')
        : '';
      return res.status(502).json({
        error: dados.message || 'Mercado Pago recusou o pagamento',
        detail: causa || dados.error || dados.status || (dados.cause ? JSON.stringify(dados.cause) : '')
      });
    }

    const transacao = dados.point_of_interaction?.transaction_data;
    return res.status(200).json({
      ok: true,
      paymentId: String(dados.id),
      status: dados.status,
      statusDetail: dados.status_detail,
      pix: transacao ? {
        qrCode: transacao.qr_code || '',
        qrCodeBase64: transacao.qr_code_base64 || '',
        ticketUrl: transacao.ticket_url || ''
      } : null
    });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao processar pagamento' });
  }
};
