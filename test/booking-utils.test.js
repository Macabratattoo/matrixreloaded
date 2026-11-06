const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FOLGA_MINUTOS,
  DURACOES_MINUTOS,
  intervalosDoAgendamento,
  intervaloComoDatas,
  intervaloComoDatasComFolga,
  intervalosConflitam,
  agendamentoAtivo
} = require('../api/_booking-utils');

function atendimento(data, hora, tamanho) {
  return intervalosDoAgendamento(data, hora, tamanho).intervalos[0];
}

function ocupacao(dataInicio, horaInicio, dataFim, horaFim, origem = 'calendar') {
  return {
    start: `${dataInicio}T${horaInicio}:00-03:00`,
    end: `${dataFim}T${horaFim}:00-03:00`,
    origem
  };
}

test('mantém as durações oficiais P, M e G', () => {
  assert.deepEqual(DURACOES_MINUTOS, { P: 120, M: 240, G: 360 });
  assert.equal(intervalosDoAgendamento('2026-12-10', '10:00', 'P').duracao, 120);
  assert.equal(intervalosDoAgendamento('2026-12-10', '10:00', 'M').duracao, 240);
  assert.equal(intervalosDoAgendamento('2026-12-10', '10:00', 'G').duracao, 360);
});

test('expõe uma janela de verificação com uma hora antes e depois', () => {
  assert.equal(FOLGA_MINUTOS, 60);
  const intervalo = atendimento('2026-12-10', '14:00', 'P');
  const janela = intervaloComoDatasComFolga(intervalo);
  assert.equal(janela.start, '2026-12-10T16:00:00.000Z');
  assert.equal(janela.end, '2026-12-10T20:00:00.000Z');
});

test('um novo atendimento no mesmo horário ou dentro da folga conflita', () => {
  const existente = ocupacao('2026-12-10', '14:00', '2026-12-10', '16:00');
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '16:00', 'P'), existente), true);
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '16:30', 'P'), existente), true);
});

test('o horário exatamente uma hora após o término fica liberado', () => {
  const existente = ocupacao('2026-12-10', '14:00', '2026-12-10', '16:00');
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '17:00', 'P'), existente), false);
});

test('evento com horário específico bloqueia somente os horários que encavalam', () => {
  const existente = ocupacao('2026-12-10', '17:00', '2026-12-10', '20:00');
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '14:00', 'P'), existente), false);
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '14:30', 'P'), existente), true);
  assert.equal(intervalosConflitam(atendimento('2026-12-10', '21:00', 'P'), existente), false);
});

test('evento de dia inteiro bloqueia qualquer atendimento dentro do dia', () => {
  const diaInteiro = ocupacao('2026-12-13', '00:00', '2026-12-14', '00:00');
  assert.equal(intervalosConflitam(atendimento('2026-12-13', '08:00', 'P'), diaInteiro), true);
  assert.equal(intervalosConflitam(atendimento('2026-12-13', '20:00', 'P'), diaInteiro), true);
});

test('calcula corretamente atendimento que atravessa a meia-noite', () => {
  const calculo = intervalosDoAgendamento('2026-12-10', '22:00', 'M');
  assert.equal(calculo.sobra, 120);
  assert.equal(calculo.intervalos[0].dataFim, '2026-12-11');
  assert.equal(calculo.intervalos[0].horaFim, '02:00');
  assert.deepEqual(calculo.intervalos[1], {
    tipo: 'bloqueio_sobra',
    dataInicio: '2026-12-11',
    horaInicio: '08:00',
    dataFim: '2026-12-11',
    horaFim: '10:00'
  });
});

test('reserva pendente dentro do prazo bloqueia e reserva expirada libera', () => {
  const agora = Date.parse('2026-12-10T12:00:00-03:00');
  const ativa = ['', 'AG-1', '', '', 'aguardando_pagamento', '', '', '', '', '', '', '', '', '', '', '', '2026-12-10T11:40:00-03:00'];
  const expirada = ['', 'AG-2', '', '', 'aguardando_pagamento', '', '', '', '', '', '', '', '', '', '', '', '2026-12-10T10:00:00-03:00'];
  const confirmada = ['', 'AG-3', '', '', 'confirmado'];
  assert.equal(agendamentoAtivo(ativa, agora), true);
  assert.equal(agendamentoAtivo(expirada, agora), false);
  assert.equal(agendamentoAtivo(confirmada, agora), true);
});

test('converte intervalos do agendamento no formato usado pelo Calendar', () => {
  const intervalo = atendimento('2026-12-10', '17:00', 'P');
  assert.deepEqual(intervaloComoDatas(intervalo), {
    start: '2026-12-10T17:00:00-03:00',
    end: '2026-12-10T19:00:00-03:00'
  });
});
