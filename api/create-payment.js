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
    const { idAgendamento, email } = req.body || {};
    if (!idAgendamento || !email) return res.status(400).json({ error: 'ID do agendamento e e-mail são obrigatórios' });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });

    const origem = siteUrl(req);
    const resposta = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idAgendamento
      },
      body: JSON.stringify({
        items: [{
          id: 'sinal-agendamento',
          title: 'Sinal de agendamento de tatuagem',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: VALOR_SINAL
        }],
        payer: { email },
        external_reference: idAgendamento,
        back_urls: {
          success: `${origem}/?status=approved&external_reference=${encodeURIComponent(idAgendamento)}`,
          pending: `${origem}/?status=pending&external_reference=${encodeURIComponent(idAgendamento)}`,
          failure: `${origem}/?status=failure&external_reference=${encodeURIComponent(idAgendamento)}`
        },
        auto_return: 'approved'
      })
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.init_point) {
      console.error('Mercado Pago create preference:', resposta.status, dados);
      return res.status(502).json({ error: 'Não foi possível criar o pagamento' });
    }
    return res.status(200).json({ ok: true, initPoint: dados.init_point, preferenceId: dados.id, valor: VALOR_SINAL });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao criar pagamento' });
  }
};
