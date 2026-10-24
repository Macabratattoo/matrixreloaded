const { google } = require('googleapis');

const ABAS = {
  'cascavel': 'Cascavel',
  'gravatai': 'Gravatai',
  'balneario camboriu': 'Camboriu',
  'camboriu': 'Camboriu'
};

const VALOR_SINAL = 50;
const DURACAO_MINUTOS = 120; // ajuste se cada atendimento tiver outra duração
const FUSO = 'America/Sao_Paulo';

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function calendarioDaAba(aba) {
  const mapa = {
    Cascavel: process.env.CALENDAR_CASCAVEL_ID,
    Gravatai: process.env.CALENDAR_GRAVATAI_ID,
    Camboriu: process.env.CALENDAR_CAMBORIU_ID
  };
  return mapa[aba];
}

// Aceita "2026-11-06", "06/11/2026" ou o número de data do Sheets
function parseData(valor) {
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const serial = Number(s);
  if (!isNaN(serial) && serial > 1000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  throw new Error('Data inválida na planilha: ' + s);
}

// Aceita "14:00", "14h" ou a fração de dia do Sheets (ex.: 0,583)
function parseHorario(valor) {
  const s = String(valor).trim();
  const m = s.match(/^(\d{1,2})[:h](\d{2})?/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
  const frac = Number(s);
  if (!isNaN(frac) && frac >= 0 && frac < 1) {
    const min = Math.round(frac * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  throw new Error('Horário inválido na planilha: ' + s);
}

function somarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { idAgendamento, paymentId, cidade } = req.body;
    const aba = ABAS[normalizar(cidade)];
    if (!aba || !idAgendamento || !paymentId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // 1. Confirma o pagamento direto no Mercado Pago
    const respMp = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    if (!respMp.ok) {
      return res.status(400).json({ error: 'Pagamento não encontrado' });
    }
    const pagamento = await respMp.json();
    if (pagamento.status !== 'approved' || Number(pagamento.transaction_amount) < VALOR_SINAL) {
      return res.status(402).json({ error: 'Pagamento ainda não aprovado' });
    }
    if (pagamento.external_reference && pagamento.external_reference !== idAgendamento) {
      return res.status(400).json({ error: 'Pagamento não corresponde ao agendamento' });
    }

    // 2. Lê a planilha
    const credenciais = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const authSheets = new google.auth.GoogleAuth({
      credentials: credenciais,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth: authSheets });

    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`
    });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(l => l[1] === idAgendamento);
    if (indice === -1) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    const linha = linhas[indice];
    const linhaPlanilha = indice + 1;

    // Já confirmado: não cria evento de novo
    if (linha[4] === 'confirmado') {
      return res.status(200).json({ ok: true, jaConfirmado: true });
    }

    // Mesmo pagamento não pode servir para dois agendamentos
    const pagamentoUsado = linhas.some((l, i) => i !== indice && l[3] === String(paymentId));
    if (pagamentoUsado) {
      return res.status(409).json({ error: 'Pagamento já usado em outro agendamento' });
    }

    // 3. Cria o evento na agenda da cidade
    const calendarId = calendarioDaAba(aba);
    if (!calendarId) {
      throw new Error('Calendário não configurado para ' + aba);
    }

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const dataISO = parseData(linha[9]);
    const inicio = parseHorario(linha[10]);
    const fim = somarMinutos(inicio, DURACAO_MINUTOS);

    const evento = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Tatuagem - ${linha[5]}`,
        description: [
          `WhatsApp: ${linha[6]}`,
          `E-mail: ${linha[7]}`,
          `Tatuagem e local: ${linha[8]}`,
          `Tamanho: ${linha[11]}`,
          `Dúvidas: ${linha[12] || 'Nenhuma'}`,
          `Recomendação: ${linha[13] || 'Nenhuma'}`,
          `Fotos: ${linha[14] || 'Sem fotos'}`,
          `Pagamento do sinal: ${paymentId}`,
          `Código: ${idAgendamento}`
        ].join('\n'),
        start: { dateTime: `${dataISO}T${inicio}:00`, timeZone: FUSO },
        end: { dateTime: `${dataISO}T${fim}:00`, timeZone: FUSO }
      }
    });

    // 4. Marca como confirmado e grava o ID do pagamento
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!D${linhaPlanilha}:E${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(paymentId), 'confirmado']] }
    });

    return res.status(200).json({ ok: true, eventoId: evento.data.id, link: evento.data.htmlLink });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao confirmar: ' + erro.message });
  }
};
