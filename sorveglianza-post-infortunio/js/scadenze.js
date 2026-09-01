window.ST_MILESTONES = [
  {
    id: 'tempo_zero',
    label: 'Tempo zero',
    previstaKey: null,
    effettivaKey: 'data_esami_tempo_zero',
    offsetDays: 0
  },
  {
    id: '45_giorni',
    label: '45 giorni',
    previstaKey: 'data_prevista_45gg',
    effettivaKey: 'data_effettiva_45gg',
    offsetDays: 45
  },
  {
    id: '3_mesi',
    label: '3 mesi',
    previstaKey: 'data_prevista_3m',
    effettivaKey: 'data_effettiva_3m',
    offsetMonths: 3
  },
  {
    id: '6_mesi',
    label: '6 mesi',
    previstaKey: 'data_prevista_6m',
    effettivaKey: 'data_effettiva_6m',
    offsetMonths: 6
  }
];

window.STScadenze = (function () {
  function parseISO(value) {
    if (!value) return null;
    const parts = String(value).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function todayISO() {
    return formatISO(new Date());
  }

  function addDays(iso, days) {
    const d = parseISO(iso);
    if (!d) return '';
    d.setDate(d.getDate() + days);
    return formatISO(d);
  }

  function addMonths(iso, months) {
    const d = parseISO(iso);
    if (!d) return '';
    d.setMonth(d.getMonth() + months);
    return formatISO(d);
  }

  function daysBetween(from, to) {
    const ms = to.getTime() - from.getTime();
    return Math.round(ms / 86400000);
  }

  function calcPrevista(milestone, dataInfortunio) {
    if (!dataInfortunio) return '';
    if (milestone.offsetDays != null) return addDays(dataInfortunio, milestone.offsetDays);
    if (milestone.offsetMonths != null) return addMonths(dataInfortunio, milestone.offsetMonths);
    return '';
  }

  function getPrevista(record, milestone) {
    if (milestone.id === 'tempo_zero') return record.data_infortunio || '';
    return record[milestone.previstaKey] || calcPrevista(milestone, record.data_infortunio);
  }

  function enrichRecord(record, warningDays) {
    const warnDays = warningDays ?? window.ST_CONFIG?.WARNING_DAYS ?? 7;
    const today = parseISO(todayISO());
    const next = { ...record };

    ST_MILESTONES.forEach((m) => {
      if (m.previstaKey) {
        next[m.previstaKey] = calcPrevista(m, next.data_infortunio);
      }
    });

    let prossimaFase = 'completato';
    let prossimaScadenza = '';

    for (const m of ST_MILESTONES) {
      if (next[m.effettivaKey]) continue;
      prossimaFase = m.id;
      prossimaScadenza = getPrevista(next, m);
      break;
    }

    next.prossima_fase = prossimaFase;
    next.prossima_scadenza = prossimaScadenza;

    const milestones = ST_MILESTONES.map((m) => {
      const effettiva = next[m.effettivaKey] || '';
      const prevista = getPrevista(next, m);
      let status = 'programmato';

      if (m.id === 'tempo_zero') {
        status = effettiva ? 'completato' : 'giorno_zero';
      } else if (effettiva) {
        status = 'completato';
      } else if (prevista && today) {
        const prevDate = parseISO(prevista);
        const diff = daysBetween(today, prevDate);
        if (diff < 0) status = 'scaduto';
        else if (diff <= warnDays) status = 'in_scadenza';
        else status = 'programmato';
      } else {
        status = 'in_attesa';
      }

      return {
        id: m.id,
        label: m.label,
        prevista,
        effettiva,
        status,
        effettivaKey: m.effettivaKey,
        previstaKey: m.previstaKey
      };
    });

    const hasScaduto = milestones.some((m) => m.id !== 'tempo_zero' && m.status === 'scaduto');
    const hasInScadenza = milestones.some((m) => m.id !== 'tempo_zero' && m.status === 'in_scadenza');
    const allDone = milestones.every((m) => m.status === 'completato');

    let statoGlobale = 'attivo';
    if (next.stato === 'annullato') statoGlobale = 'annullato';
    else if (allDone) statoGlobale = 'completato';
    else if (hasScaduto) statoGlobale = 'scaduto';
    else if (hasInScadenza) statoGlobale = 'in_scadenza';

    next.stato_calcolato = statoGlobale;
    next.milestones = milestones;
    return next;
  }

  function enrichAll(records) {
    return (records || []).map((r) => enrichRecord(r));
  }

  function formatIT(iso) {
    const d = parseISO(iso);
    if (!d) return '—';
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return {
    parseISO,
    formatISO,
    todayISO,
    addDays,
    addMonths,
    calcPrevista,
    getPrevista,
    enrichRecord,
    enrichAll,
    formatIT
  };
})();
