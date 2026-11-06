document.addEventListener('DOMContentLoaded', () => {
    // 1. Matrix Background Canvas
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンБГДЖИЛЦЧШЩЪЫЬ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/=<>#%';
    const charArray = chars.split('');
    const fontSize = 16;
    let columns = 0;
    let drops = [];
    let totalDocHeight = 0;
    let matrixPhase = 'idle';
    let isFinishing = false;
    let animFrameId = null;
    let finishingTimer = null;
    let dimmingTimer = null;
    let maxRainSafetyTimer = null;
    let pinkTimeout = null;
    let lastTime = 0;
    function getRandomDuration() {
      return 1000 + Math.random() * 3000;
    }
    function resizeCanvas() {
      const fullHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight,
        window.innerHeight
      );
      totalDocHeight = fullHeight;
      canvas.width = window.innerWidth;
      canvas.height = totalDocHeight;
      columns = Math.max(1, Math.floor(canvas.width / fontSize));
      drops = [];
      for (let i = 0; i < columns; i++) {
        const durationMs = getRandomDuration();
        drops.push({
          y: Math.random() * totalDocHeight,
          durationMs: durationMs,
          speed: totalDocHeight / durationMs,
          finished: false
        });
      }
      drawStationaryIdle();
    }
    function drawStationaryIdle() {
      if (!ctx) return;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSize + 'px monospace';
      ctx.fillStyle = '#222222';
      for (let x = 0; x < columns; x++) {
        const maxRows = Math.floor(totalDocHeight / fontSize);
        for (let y = 0; y < maxRows; y += 2) {
          if (Math.random() > 0.45) {
            const text = charArray[Math.floor(Math.random() * charArray.length)];
            ctx.fillText(text, x * fontSize, y * fontSize);
          }
        }
      }
    }
    function startDimming() {
      matrixPhase = 'dimming';
      if (dimmingTimer) clearTimeout(dimmingTimer);
      if (maxRainSafetyTimer) clearTimeout(maxRainSafetyTimer);
      dimmingTimer = setTimeout(() => {
        matrixPhase = 'idle';
        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
        drawStationaryIdle();
      }, 1800);
    }
    function matrixLoop(timestamp) {
      if (!ctx) return;
      const now = timestamp || performance.now();
      if (!lastTime) lastTime = now;
      const deltaMs = Math.min(100, Math.max(0, now - lastTime));
      lastTime = now;
      if (matrixPhase === 'raining') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = fontSize + 'px monospace';
        ctx.fillStyle = '#39FF14';
        let allDropsCompleted = true;
        for (let i = 0; i < drops.length; i++) {
          const drop = drops[i];
          if (drop.finished) {
            continue;
          }
          allDropsCompleted = false;
          const text = charArray[Math.floor(Math.random() * charArray.length)];
          const x = i * fontSize;
          const drawY = Math.floor(drop.y / fontSize) * fontSize;
          if (drop.y >= 0 && drop.y <= totalDocHeight + fontSize) {
            ctx.fillText(text, x, drawY);
          }
          drop.y += drop.speed * deltaMs;
          if (drop.y > totalDocHeight) {
            if (!isFinishing) {
              const newDuration = getRandomDuration();
              drop.durationMs = newDuration;
              drop.speed = totalDocHeight / newDuration;
              drop.y = -Math.random() * (fontSize * 4);
            } else {
              drop.finished = true;
            }
          }
        }
        if (isFinishing && allDropsCompleted) {
          startDimming();
          return;
        }
        animFrameId = requestAnimationFrame(matrixLoop);
      } else if (matrixPhase === 'dimming') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        animFrameId = requestAnimationFrame(matrixLoop);
      }
    }
    function triggerMatrixRain() {
      if (dimmingTimer) {
        clearTimeout(dimmingTimer);
        dimmingTimer = null;
      }
      if (matrixPhase !== 'raining') {
        matrixPhase = 'raining';
        for (let i = 0; i < drops.length; i++) {
          const durationMs = getRandomDuration();
          drops[i] = {
            y: -Math.random() * (fontSize * 8),
            durationMs: durationMs,
            speed: totalDocHeight / durationMs,
            finished: false
          };
        }
      }
      isFinishing = false;
      lastTime = performance.now();
      if (finishingTimer) clearTimeout(finishingTimer);
      if (maxRainSafetyTimer) clearTimeout(maxRainSafetyTimer);
      finishingTimer = setTimeout(() => {
        isFinishing = true;
        maxRainSafetyTimer = setTimeout(() => {
          if (matrixPhase === 'raining') {
            drops.forEach(d => { d.finished = true; });
            startDimming();
          }
        }, 4500);
      }, 800);
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(matrixLoop);
      }
    }
    function onUserInteraction() {
      const root = document.documentElement;
      root.classList.add('neon-pink', 'glitch-page');
      if (pinkTimeout) clearTimeout(pinkTimeout);
      pinkTimeout = setTimeout(() => {
        root.classList.remove('neon-pink', 'glitch-page');
      }, 420);
      triggerMatrixRain();
    }
    window.addEventListener('pointerdown', onUserInteraction, { passive: true });
    window.addEventListener('scroll', onUserInteraction, { passive: true });
    window.addEventListener('resize', () => {
      resizeCanvas();
    });
    resizeCanvas();

    // 2. Glitch Text on Hero H1
    const heroH1 = document.getElementById('heroH1');
    function scheduleHeroGlitch() {
      const delay = 4000 + Math.random() * 8000;
      setTimeout(() => {
        if (heroH1) {
          heroH1.classList.add('glitch-text-active');
          setTimeout(() => {
            heroH1.classList.remove('glitch-text-active');
            scheduleHeroGlitch();
          }, 400);
        }
      }, delay);
    }
    setTimeout(() => {
      if (heroH1) {
        heroH1.classList.add('glitch-text-active');
        setTimeout(() => {
          heroH1.classList.remove('glitch-text-active');
          scheduleHeroGlitch();
        }, 400);
      }
    }, 2500);

    // 3. City Selection
    const cityCards = document.querySelectorAll('.city-card');
    const cidadeSelo = document.getElementById('cidadeSelo');
    let currentCity = null;

    // 3b. Calendário sempre aberto (sem campo de digitação)
    const dataInput = document.getElementById('data'); // campo oculto com o valor AAAA-MM-DD
    const horarioInput = document.getElementById('horario');
    const calendarioEl = document.getElementById('calendarioData');
    const calAviso = document.getElementById('calAviso');
    const calTitulo = document.getElementById('calTitulo');
    const calGrid = document.getElementById('calGrid');
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    let calMinISO = null;
    let calMaxISO = null;
    let calMinKey = 0;
    let calMaxKey = 0;
    let calViewYear = 0;
    let calViewMonth = 0;
    let diasIndisponiveis = new Set();
    let intervalosOcupados = [];
    let carregandoDisponibilidade = false;

    function toISO(dt) {
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    function parseISO(texto) {
      const [y, m, d] = texto.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    function chaveMes(ano, mes) {
      return ano * 12 + mes;
    }

    function intervalosDaEscolha(dataISO, hora, tamanho) {
      const duracoes = { P: 120, M: 240, G: 360 };
      const duracao = duracoes[tamanho];
      if (!dataISO || !hora || !duracao) return [];
      const inicio = new Date(`${dataISO}T${hora}:00-03:00`);
      const fim = new Date(inicio.getTime() + duracao * 60000);
      const inicioMin = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
      const sobra = Math.max(0, inicioMin + duracao - 1440);
      const intervalos = [{ start: inicio, end: fim }];
      if (sobra > 0) {
        const diaSeguinte = new Date(`${dataISO}T12:00:00-03:00`);
        diaSeguinte.setDate(diaSeguinte.getDate() + 1);
        const dataSeguinte = `${diaSeguinte.getFullYear()}-${String(diaSeguinte.getMonth() + 1).padStart(2, '0')}-${String(diaSeguinte.getDate()).padStart(2, '0')}`;
        intervalos.push({ start: new Date(`${dataSeguinte}T08:00:00-03:00`), end: new Date(new Date(`${dataSeguinte}T08:00:00-03:00`).getTime() + sobra * 60000) });
      }
      return intervalos;
    }

    function horarioConflita(dataISO, hora) {
      if (!selectedSize?.code) return false;
      const folgaMs = 60 * 60000;
      return intervalosDaEscolha(dataISO, hora, selectedSize.code).some(escolhido =>
        intervalosOcupados.some(ocupado => {
          const ocupadoInicio = new Date(ocupado.start);
          const ocupadoFim = new Date(new Date(ocupado.end).getTime() + folgaMs);
          const escolhidoFim = new Date(escolhido.end.getTime() + folgaMs);
          return escolhido.start < ocupadoFim && escolhidoFim > ocupadoInicio;
        })
      );
    }

    function atualizarHorariosDisponiveis() {
      if (!horarioInput) return;
      Array.from(horarioInput.options).forEach(option => {
        if (!option.value) return;
        const bloqueado = Boolean(dataInput.value && selectedSize?.code && horarioConflita(dataInput.value, option.value));
        option.disabled = bloqueado;
        option.title = bloqueado ? 'Conflita com outro agendamento' : '';
      });
      if (horarioInput.selectedOptions[0]?.disabled) horarioInput.value = '';
    }

    function renderCalendario() {
      if (!calMinISO) return;
      calTitulo.textContent = `${MESES[calViewMonth]} ${calViewYear}`;
      calGrid.innerHTML = '';
      const hoje = toISO(new Date());
      const primeiroDia = new Date(calViewYear, calViewMonth, 1).getDay();
      const diasNoMes = new Date(calViewYear, calViewMonth + 1, 0).getDate();
      for (let i = 0; i < primeiroDia; i++) {
        const vazio = document.createElement('span');
        calGrid.appendChild(vazio);
      }
      for (let dia = 1; dia <= diasNoMes; dia++) {
        const iso = toISO(new Date(calViewYear, calViewMonth, dia));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-dia';
        btn.textContent = dia;
        btn.setAttribute('aria-label', `${dia} de ${MESES[calViewMonth]}`);
        if (iso < calMinISO || iso > calMaxISO || diasIndisponiveis.has(iso)) {
          btn.disabled = true;
          if (diasIndisponiveis.has(iso)) {
            btn.classList.add('cal-indisponivel');
            btn.title = 'Dia indisponível';
          }
        }
        if (iso === hoje) {
          btn.classList.add('cal-hoje');
        }
        if (iso === dataInput.value) {
          btn.classList.add('cal-selecionado');
        }
        btn.addEventListener('click', () => {
          dataInput.value = iso;
          atualizarHorariosDisponiveis();
          renderCalendario();
        });
        calGrid.appendChild(btn);
      }
      const chaveAtual = chaveMes(calViewYear, calViewMonth);
      calPrev.disabled = chaveAtual <= calMinKey;
      calNext.disabled = chaveAtual >= calMaxKey;
    }

    function mudarMes(delta) {
      const d = new Date(calViewYear, calViewMonth + delta, 1);
      calViewYear = d.getFullYear();
      calViewMonth = d.getMonth();
      renderCalendario();
    }

    async function configurarCalendario(min, max) {
      calMinISO = min;
      diasIndisponiveis = new Set();
      intervalosOcupados = [];
      calMaxISO = max;
      const inicio = parseISO(min);
      const fim = parseISO(max);
      calMinKey = chaveMes(inicio.getFullYear(), inicio.getMonth());
      calMaxKey = chaveMes(fim.getFullYear(), fim.getMonth());
      calViewYear = inicio.getFullYear();
      calViewMonth = inicio.getMonth();
      if (dataInput.value && (dataInput.value < min || dataInput.value > max)) {
        dataInput.value = '';
      }
      calAviso.style.display = 'none';
      calendarioEl.style.display = 'block';
      renderCalendario();
      carregandoDisponibilidade = true;
      try {
        const resposta = await fetch(`/api/disponibilidade?cidade=${encodeURIComponent(abaDaCidadeAtual())}&min=${min}&max=${max}`);
        const retorno = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(retorno.detail || retorno.error || 'Falha na disponibilidade');
        diasIndisponiveis = new Set(retorno.indisponiveis || []);
        intervalosOcupados = Array.isArray(retorno.ocupados) ? retorno.ocupados : [];
        renderCalendario();
        atualizarHorariosDisponiveis();
      } catch (erro) {
        console.error('Falha ao consultar disponibilidade:', erro);
        calAviso.textContent = 'Não foi possível consultar os dias disponíveis. Tente novamente.';
        calAviso.style.display = 'block';
        calendarioEl.style.display = 'none';
      } finally {
        carregandoDisponibilidade = false;
      }
    }

    function abaDaCidadeAtual() {
      return currentCity ? currentCity.aba : '';
    }

    calPrev.addEventListener('click', () => mudarMes(-1));
    calNext.addEventListener('click', () => mudarMes(1));

    cityCards.forEach(card => {
      card.addEventListener('click', () => {
        cityCards.forEach(c => c.classList.remove('is-active'));
        card.classList.add('is-active');
        const nome = card.dataset.city;
        const aba = card.dataset.aba;
        const min = card.dataset.min;
        const max = card.dataset.max;
        const label = card.dataset.label;
        currentCity = { nome, aba, min, max, label };
        configurarCalendario(min, max);
        if (cidadeSelo) {
          cidadeSelo.textContent = `Agendamento — ${nome}`;
          cidadeSelo.style.display = 'inline-block';
        }
        const targetSection = document.getElementById('agendar');
        if (targetSection) {
          targetSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // 4. Tattoo Size Selection
    const sizeCards = document.querySelectorAll('.size-card');
    const precoTamanho = document.getElementById('precoTamanho');
    const tabelaPrecos = {
      'Pequena até 6 cm': 'Preços entre R$140 a R$200 reais',
      'Média até 12 cm ou pequena e complexa': 'Preços entre R$200 a R$500',
      'Grande acima de 12 cm ou média e complexa': 'Preços entre R$500 a R$20.000'
    };
    let selectedSize = null;
    sizeCards.forEach(card => {
      card.addEventListener('click', () => {
        sizeCards.forEach(c => {
          c.classList.remove('is-active');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('is-active');
        card.setAttribute('aria-checked', 'true');
        const desc = card.dataset.sizeDesc || '';
        selectedSize = { desc, code: card.dataset.sizeCode || '' };
        atualizarHorariosDisponiveis();
        if (precoTamanho) {
          const textoPreco = tabelaPrecos[desc];
          if (textoPreco) {
            precoTamanho.textContent = textoPreco;
            precoTamanho.style.display = 'block';
          } else {
            precoTamanho.style.display = 'none';
          }
        }
      });
    });

    // 5. Pagamento do sinal, gravação na planilha e WhatsApp
    const form = document.getElementById('agendamentoForm');
    const errosDiv = document.getElementById('erros');
    const btnPix = document.getElementById('btnPix');
    const btnCartao = document.getElementById('btnCartao');
    const paymentBrickContainer = document.getElementById('paymentBrickContainer');
    const pixResultado = document.getElementById('pixResultado');
    const pixQrCode = document.getElementById('pixQrCode');
    const pixCopiaCola = document.getElementById('pixCopiaCola');
    const btnCopiarPix = document.getElementById('btnCopiarPix');
    const MP_PUBLIC_KEY = 'APP_USR-def0f305-44e1-4730-8541-ea45aa015bb5';
    let paymentBrickController = null;
    let paymentProcessadoId = null;
    let cartaoIdempotencyKey = null;
    const linhaConfirmado = document.getElementById('linhaConfirmado');
    const btnEnviar = document.getElementById('btnEnviar');
    const btnFlutuante = document.getElementById('btnFlutuante');
    const WHATSAPP_URL = 'https://wa.me/5547997772172';
    let estadoPagamento = 'pendente'; // 'pendente' | 'aguardando' | 'confirmado'
    let codigoPagamento = '';
    let fotosPendentes = [];
    let agendamentoId = null;
    let processando = false;

    function getFormData() {
      return {
        nomeVal: (document.getElementById('nome')?.value || '').trim(),
        emailVal: (document.getElementById('email')?.value || '').trim(),
        telVal: (document.getElementById('telefone')?.value || '').trim(),
        dataVal: (dataInput?.value || '').trim(),
        horarioVal: (document.getElementById('horario')?.value || '').trim(),
        tatuagemVal: (document.getElementById('tatuagem')?.value || '').trim(),
        duvidasVal: (document.getElementById('duvidas')?.value || '').trim(),
        recomendacaoVal: (document.getElementById('recomendacao')?.value || '').trim(),
        fotosInput: document.getElementById('fotos')
      };
    }

    function validateFormData(data) {
      const erros = [];
      if (!currentCity) {
        erros.push('Selecione uma cidade para agendar.');
      }
      if (!data.nomeVal || !data.emailVal || !data.telVal || !data.tatuagemVal) {
        erros.push('Preencha os campos obrigatórios.');
      }
      if (!data.dataVal) {
        erros.push('Escolha uma data no calendário.');
      } else if (currentCity && (data.dataVal < currentCity.min || data.dataVal > currentCity.max)) {
        erros.push(`Agendamentos para ${currentCity.nome} apenas entre ${currentCity.label}.`);
      }
      if (!data.horarioVal) {
        erros.push('Escolha um horário.');
      }
      if (!selectedSize) {
        erros.push('Escolha o tamanho da tatuagem.');
      }
      return erros;
    }

    function formatarDataBR(valor) {
      if (!valor || !valor.includes('-')) return valor || '';
      const partes = valor.split('-');
      return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
    }

    function mostrarErros(erros) {
      if (!errosDiv) return;
      if (erros.length === 0) {
        errosDiv.style.display = 'none';
        errosDiv.innerHTML = '';
        return;
      }
      errosDiv.innerHTML = erros.map(msg => `<div>• ${msg}</div>`).join('');
      errosDiv.style.display = 'block';
      errosDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

   function atualizarBotaoFlutuante() {
      if (!btnFlutuante) return;
      if (estadoPagamento === 'confirmado') {
        btnFlutuante.textContent = 'AGENDAR PELO WHATSAPP';
      } else if (estadoPagamento === 'aguardando') {
        btnFlutuante.textContent = 'AGUARDANDO PAGAMENTO';
      } else {
        btnFlutuante.textContent = 'PAGAR SINAL';
      }
    }
    // Grava as fotos enviadas na pasta do google drive 
    function comprimirImagem(file, maxLado = 1280, qualidade = 0.8) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('Não foi possível processar a foto')),
            'image/jpeg',
            qualidade
          );
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Formato de foto não suportado. Use JPG ou PNG.'));
        };
        img.src = url;
      });
    }
  
  function blobParaBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  const LIMITE_TOTAL_BASE64 = 3800000;

  async function prepararFotos(inputFotos) {
    const arquivos = Array.from(inputFotos?.files || []).slice(0, 10);
    if (arquivos.length === 0) return [];
  
    // Começa com qualidade alta. Se o total passar do limite, tenta versões menores.
    const niveis = [
      { maxLado: 1600, qualidade: 0.8 },
      { maxLado: 1280, qualidade: 0.7 },
      { maxLado: 1024, qualidade: 0.6 }
    ];
  
    for (const nivel of niveis) {
      const fotos = [];
      let total = 0;
  
      for (const file of arquivos) {
        const blob = await comprimirImagem(file, nivel.maxLado, nivel.qualidade);
        const base64 = await blobParaBase64(blob);
        total += base64.length;
        fotos.push({
          name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
          mimeType: 'image/jpeg',
          base64
        });
      }
  
      if (total <= LIMITE_TOTAL_BASE64) return fotos;
    }
  
    throw new Error('As fotos ainda ficaram grandes. Envie menos fotos ou fotos menores.');
    return fotos;
  }
    // Grava o agendamento na planilha com status "aguardando_pagamento"
   // Grava somente o agendamento na planilha; as fotos ficam em memória até o pagamento aprovado.
    async function salvarNaPlanilha(data) {
      const fotos = await prepararFotos(data.fotosInput);
      fotosPendentes = fotos;
    
      const resposta = await fetch('/api/create-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cidade: currentCity ? currentCity.aba : '',
          nome: data.nomeVal,
          email: data.emailVal,
          whatsapp: data.telVal,
          data: data.dataVal,
          horario: data.horarioVal,
          tatuagem: data.tatuagemVal,
          tamanho: selectedSize ? selectedSize.code : '',
          duvidas: data.duvidasVal,
          recomendacao: data.recomendacaoVal
        })
      });
    
      const retorno = await resposta.json().catch(() => ({}));
      return { ok: resposta.ok && retorno.ok === true, id: retorno.id, erro: retorno.error || retorno.detalhe };
    }

    async function enviarFotosDepoisDoPagamento() {
      if (!fotosPendentes.length || !agendamentoId || !currentCity) return true;
      try {
        const resposta = await fetch('/api/upload-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idAgendamento: agendamentoId, cidade: currentCity.aba, fotos: fotosPendentes })
        });
        const retorno = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !retorno.ok) throw new Error(retorno.error || 'Falha ao enviar fotos');
        fotosPendentes = [];
        return true;
      } catch (erro) {
        console.error('Falha no envio pós-pagamento:', erro);
        mostrarErros([`Pagamento confirmado, mas as fotos não foram enviadas: ${erro.message}`]);
        return false;
      }
    }

    async function garantirAgendamentoSalvo(data) {
      if (agendamentoId) return true;
      const resultado = await salvarNaPlanilha(data);
      if (!resultado.ok) {
        console.error('Falha ao salvar agendamento:', resultado.erro);
        alert('Não foi possível salvar seu agendamento. Tente novamente.');
        return false;
      }
      agendamentoId = resultado.id;
      sessionStorage.setItem('bookingContext', JSON.stringify({ id: agendamentoId, cidade: currentCity.aba }));
      return true;
    }

    async function confirmarPagamento(orderId, silencioso = false) {
      if (!agendamentoId || !currentCity) {
        mostrarErros(['Salve o agendamento antes de confirmar o pagamento.']);
        return false;
      }
      try {
        const resposta = await fetch('/api/confirmar-agendamento', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idAgendamento: agendamentoId, orderId, cidade: currentCity.aba })
        });
        const retorno = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !retorno.ok) {
          if (!silencioso) mostrarErros([retorno.error || 'Pagamento ainda não aprovado.']);
          return false;
        }
        estadoPagamento = 'confirmado'; codigoPagamento = orderId;
        if (paymentBrickController) paymentBrickController.unmount();
        if (paymentBrickContainer) paymentBrickContainer.style.display = 'none';
        if (pixResultado) pixResultado.style.display = 'none';
        if (linhaConfirmado) {
          linhaConfirmado.textContent = '✅ Pagamento confirmado e horário criado na agenda.';
          linhaConfirmado.style.display = 'block';
        }
        if (btnPix) { btnPix.textContent = '✅ SINAL PAGO'; btnPix.disabled = true; btnPix.classList.add('btn-desabilitado'); }
        if (btnCartao) { btnCartao.textContent = '✅ SINAL PAGO'; btnCartao.disabled = true; btnCartao.classList.add('btn-desabilitado'); }
        if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.classList.remove('btn-desabilitado'); }
        await enviarFotosDepoisDoPagamento();
        atualizarBotaoFlutuante();
        return true;
      } catch (erro) {
        if (!silencioso) mostrarErros(['Falha ao confirmar pagamento.']);
        return false;
      }
    }

    function liberarPagamentoParaNovaTentativa() {
      estadoPagamento = 'pendente';
      codigoPagamento = '';
      paymentProcessadoId = null;
      cartaoIdempotencyKey = null;
      if (pixResultado) pixResultado.style.display = 'none';
      if (pixQrCode) {
        pixQrCode.removeAttribute('src');
        pixQrCode.style.display = 'none';
      }
      if (pixCopiaCola) pixCopiaCola.value = '';
      if (btnPix) {
        btnPix.textContent = 'PAGAR COM PIX R$50';
        btnPix.disabled = false;
        btnPix.classList.remove('btn-desabilitado');
      }
      if (btnCartao) {
        btnCartao.disabled = false;
        btnCartao.classList.remove('btn-desabilitado');
      }
      if (paymentBrickController && paymentBrickContainer) paymentBrickContainer.style.display = 'block';
      atualizarBotaoFlutuante();
    }

    async function acompanharPagamento(orderId) {
      const inicio = Date.now();
      const limite = 35 * 60 * 1000;
      while (Date.now() - inicio < limite && estadoPagamento !== 'confirmado') {
        await new Promise(resolve => setTimeout(resolve, 5000));
        try {
          const resposta = await fetch(`/api/order-status?id=${encodeURIComponent(orderId)}`);
          const status = await resposta.json();
          if (status.status === 'approved') {
            await confirmarPagamento(orderId, true);
            break;
          }
          if (status.status === 'rejected' || status.status === 'cancelled') {
            liberarPagamentoParaNovaTentativa();
            mostrarErros(['O Mercado Pago recusou ou cancelou o pagamento.']);
            break;
          }
        } catch (erro) { console.warn('Aguardando status do pagamento:', erro); }
      }
      if (estadoPagamento === 'aguardando') {
        liberarPagamentoParaNovaTentativa();
        mostrarErros(['O prazo de confirmação terminou. Se o Pix expirou, escolha o horário novamente para gerar outro.']);
      }
    }

    async function iniciarPaymentBrick(data) {
      if (!window.MercadoPago) throw new Error('SDK do Mercado Pago não carregou');
      if (paymentBrickController) paymentBrickController.unmount();
      paymentBrickContainer.innerHTML = '';
      paymentBrickContainer.style.display = 'block';
      const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      paymentBrickController = await bricksBuilder.create('cardPayment', 'paymentBrickContainer', {
        initialization: { amount: 50 },
        callbacks: {
          onReady: () => { if (btnCartao) btnCartao.style.display = 'none'; },
          onSubmit: async (formData, additionalData) => {
            try {
              const resposta = await fetch('/api/create-order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  idAgendamento: agendamentoId,
                  idempotencyKey: cartaoIdempotencyKey || (cartaoIdempotencyKey = `${agendamentoId}-cartao-${window.crypto?.randomUUID?.() || Date.now()}`),
                  formData,
                  paymentTypeId: additionalData?.paymentTypeId,
                  payer: { email: formData.payer?.email || data.emailVal, identification: formData.payer?.identification }
                })
              });
              const order = await resposta.json().catch(() => ({}));
              if (!resposta.ok || !order.ok) throw new Error(order.detail || order.error || `Erro HTTP ${resposta.status}`);
              paymentProcessadoId = order.orderId;
              estadoPagamento = 'aguardando';
              if (order.status === 'approved' || order.status === 'processed' || order.status === 'accredited') await confirmarPagamento(order.orderId);
              else acompanharPagamento(order.orderId);
            } catch (erro) {
              mostrarErros([`Mercado Pago: ${erro.message || 'não foi possível processar o cartão'}`]);
              throw erro;
            }
          },
          onError: (erro) => {
            console.error('Card Payment Brick:', erro);
            mostrarErros([`Mercado Pago: ${erro?.message || 'não foi possível carregar o pagamento'}`]);
          }
        }
      });
    }
    async function iniciarPagamento() {
      if (processando || estadoPagamento === 'confirmado') return;
      const data = getFormData();
      const erros = validateFormData(data);
      mostrarErros(erros);
      if (erros.length > 0) return;
      processando = true;
      try {
        if (!await garantirAgendamentoSalvo(data)) return;
        await iniciarPaymentBrick(data);
      } catch (erro) {
        console.error(erro); mostrarErros([erro.message || 'Não foi possível abrir o pagamento.']);
      } finally { processando = false; }
    }

    async function iniciarPix() {
      if (processando || estadoPagamento === 'confirmado') return;
      const data = getFormData();
      const erros = validateFormData(data);
      mostrarErros(erros);
      if (erros.length > 0) return;
      processando = true;
      try {
        if (!await garantirAgendamentoSalvo(data)) return;
        const resposta = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idAgendamento: agendamentoId, paymentMethodId: 'pix', payer: { email: data.emailVal }, idempotencyKey: `${agendamentoId}-pix-${window.crypto?.randomUUID?.() || Date.now()}` })
        });
        const pagamentoPix = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !pagamentoPix.ok) throw new Error(pagamentoPix.detail || pagamentoPix.error || `Erro HTTP ${resposta.status}`);
        paymentProcessadoId = pagamentoPix.orderId;
        estadoPagamento = 'aguardando';
        if (pagamentoPix.pix?.qrCodeBase64) {
          pixQrCode.src = `data:image/png;base64,${pagamentoPix.pix.qrCodeBase64}`;
          pixQrCode.style.display = 'block';
        }
        pixCopiaCola.value = pagamentoPix.pix?.qrCode || '';
        pixResultado.style.display = 'block';
        if (btnPix) { btnPix.textContent = '⏳ AGUARDANDO PIX'; btnPix.disabled = true; btnPix.classList.add('btn-desabilitado'); }
        if (paymentBrickContainer) paymentBrickContainer.style.display = 'none';
        acompanharPagamento(paymentProcessadoId);
      } catch (erro) {
        console.error('Pix API:', erro);
        mostrarErros([`Mercado Pago: ${erro.message || 'não foi possível criar o Pix'}`]);
      } finally { processando = false; }
    }

    function abrirWhatsApp() {
      const data = getFormData();
      const erros = validateFormData(data);
      mostrarErros(erros);
      if (erros.length > 0) return;
      const mensagem = [
        `Olá Bene, paguei o sinal de R$50 (código ${codigoPagamento}) e quero confirmar meu agendamento.`,
        '',
        `📍 Cidade: ${currentCity.nome}`,
        `📅 Data: ${formatarDataBR(data.dataVal)}`,
        `⏰ Horário: ${data.horarioVal}`,
        `👤 Nome: ${data.nomeVal}`,
        `🎨 Tatuagem e Local: ${data.tatuagemVal}`,
        `🆔 Agendamento: ${agendamentoId || 'não registrado'}`
      ].join('\n');
      window.open(WHATSAPP_URL + '?text=' + encodeURIComponent(mensagem), '_blank', 'noopener,noreferrer');
    }

    // Pix direto pela Orders API
    if (btnPix) {
      btnPix.addEventListener('click', iniciarPix);
    }
    // Cartão pelo Payment Brick
    if (btnCartao) {
      btnCartao.addEventListener('click', iniciarPagamento);
    }


    if (btnCopiarPix) {
      btnCopiarPix.addEventListener('click', async () => {
        await navigator.clipboard.writeText(pixCopiaCola.value);
        btnCopiarPix.textContent = 'COPIADO';
        setTimeout(() => { btnCopiarPix.textContent = 'COPIAR PIX'; }, 1800);
      });
    }

    // Caixa flutuante: 1) paga o sinal  2) após confirmação, abre o WhatsApp
    if (btnFlutuante) {
      btnFlutuante.addEventListener('click', () => {
        if (estadoPagamento === 'confirmado') {
          abrirWhatsApp();
        } else {
          iniciarPix();
        }
      });
    }

    // Botão "ENVIAR AGENDAMENTO" (liberado após a confirmação do pagamento)
    if (btnEnviar) {
      btnEnviar.addEventListener('click', () => {
        if (estadoPagamento !== 'confirmado') return;
        abrirWhatsApp();
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
      });
    }

    // Restaura o ID e a cidade quando o Mercado Pago retorna para o site.
    try {
      const contexto = JSON.parse(sessionStorage.getItem('bookingContext') || 'null');
      if (contexto?.id) {
        agendamentoId = contexto.id;
        const card = Array.from(cityCards).find(item => item.dataset.aba === contexto.cidade);
        if (card) card.click();
      }
    } catch (err) {
      console.warn('Não foi possível restaurar o agendamento:', err);
    }

  });
