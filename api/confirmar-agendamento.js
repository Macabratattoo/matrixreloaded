const crypto = require('crypto');
const {
  FUSO,
  abaDaCidade,
  calendarioDaAba,
  calendarClient,
  normalizarTamanho,
  parseData,
  parseHorario,
  sheetsClient,
  intervalosDoAgendamento,
  intervaloComoDatasComFolga,
  intervalosConflitam
} = require('./_booking-utils');

const VALOR_SINAL = 50;

function idDeterministicoDoEvento(idAgendamento, tipo) {
  const digest = crypto.createHash('sha256').update(`${idAgendamento}:${tipo}`).digest('hex').slice(0, 32);
  return `tattoo${digest}`;
}

async function inserirEventoIdempotente(calendar, calendarId, eventId, requestBody) {
  try {
    return await calendar.events.insert({ calendarId, requestBody: { ...requestBody, id: eventId } });
  } catch (erro) {
    const status = Number(erro.code || erro.response?.status);
    if (status !== 409) throw erro;
    return calendar.events.get({ calendarId, eventId });
  }
}

async function buscarEventoExistente(calendar, calendarId, eventId) {
  try {
    const resposta = await calendar.events.get({ calendarId, eventId });
    return resposta.data?.status === 'cancelled' ? null : resposta;
  } catch (erro) {
    const status = Number(erro.code || erro.response?.status);
    if (status === 404) return null;
    throw erro;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, orderId, cidade } = req.body || {};
    const aba = abaDaCidade(cidade);
    const referenciaPagamento = orderId;
    if (!aba || !idAgendamento || !orderId) return res.status(400).json({ error: 'Dados incompletos' });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });

    const respOrder = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
    if (!respOrder.ok) return res.status(400).json({ error: 'Order não encontrada' });
    const order = await respOrder.json();
    const transacao = order.transactions?.payments?.[0] || {};
    const pagamento = { status: transacao.status || order.status, transaction_amount: Number(transacao.amount || order.total_amount), external_reference: order.external_reference };
    const valorPagamento = Number(pagamento.transaction_amount);
    const aprovado = ['processed', 'approved', 'accredited'].includes(pagamento.status);
    if (!aprovado || !Number.isFinite(valorPagamento) || Math.round(valorPagamento * 100) !== VALOR_SINAL * 100) {
      return res.status(402).json({ error: 'Pagamento ainda não aprovado' });
    }
    if (pagamento.external_reference !== idAgendamento) {
      return res.status(400).json({ error: 'Pagamento não corresponde ao agendamento' });
    }

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(linha => linha[1] === idAgendamento);
    if (indice < 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    const linha = linhas[indice];
    const linhaPlanilha = indice + 1;
    if (String(linha[4] || '').toLowerCase() === 'confirmado') {
      return res.status(200).json({ ok: true, jaConfirmado: true, eventoId: linha[17] || null });
    }
    if (linhas.some((outra, i) => i !== indice && String(outra[3] || '') === String(referenciaPagamento))) {
      return res.status(409).json({ error: 'Pagamento já usado em outro agendamento' });
    }

    const dataISO = parseData(linha[9]);
    const inicio = parseHorario(linha[10]);
    const tamanho = normalizarTamanho(linha[11]);
    const calculo = intervalosDoAgendamento(dataISO, inicio, tamanho);
    const calendarId = calendarioDaAba(aba);
    if (!calendarId || !calculo) return res.status(500).json({ error: 'Dados de calendário incompletos' });

    const calendar = calendarClient();
    const idEventoPrincipal = idDeterministicoDoEvento(idAgendamento, 'principal');
    const eventoPrincipalExistente = await buscarEventoExistente(calendar, calendarId, idEventoPrincipal);
    if (!eventoPrincipalExistente) {
      for (const intervalo of calculo.intervalos) {
        const janelaComFolga = intervaloComoDatasComFolga(intervalo);
        const busy = await calendar.freebusy.query({
          requestBody: {
            timeMin: janelaComFolga.start,
            timeMax: janelaComFolga.end,
            timeZone: FUSO,
            items: [{ id: calendarId }]
          }
        });
        const conflitos = (busy.data.calendars?.[calendarId]?.busy || []).some(ocupado => intervalosConflitam(intervalo, ocupado));
        if (conflitos) {
          return res.status(409).json({ error: 'O horário ficou ocupado antes da confirmação' });
        }
      }
    }

    const eventos = [];
    const principal = calculo.intervalos[0];
    const eventoPrincipal = eventoPrincipalExistente || await inserirEventoIdempotente(calendar, calendarId, idEventoPrincipal, {
      summary: `Tatuagem - ${linha[5]}`,
      description: [
        `WhatsApp: ${linha[6]}`, `E-mail: ${linha[7]}`, `Tatuagem e local: ${linha[8]}`,
        `Tamanho: ${tamanho}`, `Dúvidas: ${linha[12] || 'Nenhuma'}`,
        `Recomendação: ${linha[13] || 'Nenhuma'}`, `Fotos: ${linha[14] || 'Sem fotos'}`,
        `Pagamento do sinal: ${referenciaPagamento}`, `Código: ${idAgendamento}`
      ].join('\n'),
      start: { dateTime: `${principal.dataInicio}T${principal.horaInicio}:00`, timeZone: FUSO },
      end: { dateTime: `${principal.dataFim}T${principal.horaFim}:00`, timeZone: FUSO }
    });
    eventos.push(eventoPrincipal.data.id || idEventoPrincipal);

    if (calculo.sobra > 0) {
      const bloqueio = calculo.intervalos[1];
      const eventoBloqueio = await inserirEventoIdempotente(calendar, calendarId, idDeterministicoDoEvento(idAgendamento, 'bloqueio-sobra'), {
        summary: `Bloqueio pós-tatuagem - ${linha[5]}`,
        description: `Bloqueio de ${calculo.sobra} minutos referente ao agendamento ${idAgendamento}.`,
        start: { dateTime: `${bloqueio.dataInicio}T${bloqueio.horaInicio}:00`, timeZone: FUSO },
        end: { dateTime: `${bloqueio.dataFim}T${bloqueio.horaFim}:00`, timeZone: FUSO }
      });
      eventos.push(eventoBloqueio.data.id || idDeterministicoDoEvento(idAgendamento, 'bloqueio-sobra'));
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!D${linhaPlanilha}:E${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(referenciaPagamento), 'confirmado']] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!L${linhaPlanilha}:L${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[tamanho]] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!R${linhaPlanilha}:R${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[eventos.join(',')]] }
    });

    return res.status(200).json({ ok: true, eventoId: eventos[0], eventos, sobraMinutos: calculo.sobra });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao confirmar: ' + erro.message });
  }
};

module.exports.idDeterministicoDoEvento = idDeterministicoDoEvento;
