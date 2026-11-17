'use strict';

(() => {
  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado'
  ];
  const MAX_GUESTS = 40;
  const KEY_USER = 'areaGourmet.usuario.v1';
  const KEY_LOCAL = 'areaGourmet.reservas.v1';

  /**
   * Quando o site é publicado (GitHub Pages), as reservas ficam no Supabase.
   * Sem configuração, o app funciona no modo local ou com o servidor Node.
   */
  const SUPABASE_CONFIG = (() => {
    const cfg = window.APP_CONFIG || {};
    const url = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
    const key = String(cfg.supabaseAnonKey || '').trim();
    return url && key ? { url, key } : null;
  })();

  /* ---------------- Utilidades ---------------- */

  const pad = (n) => String(n).padStart(2, '0');

  function isoOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtShortDate(iso) {
    const d = parseISO(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function fmtLong(iso) {
    const d = parseISO(iso);
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function fmtDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function normText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normApt(value) {
    return normText(value).replace(/[\s.\-]/g, '');
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      toast('Não foi possível salvar as preferências neste navegador.', 'warn');
    }
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeReservation(reservation) {
    return {
      id: String(reservation.id),
      date: String(reservation.date),
      name: String(reservation.name),
      apartment: String(reservation.apartment),
      phone: reservation.phone ? String(reservation.phone) : '',
      guests: Number(reservation.guests) || 1,
      notes: reservation.notes ? String(reservation.notes) : '',
      userId: reservation.user_id || reservation.userId || null,
      createdAt: reservation.createdAt || reservation.created_at || new Date().toISOString()
    };
  }

  function normalizeReservations(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) =>
        r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        typeof r.name === 'string' && typeof r.apartment === 'string'
      )
      .map(normalizeReservation);
  }

  /* ---------------- Estado e elementos ---------------- */

  const state = {
    mode: 'local',
    today: isoOf(new Date()),
    reservations: [],
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    identity: readJSON(KEY_USER, null),
    user: null,
    activeDate: null,
    activeId: null,
    busy: false
  };

  const el = {
    bootScreen: document.getElementById('bootScreen'),
    bootText: document.getElementById('bootText'),
    authGate: document.getElementById('authGate'),
    authTitle: document.getElementById('authTitle'),
    authSubtitle: document.getElementById('authSubtitle'),
    tabLogin: document.getElementById('tabLogin'),
    tabSignup: document.getElementById('tabSignup'),
    loginForm: document.getElementById('loginForm'),
    loginError: document.getElementById('loginError'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginSubmit: document.getElementById('loginSubmit'),
    signupForm: document.getElementById('signupForm'),
    signupError: document.getElementById('signupError'),
    signupSuccess: document.getElementById('signupSuccess'),
    signupName: document.getElementById('signupName'),
    signupEmail: document.getElementById('signupEmail'),
    signupPassword: document.getElementById('signupPassword'),
    signupConfirm: document.getElementById('signupConfirm'),
    signupSubmit: document.getElementById('signupSubmit'),
    appRoot: document.getElementById('appRoot'),
    userBox: document.getElementById('userBox'),
    userName: document.getElementById('userName'),
    profileBtn: document.getElementById('profileBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    profileModal: document.getElementById('profileModal'),
    profileForm: document.getElementById('profileForm'),
    profileError: document.getElementById('profileError'),
    profileName: document.getElementById('profileName'),
    profileEmail: document.getElementById('profileEmail'),
    profileApartment: document.getElementById('profileApartment'),
    profileBlock: document.getElementById('profileBlock'),
    profilePhone: document.getElementById('profilePhone'),
    profileSubmit: document.getElementById('profileSubmit'),
    profileDelete: document.getElementById('profileDelete'),
    overlay: document.getElementById('overlay'),
    bookingModal: document.getElementById('bookingModal'),
    detailsModal: document.getElementById('detailsModal'),
    bookingForm: document.getElementById('bookingForm'),
    formError: document.getElementById('formError'),
    fName: document.getElementById('fName'),
    fApt: document.getElementById('fApt'),
    fPhone: document.getElementById('fPhone'),
    fGuests: document.getElementById('fGuests'),
    fNotes: document.getElementById('fNotes'),
    bookingDateLong: document.getElementById('bookingDateLong'),
    bookingSubmit: document.getElementById('bookingSubmit'),
    calendarGrid: document.getElementById('calendarGrid'),
    monthLabel: document.getElementById('monthLabel'),
    monthSummary: document.getElementById('monthSummary'),
    prevMonth: document.getElementById('prevMonth'),
    nextMonth: document.getElementById('nextMonth'),
    todayBtn: document.getElementById('todayBtn'),
    upcomingList: document.getElementById('upcomingList'),
    statusChip: document.getElementById('statusChip'),
    statusText: document.getElementById('statusText'),
    modeNote: document.getElementById('modeNote'),
    footerData: document.getElementById('footerData'),
    dDay: document.getElementById('dDay'),
    dWeekday: document.getElementById('dWeekday'),
    dFull: document.getElementById('dFull'),
    detailRows: document.getElementById('detailRows'),
    detailNotes: document.getElementById('detailNotes'),
    cancelZone: document.getElementById('cancelZone'),
    cancelHint: document.getElementById('cancelHint'),
    cancelInputs: document.getElementById('cancelInputs'),
    cancelBtn: document.getElementById('cancelBtn'),
    cName: document.getElementById('cName'),
    cApt: document.getElementById('cApt'),
    toast: document.getElementById('toast')
  };

  let lastFocus = null;
  let toastTimer = null;
  let refreshing = false;
  let authClient = null;
  let authStarting = false;
  let pollingTimer = null;

  /* ---------------- API (servidor) ---------------- */

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  async function requestJSON(url, options) {
    const res = await fetch(url, {
      method: options && options.method ? options.method : 'GET',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    let data = null;
    try { data = await res.json(); } catch (err) { /* resposta sem JSON */ }
    if (!res.ok) {
      const message = data && data.error ? data.error : 'Não foi possível concluir a operação.';
      throw new ApiError(message, res.status);
    }
    return data;
  }

  const api = {
    getState: () => requestJSON('api/state'),
    create: (payload) => requestJSON('api/reservations', { method: 'POST', body: payload }),
    cancel: (id, payload) => requestJSON(`api/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: payload })
  };

  /* ---------------- API (Supabase / GitHub Pages) ---------------- */

  function supabaseClient() {
    if (!authClient) throw new Error('A autenticação ainda não foi inicializada.');
    return authClient;
  }

  async function supabaseGetState() {
    const { data, error } = await supabaseClient()
      .from('reservations')
      .select('id,date,name,apartment,phone,guests,notes,created_at,user_id')
      .order('date', { ascending: true });

    if (error) {
      throw new ApiError(error.message || 'Não foi possível carregar as reservas.', error.status || 400);
    }
    return normalizeReservations(data);
  }

  async function supabaseCreate(payload) {
    const { data, error } = await supabaseClient().rpc('create_reservation', {
      p_date: payload.date,
      p_name: payload.name,
      p_apartment: payload.apartment,
      p_phone: payload.phone || '',
      p_guests: payload.guests,
      p_notes: payload.notes || ''
    });

    if (error) {
      throw new ApiError(error.message || 'Não foi possível concluir a reserva.', error.status || 400);
    }
    const reservation = Array.isArray(data) ? data[0] : data;
    if (!reservation || !reservation.id) throw new Error('O servidor não retornou a reserva criada.');
    return normalizeReservation(reservation);
  }

  async function supabaseCancel(id) {
    const { error } = await supabaseClient().rpc('cancel_reservation', { p_id: id });
    if (error) {
      throw new ApiError(error.message || 'Não foi possível cancelar a reserva.', error.status || 400);
    }
    return { ok: true };
  }

  /* ---------------- Armazenamento local ---------------- */

  function loadLocal() {
    return normalizeReservations(readJSON(KEY_LOCAL, []));
  }

  function saveLocal(list) {
    try {
      localStorage.setItem(KEY_LOCAL, JSON.stringify(list));
    } catch (err) {
      throw new Error('Não foi possível salvar neste navegador. Verifique o espaço disponível.');
    }
  }

  async function createReservation(payload) {
    if (state.mode === 'server') {
      const data = await api.create(payload);
      if (!data || !data.reservation) throw new Error('O servidor não retornou a reserva criada.');
      return data.reservation;
    }
    if (state.mode === 'supabase') {
      return supabaseCreate(payload);
    }
    const list = loadLocal();
    if (list.some((r) => r.date === payload.date)) {
      throw new Error('Este dia acabou de ser reservado por outra pessoa. Escolha outra data.');
    }
    const reservation = {
      id: uid(),
      date: payload.date,
      name: payload.name,
      apartment: payload.apartment,
      phone: payload.phone || '',
      guests: payload.guests,
      notes: payload.notes || '',
      createdAt: new Date().toISOString()
    };
    list.push(reservation);
    saveLocal(list);
    return reservation;
  }

  async function cancelReservation(id, credentials) {
    if (state.mode === 'server') {
      return api.cancel(id, credentials);
    }
    if (state.mode === 'supabase') {
      return supabaseCancel(id);
    }
    const list = loadLocal();
    const index = list.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Esta reserva não existe mais.');
    const reservation = list[index];
    if (normText(reservation.name) !== normText(credentials.name) ||
        normApt(reservation.apartment) !== normApt(credentials.apartment)) {
      throw new Error('Nome ou apartamento não conferem com a reserva.');
    }
    list.splice(index, 1);
    saveLocal(list);
    return { ok: true };
  }

  function ownsReservation(reservation) {
    if (state.mode === 'supabase') {
      return !!(state.user && reservation.userId &&
        String(reservation.userId) === String(state.user.id));
    }
    const id = state.identity;
    if (!id) return false;
    return normText(id.name) === normText(reservation.name) &&
      normApt(id.apartment) === normApt(reservation.apartment);
  }

  function currentUserName() {
    if (!state.user) return '';
    const metadata = state.user.user_metadata || {};
    const name = String(metadata.name || '').trim();
    if (name) return name;
    const email = String(state.user.email || '');
    return email ? email.split('@')[0] : 'Morador';
  }

  function rememberIdentity(payload) {
    const identity = {
      name: payload.name,
      apartment: payload.apartment,
      phone: payload.phone || ''
    };
    state.identity = identity;
    writeJSON(KEY_USER, identity);
  }

  /* ---------------- Renderização ---------------- */

  function applyMode() {
    const shared = state.mode !== 'local';
    const viaSupabase = state.mode === 'supabase';
    const viaServer = state.mode === 'server';

    el.statusChip.classList.toggle('chip--server', shared);
    el.statusText.textContent = viaSupabase
      ? 'Publicado na web'
      : viaServer
        ? 'Reservas compartilhadas'
        : 'Modo local';

    el.modeNote.textContent = viaSupabase
      ? 'As reservas são compartilhadas entre os moradores cadastrados. Os dados ficam salvos no Supabase e o calendário se atualiza automaticamente.'
      : viaServer
        ? 'As reservas são compartilhadas com todos os moradores que acessam este endereço. Deixe o servidor ligado para que o calendário fique sempre atualizado.'
        : 'Este arquivo foi aberto direto no navegador: as reservas ficam salvas apenas neste computador. Para compartilhar com os moradores, use a versão publicada na web.';

    el.footerData.innerHTML = viaSupabase
      ? 'Dados compartilhados via <code>Supabase</code>'
      : viaServer
        ? 'Dados salvos em <code>data/reservations.json</code>'
        : 'Dados salvos neste navegador (modo local)';
  }

  function render() {
    const year = state.year;
    const month = state.month;
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const byDate = new Map();
    state.reservations.forEach((r) => byDate.set(r.date, r));

    let monthCount = 0;
    byDate.forEach((r) => {
      const d = parseISO(r.date);
      if (d.getFullYear() === year && d.getMonth() === month) monthCount += 1;
    });

    el.monthLabel.textContent = `${MONTHS[month]} ${year}`;
    el.monthSummary.textContent = monthCount === 0
      ? 'Nenhuma reserva neste mês'
      : `${monthCount} ${monthCount === 1 ? 'dia reservado' : 'dias reservados'}`;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < startWeekday; i += 1) {
      const spacer = document.createElement('div');
      spacer.className = 'cell cell--empty';
      spacer.setAttribute('aria-hidden', 'true');
      fragment.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
      const reservation = byDate.get(iso);
      const weekday = new Date(year, month, day).getDay();
      const isToday = iso === state.today;
      const isPast = iso < state.today;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.dataset.date = iso;

      if (weekday === 0 || weekday === 6) button.classList.add('cell--weekend');
      if (isToday) button.classList.add('cell--today');
      if (isPast) button.classList.add('cell--past');
      if (reservation) button.classList.add('cell--booked');

      button.setAttribute('aria-label', reservation
        ? `${day} de ${MONTHS[month].toLowerCase()}, reservado por ${reservation.name}, apartamento ${reservation.apartment}`
        : `${day} de ${MONTHS[month].toLowerCase()}, livre`);

      if (reservation) {
        button.innerHTML =
          `<span class="num">${day}</span>` +
          `<span class="res">` +
            `<span class="res-name">${esc(reservation.name)}</span>` +
            `<span class="res-apt">Apt. ${esc(reservation.apartment)}</span>` +
          `</span>`;
      } else {
        button.innerHTML = `<span class="num">${day}</span><span class="cell__plus" aria-hidden="true">+</span>`;
      }

      fragment.appendChild(button);
    }

    el.calendarGrid.replaceChildren(fragment);
    renderUpcoming();
  }

  function renderUpcoming() {
    const upcoming = state.reservations
      .filter((r) => r.date >= state.today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);

    if (upcoming.length === 0) {
      el.upcomingList.innerHTML =
        '<li class="empty">Nenhuma reserva futura por enquanto.<br>Clique em um dia livre no calendário para reservar.</li>';
      return;
    }

    el.upcomingList.innerHTML = upcoming.map((r) => {
      const d = parseISO(r.date);
      const guests = Number(r.guests) || 1;
      return `<li>` +
        `<button type="button" data-id="${esc(r.id)}" aria-label="Ver reserva de ${esc(r.name)} em ${fmtShortDate(r.date)}">` +
          `<span class="date-badge"><strong>${d.getDate()}</strong><span>${MONTHS_SHORT[d.getMonth()]}</span></span>` +
          `<span class="upcoming__info">` +
            `<span class="upcoming__name">${esc(r.name)}</span>` +
            `<span class="upcoming__meta">Apt. ${esc(r.apartment)} · ${guests} ${guests === 1 ? 'pessoa' : 'pessoas'}</span>` +
          `</span>` +
          `<span class="upcoming__chev" aria-hidden="true">›</span>` +
        `</button>` +
      `</li>`;
    }).join('');
  }

  function flashDate(iso) {
    const cell = el.calendarGrid.querySelector(`.cell[data-date="${iso}"]`);
    if (!cell) return;
    cell.classList.remove('cell--flash');
    void cell.offsetWidth;
    cell.classList.add('cell--flash');
    setTimeout(() => cell.classList.remove('cell--flash'), 1600);
  }

  /* ---------------- Modais ---------------- */

  function openOverlay(which) {
    lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.bookingModal.hidden = which !== 'booking';
    el.detailsModal.hidden = which !== 'details';
    el.profileModal.hidden = which !== 'profile';
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    if (el.overlay.hidden) return;
    el.overlay.hidden = true;
    el.bookingModal.hidden = true;
    el.detailsModal.hidden = true;
    el.profileModal.hidden = true;
    document.body.classList.remove('modal-open');
    state.activeDate = null;
    state.activeId = null;
    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus(); } catch (err) { /* ignora */ }
    }
    lastFocus = null;
  }

  function showFormError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
  }

  function hideFormError() {
    el.formError.textContent = '';
    el.formError.hidden = true;
  }

  function setBusy(button, busy, idleLabel) {
    state.busy = busy;
    button.classList.toggle('is-loading', busy);
    button.disabled = busy;
    button.textContent = busy ? 'Aguarde…' : idleLabel;
  }

  function openBooking(iso) {
    if (iso < state.today) {
      toast('Essa data já passou. Escolha outro dia.', 'warn');
      return;
    }

    state.activeDate = iso;
    state.activeId = null;
    el.bookingDateLong.textContent = fmtLong(iso);
    hideFormError();
    el.fGuests.value = '10';
    el.fNotes.value = '';

    if (state.mode === 'supabase') {
      el.fName.value = currentUserName();
      el.fName.readOnly = true;
      el.fName.setAttribute('aria-readonly', 'true');
      el.fApt.value = '';
      el.fPhone.value = '';
    } else {
      el.fName.readOnly = false;
      el.fName.removeAttribute('aria-readonly');
      const identity = state.identity || {};
      el.fName.value = identity.name || '';
      el.fApt.value = identity.apartment || '';
      el.fPhone.value = identity.phone || '';
    }

    setBusy(el.bookingSubmit, false, 'Confirmar reserva');
    openOverlay('booking');
    setTimeout(() => {
      if (el.fName.readOnly) el.fApt.focus();
      else el.fName.focus();
    }, 40);
  }

  function openDetails(reservation) {
    state.activeDate = reservation.date;
    state.activeId = reservation.id;

    const d = parseISO(reservation.date);
    const guests = Number(reservation.guests) || 1;
    const mine = ownsReservation(reservation);
    const authMode = state.mode === 'supabase';

    el.dDay.textContent = pad(d.getDate());
    el.dWeekday.textContent = WEEKDAYS[d.getDay()];
    el.dFull.textContent = `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;

    const rows = [
      ['Responsável', reservation.name],
      ['Apartamento', reservation.apartment],
      ['Pessoas', `${guests} ${guests === 1 ? 'pessoa' : 'pessoas'}`]
    ];
    if (reservation.phone) rows.push(['Telefone', reservation.phone]);
    rows.push(['Solicitada em', fmtDateTime(reservation.createdAt)]);

    el.detailRows.innerHTML = rows.map(([label, value]) =>
      `<div class="detail-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`
    ).join('');

    if (reservation.notes) {
      el.detailNotes.innerHTML = `<strong>Observações:</strong> ${esc(reservation.notes)}`;
      el.detailNotes.hidden = false;
    } else {
      el.detailNotes.textContent = '';
      el.detailNotes.hidden = true;
    }

    el.cName.value = '';
    el.cApt.value = '';
    el.cancelZone.hidden = false;
    el.cancelBtn.hidden = false;

    if (authMode) {
      el.cancelInputs.hidden = true;
      el.cancelBtn.hidden = !mine;
      el.cancelHint.textContent = mine
        ? `Você está logado como ${currentUserName()}. A reserva será removida do calendário.`
        : 'Somente quem fez esta reserva pode cancelá-la.';
    } else {
      el.cancelInputs.hidden = mine;
      el.cancelHint.textContent = mine
        ? `Você está identificado como ${reservation.name} (apt. ${reservation.apartment}). A reserva será removida do calendário.`
        : 'Para cancelar, informe o nome e o apartamento usados nesta reserva.';
    }

    setBusy(el.cancelBtn, false, 'Cancelar esta reserva');

    openOverlay('details');
    setTimeout(() => {
      if (mine) el.cancelBtn.focus();
      else if (!authMode) el.cName.focus();
    }, 40);
  }

  /* ---------------- Perfil do morador ---------------- */

  function profileSetupMessage(error) {
    const message = String((error && error.message) || '');
    if (/could not find the function|schema cache|does not exist/i.test(message)) {
      return 'O módulo de perfil ainda não foi ativado no banco. Execute o script SQL de migração e tente novamente.';
    }
    return message || 'Não foi possível concluir a operação com o perfil.';
  }

  function showProfileError(message) {
    el.profileError.textContent = message;
    el.profileError.hidden = false;
  }

  function hideProfileError() {
    el.profileError.textContent = '';
    el.profileError.hidden = true;
  }

  function setProfileBusy(busy) {
    el.profileSubmit.disabled = busy;
    el.profileSubmit.classList.toggle('is-loading', busy);
    el.profileSubmit.textContent = busy ? 'Salvando…' : 'Salvar meus dados';
  }

  async function openProfile() {
    if (!state.user) return;

    hideProfileError();
    el.profileName.value = currentUserName();
    el.profileEmail.value = state.user.email || '';
    el.profileApartment.value = '';
    el.profileBlock.value = '';
    el.profilePhone.value = '';
    el.profileDelete.disabled = false;
    setProfileBusy(false);

    openOverlay('profile');
    setTimeout(() => el.profileName.focus(), 40);

    try {
      const { data, error } = await supabaseClient()
        .from('profiles')
        .select('name,apartment,block,phone')
        .eq('id', state.user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        el.profileName.value = data.name || currentUserName();
        el.profileApartment.value = data.apartment || '';
        el.profileBlock.value = data.block || '';
        el.profilePhone.value = data.phone || '';
      }
    } catch (err) {
      /* o formulário continua utilizável; o erro aparecerá ao salvar */
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!state.user) return;

    hideProfileError();

    const name = el.profileName.value.trim();
    const apartment = el.profileApartment.value.trim();
    const block = el.profileBlock.value.trim();
    const phone = el.profilePhone.value.trim();

    if (name.length < 3) {
      showProfileError('Informe seu nome completo (pelo menos 3 letras).');
      return;
    }
    if (apartment.length > 20 || block.length > 20) {
      showProfileError('Apartamento e bloco devem ter até 20 caracteres.');
      return;
    }
    if (phone.length > 30) {
      showProfileError('O telefone deve ter até 30 caracteres.');
      return;
    }

    setProfileBusy(true);
    try {
      const { error } = await supabaseClient().rpc('save_my_profile', {
        p_name: name,
        p_apartment: apartment,
        p_block: block,
        p_phone: phone
      });
      if (error) throw error;

      try {
        await authClient.auth.updateUser({ data: { name } });
      } catch (err) {
        /* o perfil no banco já foi salvo; o cabeçalho é atualizado localmente */
      }

      state.user.user_metadata = Object.assign({}, state.user.user_metadata, { name });
      el.userName.textContent = name;
      closeModal();
      toast('Dados do perfil atualizados.', 'success');
    } catch (err) {
      showProfileError(profileSetupMessage(err));
    } finally {
      setProfileBusy(false);
    }
  }

  async function deleteMyAccount() {
    if (!state.user) return;

    if (!window.confirm('Excluir sua conta? Seu perfil e todas as suas reservas serão apagados permanentemente.')) {
      return;
    }

    const typed = window.prompt('Digite EXCLUIR para confirmar a exclusão da conta:');
    if (String(typed || '').trim().toUpperCase() !== 'EXCLUIR') {
      toast('Exclusão cancelada.', 'warn');
      return;
    }

    hideProfileError();
    el.profileDelete.disabled = true;
    el.profileDelete.classList.add('is-loading');
    el.profileDelete.textContent = 'Excluindo…';

    try {
      const { error } = await supabaseClient().rpc('delete_my_account');
      if (error) throw error;

      try {
        await authClient.auth.signOut({ scope: 'local' });
      } catch (err) {
        /* a conta já foi removida; a sessão local é limpa abaixo */
      }

      state.user = null;
      state.reservations = [];
      closeModal();
      showAuthGate();
      toast('Sua conta foi excluída.', 'success');
    } catch (err) {
      showProfileError(profileSetupMessage(err));
    } finally {
      el.profileDelete.disabled = false;
      el.profileDelete.classList.remove('is-loading');
      el.profileDelete.textContent = 'Excluir minha conta';
    }
  }

  /* ---------------- Ações ---------------- */

  function toast(message, type) {
    const kind = type || 'success';
    el.toast.hidden = false;
    el.toast.className = `toast toast--${kind}`;
    el.toast.textContent = message;
    requestAnimationFrame(() => el.toast.classList.add('toast--show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('toast--show');
      setTimeout(() => {
        if (!el.toast.classList.contains('toast--show')) el.toast.hidden = true;
      }, 240);
    }, 3800);
  }

  function validateBooking(payload) {
    if (!payload.date) return 'Escolha uma data no calendário.';
    if (payload.name.length < 3) return 'Informe seu nome com pelo menos 3 letras.';
    if (!payload.apartment) return 'Informe o apartamento.';
    if (!Number.isInteger(payload.guests) || payload.guests < 1 || payload.guests > MAX_GUESTS) {
      return `O número de pessoas deve estar entre 1 e ${MAX_GUESTS}.`;
    }
    if (payload.notes.length > 120) return 'As observações devem ter até 120 caracteres.';
    return null;
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (state.busy) return;

    const payload = {
      date: state.activeDate,
      name: el.fName.value.trim(),
      apartment: el.fApt.value.trim(),
      phone: el.fPhone.value.trim(),
      guests: Number.parseInt(el.fGuests.value, 10),
      notes: el.fNotes.value.trim()
    };

    const problem = validateBooking(payload);
    if (problem) {
      showFormError(problem);
      return;
    }

    hideFormError();
    setBusy(el.bookingSubmit, true, 'Confirmar reserva');

    try {
      const reservation = await createReservation(payload);
      state.reservations = state.reservations.filter((r) => r.date !== reservation.date);
      state.reservations.push(reservation);
      if (state.mode !== 'supabase') rememberIdentity(payload);
      closeModal();
      render();
      flashDate(reservation.date);
      toast(`Reserva confirmada para ${fmtShortDate(reservation.date)}.`, 'success');
    } catch (err) {
      showFormError(err.message || 'Não foi possível concluir a reserva.');
      if (err.status === 409) silentRefresh();
    } finally {
      setBusy(el.bookingSubmit, false, 'Confirmar reserva');
    }
  }

  async function cancelCurrent() {
    if (state.busy) return;
    const reservation = state.reservations.find((r) => r.id === state.activeId);
    if (!reservation) {
      toast('Esta reserva não está mais disponível.', 'warn');
      closeModal();
      return;
    }

    const mine = ownsReservation(reservation);
    const authMode = state.mode === 'supabase';
    let credentials = null;

    if (authMode) {
      if (!mine) {
        toast('Você só pode cancelar suas próprias reservas.', 'warn');
        return;
      }
    } else {
      credentials = mine
        ? { name: state.identity.name, apartment: state.identity.apartment }
        : { name: el.cName.value.trim(), apartment: el.cApt.value.trim() };

      if (!credentials.name || !credentials.apartment) {
        toast('Informe o nome e o apartamento para cancelar.', 'warn');
        return;
      }
    }

    const confirmed = window.confirm(
      `Cancelar a reserva de ${reservation.name} para ${fmtShortDate(reservation.date)}?`
    );
    if (!confirmed) return;

    setBusy(el.cancelBtn, true, 'Cancelar esta reserva');

    try {
      await cancelReservation(reservation.id, credentials);
      state.reservations = state.reservations.filter((r) => r.id !== reservation.id);
      closeModal();
      render();
      toast('Reserva cancelada.', 'success');
    } catch (err) {
      toast(err.message || 'Não foi possível cancelar a reserva.', 'error');
      if (err.status === 404) silentRefresh();
    } finally {
      setBusy(el.cancelBtn, false, 'Cancelar esta reserva');
    }
  }

  async function silentRefresh() {
    if (state.mode === 'local' || refreshing) return;
    if (state.mode === 'supabase' && !state.user) return;
    refreshing = true;
    try {
      if (state.mode === 'supabase') {
        state.reservations = await supabaseGetState();
      } else {
        const data = await api.getState();
        state.reservations = normalizeReservations(data.reservations);
        if (typeof data.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.today)) {
          state.today = data.today;
        }
      }
      if (el.overlay.hidden) render();
    } catch (err) {
      /* atualização silenciosa: mantém os dados atuais */
    } finally {
      refreshing = false;
    }
  }

  function goToToday() {
    const today = parseISO(state.today);
    state.year = today.getFullYear();
    state.month = today.getMonth();
    render();
    flashDate(state.today);
  }

  /* ---------------- Autenticação ---------------- */

  function authErrorMessage(error) {
    const message = String((error && error.message) || '');
    const lower = message.toLowerCase();

    if (lower.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (lower.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
    if (lower.includes('user already registered')) return 'Este e-mail já está cadastrado. Tente entrar.';
    if (lower.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (lower.includes('unable to validate email')) return 'Informe um e-mail válido.';
    if (lower.includes('signups not allowed')) return 'O cadastro está desativado. Fale com o síndico.';
    if (lower.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (lower.includes('network')) return 'Sem conexão. Verifique sua internet e tente de novo.';
    return message || 'Não foi possível concluir. Tente novamente.';
  }

  function authShowError(node, message) {
    node.textContent = message;
    node.hidden = false;
  }

  function authHideError(node) {
    node.textContent = '';
    node.hidden = true;
  }

  function authBusy(button, busy, label) {
    button.classList.toggle('is-loading', busy);
    button.disabled = busy;
    button.textContent = busy ? 'Aguarde…' : label;
  }

  function setAuthTab(tab) {
    const login = tab === 'login';
    el.tabLogin.classList.toggle('is-active', login);
    el.tabSignup.classList.toggle('is-active', !login);
    el.tabLogin.setAttribute('aria-selected', login ? 'true' : 'false');
    el.tabSignup.setAttribute('aria-selected', login ? 'false' : 'true');
    el.loginForm.hidden = !login;
    el.signupForm.hidden = login;
    el.authTitle.textContent = login ? 'Entrar' : 'Criar conta';
    el.authSubtitle.textContent = login
      ? 'Use seu e-mail e senha para acessar.'
      : 'Cadastre-se para reservar a área gourmet.';
    authHideError(el.loginError);
    authHideError(el.signupError);
    el.signupSuccess.hidden = true;
  }

  function showBoot(message) {
    el.bootScreen.hidden = false;
    el.bootText.textContent = message || 'Carregando…';
  }

  function bootError(message) {
    showBoot(message);
    const spinner = el.bootScreen.querySelector('.spinner');
    if (spinner) spinner.hidden = true;
  }

  function hideBoot() {
    el.bootScreen.hidden = true;
  }

  function showApp() {
    hideBoot();
    el.authGate.hidden = true;
    el.appRoot.hidden = false;
    if (state.user) {
      el.userBox.hidden = false;
      el.userName.textContent = currentUserName();
    } else {
      el.userBox.hidden = true;
    }
  }

  function showAuthGate() {
    hideBoot();
    el.appRoot.hidden = true;
    el.authGate.hidden = false;
    el.userBox.hidden = true;
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    if (!el.overlay.hidden) closeModal();
    document.body.classList.remove('modal-open');
    setAuthTab('login');
    el.loginPassword.value = '';
    setTimeout(() => el.loginEmail.focus(), 80);
  }

  function startPolling() {
    if (pollingTimer || state.mode === 'local') return;
    pollingTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && el.overlay.hidden) silentRefresh();
    }, 60000);
  }

  async function handleAuthenticated(user) {
    if (!user || authStarting) return;
    if (state.user && state.user.id === user.id && !el.appRoot.hidden) return;

    authStarting = true;
    state.user = user;
    state.mode = 'supabase';

    try {
      try {
        state.reservations = await supabaseGetState();
      } catch (err) {
        state.reservations = [];
        setTimeout(() => {
          toast(err.message || 'Não foi possível carregar as reservas.', 'error');
        }, 400);
      }

      const today = parseISO(state.today);
      state.year = today.getFullYear();
      state.month = today.getMonth();
      applyMode();
      render();
      showApp();
      startPolling();
    } finally {
      authStarting = false;
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    authHideError(el.loginError);

    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    if (!email || !password) {
      authShowError(el.loginError, 'Informe o e-mail e a senha.');
      return;
    }

    authBusy(el.loginSubmit, true, 'Entrar');
    try {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error('Não foi possível iniciar a sessão.');
      el.loginPassword.value = '';
      await handleAuthenticated(data.user);
      toast(`Bem-vindo(a), ${currentUserName()}!`, 'success');
    } catch (err) {
      authShowError(el.loginError, authErrorMessage(err));
    } finally {
      authBusy(el.loginSubmit, false, 'Entrar');
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    authHideError(el.signupError);
    el.signupSuccess.hidden = true;

    const name = el.signupName.value.trim();
    const email = el.signupEmail.value.trim();
    const password = el.signupPassword.value;
    const confirmation = el.signupConfirm.value;

    if (name.length < 3) {
      authShowError(el.signupError, 'Informe seu nome completo (pelo menos 3 letras).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      authShowError(el.signupError, 'Informe um e-mail válido.');
      return;
    }
    if (password.length < 6) {
      authShowError(el.signupError, 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      authShowError(el.signupError, 'As senhas não conferem.');
      return;
    }

    authBusy(el.signupSubmit, true, 'Criar conta');
    try {
      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`
        }
      });
      if (error) throw error;

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        authShowError(el.signupError, 'Este e-mail já está cadastrado. Tente entrar.');
        return;
      }

      el.signupPassword.value = '';
      el.signupConfirm.value = '';

      if (data.session && data.user) {
        await handleAuthenticated(data.user);
        toast(`Conta criada. Bem-vindo(a), ${currentUserName()}!`, 'success');
      } else {
        el.signupSuccess.textContent =
          'Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre com e-mail e senha.';
        el.signupSuccess.hidden = false;
      }
    } catch (err) {
      authShowError(el.signupError, authErrorMessage(err));
    } finally {
      authBusy(el.signupSubmit, false, 'Criar conta');
    }
  }

  async function logout() {
    if (!authClient) return;
    try {
      await authClient.auth.signOut();
    } catch (err) {
      /* a sessão local será limpa de qualquer forma */
    }
    state.user = null;
    state.reservations = [];
    el.userBox.hidden = true;
    showAuthGate();
    toast('Você saiu da sua conta.', 'success');
  }

  function bindAuthEvents() {
    authClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setTimeout(() => {
          if (!state.user) return;
          state.user = null;
          state.reservations = [];
          showAuthGate();
        }, 0);
        return;
      }
      if (event === 'SIGNED_IN' && session && session.user) {
        if (!state.user) {
          setTimeout(() => {
            if (!state.user) handleAuthenticated(session.user);
          }, 0);
        }
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        state.user = session.user;
      }
    });
  }

  /* ---------------- Eventos ---------------- */

  function bindEvents() {
    el.tabLogin.addEventListener('click', () => setAuthTab('login'));
    el.tabSignup.addEventListener('click', () => setAuthTab('signup'));
    el.loginForm.addEventListener('submit', submitLogin);
    el.signupForm.addEventListener('submit', submitSignup);
    el.logoutBtn.addEventListener('click', logout);
    el.profileBtn.addEventListener('click', openProfile);
    el.profileForm.addEventListener('submit', saveProfile);
    el.profileDelete.addEventListener('click', deleteMyAccount);

    [el.profileName, el.profileApartment, el.profileBlock, el.profilePhone].forEach((input) => {
      input.addEventListener('input', hideProfileError);
    });

    [el.loginEmail, el.loginPassword].forEach((input) => {
      input.addEventListener('input', () => authHideError(el.loginError));
    });
    [el.signupName, el.signupEmail, el.signupPassword, el.signupConfirm].forEach((input) => {
      input.addEventListener('input', () => authHideError(el.signupError));
    });

    el.prevMonth.addEventListener('click', () => {
      state.month -= 1;
      if (state.month < 0) { state.month = 11; state.year -= 1; }
      render();
    });

    el.nextMonth.addEventListener('click', () => {
      state.month += 1;
      if (state.month > 11) { state.month = 0; state.year += 1; }
      render();
    });

    el.todayBtn.addEventListener('click', goToToday);

    el.calendarGrid.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell');
      if (!cell || !cell.dataset.date) return;
      const iso = cell.dataset.date;
      const reservation = state.reservations.find((r) => r.date === iso);
      if (reservation) openDetails(reservation);
      else openBooking(iso);
    });

    el.upcomingList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;
      const reservation = state.reservations.find((r) => r.id === button.dataset.id);
      if (reservation) openDetails(reservation);
    });

    el.bookingForm.addEventListener('submit', submitBooking);
    el.cancelBtn.addEventListener('click', cancelCurrent);

    [el.cName, el.cApt].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          cancelCurrent();
        }
      });
    });

    el.overlay.addEventListener('click', (event) => {
      if (event.target === el.overlay) closeModal();
    });

    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.overlay.hidden) closeModal();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') silentRefresh();
    });
  }

  /* ---------------- Inicialização ---------------- */

  async function startLegacyMode() {
    try {
      const data = await api.getState();
      state.mode = 'server';
      state.reservations = normalizeReservations(data.reservations);
      if (typeof data.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.today)) {
        state.today = data.today;
      }
    } catch (err) {
      state.mode = 'local';
      state.reservations = loadLocal();
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        setTimeout(() => {
          toast('Sem conexão com o servidor. Exibindo os dados locais deste navegador.', 'error');
        }, 500);
      }
    }

    const today = parseISO(state.today);
    state.year = today.getFullYear();
    state.month = today.getMonth();

    applyMode();
    render();
    hideBoot();
    el.authGate.hidden = true;
    el.appRoot.hidden = false;
    startPolling();
  }

  async function init() {
    bindEvents();

    const authEnabled = !!SUPABASE_CONFIG && window.location.protocol !== 'file:';

    if (!authEnabled) {
      await startLegacyMode();
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      bootError('Não foi possível carregar a biblioteca de acesso. Recarregue a página.');
      return;
    }

    try {
      authClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (err) {
      bootError('Não foi possível configurar o acesso. Verifique o config.js.');
      return;
    }

    bindAuthEvents();

    try {
      const { data, error } = await authClient.auth.getSession();
      if (error) throw error;

      if (data.session && data.session.user) {
        await handleAuthenticated(data.session.user);
      } else {
        showAuthGate();
      }
    } catch (err) {
      showAuthGate();
      authShowError(el.loginError, 'Não foi possível verificar sua sessão. Entre novamente.');
    }
  }

  init();
})();
