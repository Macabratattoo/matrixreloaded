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

const FUSO = 'America/Sao_Paulo';
const DURACOES_MINUTOS = { P: 120, M: 240, G: 360 };

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function abaDaCidade(cidade) { return ABAS[normalizar(cidade)] || null; }
function calendarioDaAba(aba) { const env = CALENDAR_ENV_BY_ABA[aba]; return env ? process.env[env] : null; }
function normalizarTamanho(valor) {
  const texto = normalizar(valor);
  if (texto === 'p' || texto.startsWith('pequena')) return 'P';
  if (texto === 'm' || texto.startsWith('media')) return 'M';
  if (texto === 'g' || texto.startsWith('grande')) return 'G';
  return '';
}
function duracaoDoTamanho(valor) { return DURACOES_MINUTOS[normalizarTamanho(valor)] || 0; }
function parseData(valor) {
  const s = String(valor || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const serial = Number(s.replace(',', '.'));
  if (!Number.isNaN(serial) && serial > 1000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
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
function minutosParaHorario(minutos) {
  const n = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function somarMinutos(hora, minutos) { const [h, m] = hora.split(':').map(Number); return minutosParaHorario(h * 60 + m + minutos); }
function dataSeguinte(iso) { const d = new Date(`${iso}T12:00:00-03:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function adicionarDias(iso, dias) { const d = new Date(`${iso}T12:00:00-03:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }
function intervalosDoAgendamento(dataISO, hora, tamanho) {
  const duracao = duracaoDoTamanho(tamanho);
  if (!dataISO || !hora || !duracao) return null;
  const [h, m] = hora.split(':').map(Number);
  const finalAbsoluto = h * 60 + m + duracao;
  const sobra = Math.max(0, finalAbsoluto - 1440);
  const fimData = sobra > 0 ? dataSeguinte(dataISO) : dataISO;
  const intervalos = [{ tipo: 'atendimento', dataInicio: dataISO, horaInicio: hora, dataFim: fimData, horaFim: minutosParaHorario(finalAbsoluto) }];
  if (sobra > 0) intervalos.push({ tipo: 'bloqueio_sobra', dataInicio: dataSeguinte(dataISO), horaInicio: '08:00', dataFim: dataSeguinte(dataISO), horaFim: somarMinutos('08:00', sobra) });
  return { duracao, sobra, intervalos };
}
function intervaloComoDatas(intervalo) {
  return { start: `${intervalo.dataInicio}T${intervalo.horaInicio}:00-03:00`, end: `${intervalo.dataFim}T${intervalo.horaFim}:00-03:00` };
}
function intervalosConflitam(a, b) {
  return new Date(intervaloComoDatas(a).start) < new Date(b.end) && new Date(intervaloComoDatas(a).end) > new Date(b.start);
}
function googleAuth(scopes) { const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); return new google.auth.GoogleAuth({ credentials, scopes }); }
function sheetsClient() { return google.sheets({ version: 'v4', auth: googleAuth(['https://www.googleapis.com/auth/spreadsheets']) }); }
function calendarClient() {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

async function busyIntervalsFromCalendar(calendarId, minISO, maxISO) {
  const calendar = calendarClient();
  const intervalos = [];
  // O Google Calendar rejeita janelas grandes. Consultamos no máximo 30 dias por chamada.
  let inicio = minISO;
  while (inicio <= maxISO) {
    const fim = adicionarDias(inicio, Math.min(29, Math.max(0, Math.round((new Date(`${maxISO}T12:00:00-03:00`) - new Date(`${inicio}T12:00:00-03:00`)) / 86400000))));
    const response = await calendar.freebusy.query({ requestBody: {
      timeMin: `${inicio}T00:00:00-03:00`,
      timeMax: `${dataSeguinte(fim)}T00:00:00-03:00`,
      timeZone: FUSO,
      items: [{ id: calendarId }]
    }});
    const busy = response.data.calendars?.[calendarId]?.busy || [];
    for (const item of busy) {
      const start = item.start || item.startTime;
      const end = item.end || item.endTime;
      if (start && end) intervalos.push({ start, end, origem: 'calendar' });
    }
    inicio = adicionarDias(fim, 1);
  }
  return intervalos;
}

async function pendingIntervalsFromSheet(sheets, aba, minISO, maxISO) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
  const intervalos = [];
  for (const linha of response.data.values || []) {
    const status = normalizar(linha[4]);
    if (status !== 'confirmado') continue;
    const data = parseData(linha[9]);
    const hora = parseHorario(linha[10]);
    const calculo = intervalosDoAgendamento(data, hora, linha[11]);
    if (!calculo) continue;
    for (const intervalo of calculo.intervalos) {
      const fimJanela = `${maxISO}T23:59:59-03:00`;
      const inicioJanela = `${minISO}T00:00:00-03:00`;
      const convertido = intervaloComoDatas(intervalo);
      if (new Date(convertido.end) > new Date(inicioJanela) && new Date(convertido.start) < new Date(fimJanela)) intervalos.push({ ...convertido, origem: 'sheet' });
    }
  }
  return intervalos;
}

function dataTemHorarioLivre(dataISO, ocupados) {
  for (let minutos = 8 * 60; minutos <= 22 * 60; minutos += 30) {
    const hora = minutosParaHorario(minutos);
    for (const tamanho of Object.keys(DURACOES_MINUTOS)) {
      const calculo = intervalosDoAgendamento(dataISO, hora, tamanho);
      if (calculo && !calculo.intervalos.some(i => ocupados.some(o => intervalosConflitam(i, o)))) return true;
    }
  }
  return false;
}

async function disponibilidadeDetalhada({ aba, minISO, maxISO }) {
  const calendarId = calendarioDaAba(aba);
  if (!calendarId) throw new Error(`Calendário não configurado para ${aba}`);
  const sheets = sheetsClient();
  const resultados = await Promise.allSettled([busyIntervalsFromCalendar(calendarId, minISO, maxISO), pendingIntervalsFromSheet(sheets, aba, minISO, maxISO)]);
  const falhas = resultados.map((r, i) => r.status === 'rejected' ? `${i === 0 ? 'Google Calendar' : 'Google Sheets'}: ${r.reason?.message || 'erro desconhecido'}` : null).filter(Boolean);
  if (falhas.length === resultados.length) throw new Error(falhas.join(' | '));
  if (falhas.length) console.error('Disponibilidade parcial:', falhas.join(' | '));
  const ocupados = resultados.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const indisponiveis = [];
  for (let data = minISO; data <= maxISO; data = adicionarDias(data, 1)) if (!dataTemHorarioLivre(data, ocupados)) indisponiveis.push(data);
  return { ocupados, indisponiveis, falhas };
}

async function disponibilidade(args) { return new Set((await disponibilidadeDetalhada(args)).indisponiveis); }

module.exports = {
  ABAS, DURACOES_MINUTOS, FUSO, abaDaCidade, calendarioDaAba, normalizar, normalizarTamanho, duracaoDoTamanho,
  parseData, parseHorario, somarMinutos, dataSeguinte, intervalosDoAgendamento, intervaloComoDatas, intervalosConflitam,
  googleAuth, sheetsClient, calendarClient, disponibilidade, disponibilidadeDetalhada
};
