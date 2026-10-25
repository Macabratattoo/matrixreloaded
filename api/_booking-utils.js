const { google } = require('googleapis');

const ABAS = {
  cascavel: 'Cascavel',
  gravatai: 'Gravatai',
  'balneario camboriu': 'Camboriu',
  camboriu: 'Camboriu'
};

const CALENDAR_ENV_BY_ABA = {
  Cascavel: 'CALENDAR_CASCAVEL_ID',
  Gravatai: 'CALENDAR_GRAVATAI_ID',
  Camboriu: 'CALENDAR_CAMBORIU_ID'
};

const DURACAO_MINUTOS = 120;
const FUSO = 'America/Sao_Paulo';

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function abaDaCidade(cidade) {
  return ABAS[normalizar(cidade)] || null;
}

function calendarioDaAba(aba) {
  const env = CALENDAR_ENV_BY_ABA[aba];
  return env ? process.env[env] : null;
}

function normalizarTamanho(valor) {
  const texto = normalizar(valor);
  if (texto === 'p' || texto.startsWith('pequena')) return 'P';
  if (texto === 'm' || texto.startsWith('media')) return 'M';
  if (texto === 'g' || texto.startsWith('grande')) return 'G';
  return '';
}

function parseData(valor) {
  const s = String(valor || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const serial = Number(s.replace(',', '.'));
  if (!Number.isNaN(serial) && serial > 1000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return '';
}

function parseHorario(valor) {
  const s = String(valor || '').trim();
  const m = s.match(/^(\d{1,2})(?::|h)?(\d{2})?/i);
  if (m) return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
  const frac = Number(s.replace(',', '.'));
  if (!Number.isNaN(frac) && frac >= 0 && frac < 1) {
    const minutos = Math.round(frac * 24 * 60);
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
  }
  return '';
}

function somarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dataSeguinte(iso) {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function googleAuth(scopes) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({ credentials, scopes });
}

function sheetsClient() {
  return google.sheets({
    version: 'v4',
    auth: googleAuth(['https://www.googleapis.com/auth/spreadsheets'])
  });
}

function calendarClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

async function busyDatesFromCalendar(calendarId, minISO, maxISO) {
  const calendar = calendarClient();
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: `${minISO}T00:00:00-03:00`,
      timeMax: `${dataSeguinte(maxISO)}T00:00:00-03:00`,
      timeZone: FUSO,
      items: [{ id: calendarId }]
    }
  });
  const busy = response.data.calendars?.[calendarId]?.busy || [];
  const dias = new Set();
  for (const intervalo of busy) {
    const inicio = new Date(intervalo.start);
    const fim = new Date(intervalo.end);
    for (let d = new Date(inicio); d < fim; d.setDate(d.getDate() + 1)) {
      dias.add(d.toISOString().slice(0, 10));
    }
  }
  return dias;
}

async function pendingDatesFromSheet(sheets, aba, minISO, maxISO) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${aba}!A:T`
  });
  const dias = new Set();
  for (const linha of response.data.values || []) {
    const status = normalizar(linha[4]);
    const data = parseData(linha[9]);
    if (data && data >= minISO && data <= maxISO && !['cancelado', 'expirado'].includes(status)) {
      dias.add(data);
    }
  }
  return dias;
}

async function disponibilidade({ aba, minISO, maxISO }) {
  const calendarId = calendarioDaAba(aba);
  if (!calendarId) throw new Error(`Calendário não configurado para ${aba}`);
  const sheets = sheetsClient();
  const [calendarDates, sheetDates] = await Promise.all([
    busyDatesFromCalendar(calendarId, minISO, maxISO),
    pendingDatesFromSheet(sheets, aba, minISO, maxISO)
  ]);
  return new Set([...calendarDates, ...sheetDates]);
}

module.exports = {
  ABAS,
  DURACAO_MINUTOS,
  FUSO,
  abaDaCidade,
  calendarioDaAba,
  normalizar,
  normalizarTamanho,
  parseData,
  parseHorario,
  somarMinutos,
  googleAuth,
  sheetsClient,
  calendarClient,
  disponibilidade
};
