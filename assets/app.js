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
  const DOCUMENT_LIMIT = 2;
  const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
  const DOCUMENT_MIME = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
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
    profile: null,
    adminFilter: 'pending',
    adminUsers: [],
    documents: [],
    documentsView: 'mine',
    documentsLoading: false,
    replaceDocId: null,
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
    approvalGate: document.getElementById('approvalGate'),
    approvalTitle: document.getElementById('approvalTitle'),
    approvalText: document.getElementById('approvalText'),
    approvalUser: document.getElementById('approvalUser'),
    approvalRefresh: document.getElementById('approvalRefresh'),
    approvalLogout: document.getElementById('approvalLogout'),
    adminPanel: document.getElementById('adminPanel'),
    adminBtn: document.getElementById('adminBtn'),
    adminModal: document.getElementById('adminModal'),
    adminFilterPending: document.getElementById('adminFilterPending'),
    adminFilterAll: document.getElementById('adminFilterAll'),
    adminRefresh: document.getElementById('adminRefresh'),
    adminError: document.getElementById('adminError'),
    adminUserList: document.getElementById('adminUserList'),
    documentsPanel: document.getElementById('documentsPanel'),
    documentsBtn: document.getElementById('documentsBtn'),
    documentsModal: document.getElementById('documentsModal'),
    documentsTitle: document.getElementById('documentsTitle'),
    documentsAdminTabs: document.getElementById('documentsAdminTabs'),
    documentsMineTab: document.getElementById('documentsMineTab'),
    documentsAllTab: document.getElementById('documentsAllTab'),
    documentFile: document.getElementById('documentFile'),
    documentReplaceFile: document.getElementById('documentReplaceFile'),
    documentUploadBtn: document.getElementById('documentUploadBtn'),
    documentsLimit: document.getElementById('documentsLimit'),
    documentsError: document.getElementById('documentsError'),
    documentsList: document.getElementById('documentsList'),
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
    fBlock: document.getElementById('fBlock'),
    fPhone: document.getElementById('fPhone'),
    fGuests: document.getElementById('fGuests'),
    fNotes: document.getElementById('fNotes'),
    bookingProfileHint: document.getElementById('bookingProfileHint'),
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
    el.adminModal.hidden = which !== 'admin';
    el.documentsModal.hidden = which !== 'documents';
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    if (el.overlay.hidden) return;
    el.overlay.hidden = true;
    el.bookingModal.hidden = true;
    el.detailsModal.hidden = true;
    el.profileModal.hidden = true;
    el.adminModal.hidden = true;
    el.documentsModal.hidden = true;
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

  async function openBooking(iso) {
    if (iso < state.today) {
      toast('Essa data já passou. Escolha outro dia.', 'warn');
      return;
    }

    if (state.mode === 'supabase' && !state.profile) {
      try {
        state.profile = await loadMyProfile();
      } catch (err) {
        state.profile = null;
      }
    }

    state.activeDate = iso;
    state.activeId = null;
    el.bookingDateLong.textContent = fmtLong(iso);
    hideFormError();
    el.fGuests.value = '10';
    el.fNotes.value = '';

    if (state.mode === 'supabase') {
      const profile = state.profile || {};

      el.fName.value = profile.name || currentUserName();
      el.fName.readOnly = true;
      el.fName.setAttribute('aria-readonly', 'true');

      el.fApt.value = profile.apartment || '';
      el.fBlock.value = profile.block || '';
      el.fPhone.value = profile.phone || '';

      el.bookingProfileHint.hidden = false;
      el.bookingProfileHint.textContent = (profile.apartment || profile.block || profile.phone)
        ? 'Dados carregados do seu perfil. Você pode ajustar esta reserva; para alterar permanentemente, use Meu perfil.'
        : 'Seu perfil ainda não tem apartamento, bloco ou telefone. Preencha em Meu perfil para agilizar as próximas reservas.';
    } else {
      el.fName.readOnly = false;
      el.fName.removeAttribute('aria-readonly');
      const identity = state.identity || {};
      el.fName.value = identity.name || '';
      el.fApt.value = identity.apartment || '';
      el.fBlock.value = '';
      el.fPhone.value = identity.phone || '';
      el.bookingProfileHint.hidden = true;
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

  async function loadMyProfile() {
    if (!state.user) return null;

    let { data, error } = await supabaseClient()
      .from('profiles')
      .select('name,apartment,block,phone,role,status')
      .eq('id', state.user.id)
      .maybeSingle();

    if (error && /column .*role.*does not exist|column .*status.*does not exist|schema cache/i.test(error.message || '')) {
      const fallback = await supabaseClient()
        .from('profiles')
        .select('name,apartment,block,phone')
        .eq('id', state.user.id)
        .maybeSingle();

      if (fallback.error) throw fallback.error;
      return fallback.data
        ? { role: 'resident', status: 'approved', ...fallback.data }
        : null;
    }

    if (error) throw error;
    return data || null;
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
      const data = await loadMyProfile();
      if (data) {
        state.profile = data;
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
      const { data, error } = await supabaseClient().rpc('save_my_profile', {
        p_name: name,
        p_apartment: apartment,
        p_block: block,
        p_phone: phone
      });
      if (error) throw error;

      const saved = Array.isArray(data) ? data[0] : data;
      if (saved) state.profile = saved;
      updateAdminVisibility();

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
      try {
        const { data: documents } = await supabaseClient()
          .from('documents')
          .select('storage_path')
          .eq('user_id', state.user.id);

        if (documents && documents.length) {
          await authClient.storage
            .from('documentos')
            .remove(documents.map((doc) => doc.storage_path));
        }
      } catch (err) {
        /* segue com a exclusão da conta mesmo se o storage falhar */
      }

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
        const profile = await loadMyProfile();
        state.profile = profile;

        if (!profile || profile.status !== 'approved') {
          showApprovalGate(profile);
          return;
        }

        updateAdminVisibility();
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

  function isAdminUser() {
    return !!(state.profile &&
      state.profile.role === 'admin' &&
      state.profile.status === 'approved');
  }

  function updateAdminVisibility() {
    el.adminPanel.hidden = !isAdminUser();
  }

  function showApp() {
    hideBoot();
    el.authGate.hidden = true;
    el.approvalGate.hidden = true;
    el.appRoot.hidden = false;
    if (state.user) {
      el.userBox.hidden = false;
      el.userName.textContent = currentUserName();
    } else {
      el.userBox.hidden = true;
    }
    updateAdminVisibility();
    updateDocumentsVisibility();
  }

  function showAuthGate() {
    hideBoot();
    el.appRoot.hidden = true;
    el.authGate.hidden = false;
    el.approvalGate.hidden = true;
    el.userBox.hidden = true;
    el.adminPanel.hidden = true;
    el.documentsPanel.hidden = true;
    state.profile = null;
    state.adminUsers = [];
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

  function showApprovalGate(profile) {
    hideBoot();
    el.authGate.hidden = true;
    el.appRoot.hidden = true;
    el.approvalGate.hidden = false;
    el.userBox.hidden = true;
    el.adminPanel.hidden = true;
    el.documentsPanel.hidden = true;

    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    if (!el.overlay.hidden) closeModal();
    document.body.classList.remove('modal-open');

    const status = profile && profile.status;

    if (status === 'rejected') {
      el.approvalTitle.textContent = 'Acesso não autorizado';
      el.approvalText.textContent = 'Seu acesso foi recusado pelo administrador. Fale com o síndico se acredita que isso foi um engano.';
      el.approvalRefresh.textContent = 'Verificar novamente';
    } else if (status === 'pending') {
      el.approvalTitle.textContent = 'Acesso em análise';
      el.approvalText.textContent = 'Sua conta foi criada, mas o administrador ainda precisa aprovar seu acesso. Assim que for aprovada, clique em Verificar aprovação.';
      el.approvalRefresh.textContent = 'Verificar aprovação';
    } else {
      el.approvalTitle.textContent = 'Cadastro não encontrado';
      el.approvalText.textContent = 'Não encontramos seu perfil. Peça ao administrador para verificar seu cadastro ou entre novamente.';
      el.approvalRefresh.textContent = 'Verificar novamente';
    }

    const email = state.user ? state.user.email : '';
    el.approvalUser.textContent = [profile && profile.name, email].filter(Boolean).join(' · ');
    el.approvalRefresh.disabled = false;
    setTimeout(() => el.approvalRefresh.focus(), 80);
  }

  async function refreshApproval() {
    if (!state.user || !authClient) return;

    const label = el.approvalRefresh.textContent;
    el.approvalRefresh.disabled = true;
    el.approvalRefresh.textContent = 'Verificando…';

    try {
      const profile = await loadMyProfile();
      state.profile = profile;

      if (profile && profile.status === 'approved') {
        await handleAuthenticated(state.user);
      } else {
        showApprovalGate(profile);
        toast(
          profile && profile.status === 'rejected'
            ? 'Seu acesso continua recusado.'
            : 'Seu acesso ainda está aguardando aprovação.',
          'warn'
        );
      }
    } catch (err) {
      toast(err.message || 'Não foi possível verificar agora.', 'error');
    } finally {
      el.approvalRefresh.disabled = false;
      el.approvalRefresh.textContent = label;
    }
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
        state.profile = await loadMyProfile();
      } catch (err) {
        state.profile = null;
      }

      if (!state.profile || state.profile.status !== 'approved') {
        showApprovalGate(state.profile);
        return;
      }

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

  /* ---------------- Documentos ---------------- */

  function isApprovedUser() {
    return !!(state.user && state.profile && state.profile.status === 'approved');
  }

  function updateDocumentsVisibility() {
    el.documentsPanel.hidden = !isApprovedUser();
  }

  function documentExtension(name) {
    const parts = String(name || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
  }

  function documentMime(file) {
    const ext = documentExtension(file.name);
    return DOCUMENT_MIME[ext] || file.type || 'application/octet-stream';
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function newDocumentId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function validateDocumentFile(file) {
    if (!file) return 'Selecione um arquivo.';
    if (!file.size) return 'O arquivo está vazio.';
    if (file.size > DOCUMENT_MAX_BYTES) return 'O arquivo deve ter no máximo 10 MB.';
    const ext = documentExtension(file.name);
    if (!DOCUMENT_MIME[ext]) {
      return 'Formato não aceito. Use PDF, JPG, PNG, WEBP, TXT, DOC/DOCX ou XLS/XLSX.';
    }
    return null;
  }

  function documentsErrorMessage(error) {
    const message = String((error && error.message) || '');
    const code = String((error && (error.code || error.error_code)) || '');

    if (/bucket not found/i.test(message)) {
      return 'O bucket "documentos" ainda não foi criado. Execute o SQL de documentos no Supabase.';
    }
    if (/row-level security|permission denied|42501/i.test(message) || code === '42501') {
      return 'Você não tem permissão para esta operação com documentos.';
    }
    if (/já possui 2 documentos/i.test(message)) return message;
    if (/payload too large|file size|too large|mime type/i.test(message)) {
      return 'Arquivo inválido ou acima do limite de 10 MB.';
    }
    if (/duplicate key/i.test(message)) {
      return 'Este documento já foi registrado. Tente novamente.';
    }
    return message || 'Não foi possível concluir a operação com documentos.';
  }

  function showDocumentsError(message) {
    el.documentsError.textContent = message;
    el.documentsError.hidden = false;
  }

  function hideDocumentsError() {
    el.documentsError.textContent = '';
    el.documentsError.hidden = true;
  }

  function updateDocumentsUI() {
    if (!el.documentsModal) return;

    const admin = isAdminUser();
    const mineView = state.documentsView === 'mine';

    el.documentsAdminTabs.hidden = !admin;
    el.documentsTitle.textContent = mineView ? 'Meus documentos' : 'Documentos dos moradores';

    el.documentsMineTab.classList.toggle('is-active', mineView);
    el.documentsAllTab.classList.toggle('is-active', !mineView);
    el.documentsMineTab.setAttribute('aria-selected', mineView ? 'true' : 'false');
    el.documentsAllTab.setAttribute('aria-selected', mineView ? 'false' : 'true');

    const mineCount = mineView
      ? state.documents.length
      : state.documents.filter((doc) => doc.user_id === state.user.id).length;

    el.documentUploadBtn.hidden = !mineView;
    el.documentUploadBtn.disabled = state.documentsLoading || !mineView || mineCount >= DOCUMENT_LIMIT;
    el.documentUploadBtn.textContent = state.documentsLoading ? 'Aguarde…' : 'Enviar documento';

    if (mineView) {
      el.documentsLimit.textContent = mineCount >= DOCUMENT_LIMIT
        ? `${mineCount} de ${DOCUMENT_LIMIT} documentos · limite atingido`
        : `${mineCount} de ${DOCUMENT_LIMIT} documentos`;
    } else {
      el.documentsLimit.textContent = `${state.documents.length} documento${state.documents.length === 1 ? '' : 's'} no total · visão do administrador`;
    }
  }

  function renderDocuments() {
    if (!state.documents.length) {
      el.documentsList.innerHTML = `<p class="document-empty">${
        state.documentsView === 'all'
          ? 'Nenhum documento enviado pelos moradores.'
          : 'Você ainda não enviou documentos.<br>Envie até 2 arquivos para o condomínio.'
      }</p>`;
      return;
    }

    el.documentsList.innerHTML = state.documents.map((doc) => {
      const mine = doc.user_id === state.user.id;
      const ext = documentExtension(doc.name).toUpperCase() || 'ARQ';
      const owner = doc.owner
        ? [
            doc.owner.name || doc.owner.email,
            doc.owner.apartment ? `Apt. ${doc.owner.apartment}` : '',
            doc.owner.block ? `Bloco ${doc.owner.block}` : ''
          ].filter(Boolean).join(' · ')
        : '';
      const meta = [
        formatBytes(doc.size_bytes),
        fmtDateTime(doc.created_at),
        state.documentsView === 'all' ? `Enviado por ${owner || 'morador não identificado'}` : ''
      ].filter(Boolean).join(' · ');

      const actions = [
        `<button class="btn btn--ghost btn--xs" type="button" data-doc-action="download" data-id="${esc(doc.id)}">Baixar</button>`
      ];

      if (mine) {
        actions.push(`<button class="btn btn--ghost btn--xs" type="button" data-doc-action="rename" data-id="${esc(doc.id)}">Renomear</button>`);
        actions.push(`<button class="btn btn--ghost btn--xs" type="button" data-doc-action="replace" data-id="${esc(doc.id)}">Substituir</button>`);
      }

      if (mine || (isAdminUser() && state.documentsView === 'all')) {
        actions.push(`<button class="btn btn--danger btn--xs" type="button" data-doc-action="delete" data-id="${esc(doc.id)}">Excluir</button>`);
      }

      return `<article class="document-card">
        <div class="document-type">${esc(ext)}</div>
        <div>
          <div class="document-card__name">${esc(doc.name)}</div>
          <div class="document-card__meta">${esc(meta)}</div>
        </div>
        <div class="document-card__actions">${actions.join('')}</div>
      </article>`;
    }).join('');
  }

  async function loadDocuments() {
    if (!state.user || !isApprovedUser()) return;

    hideDocumentsError();
    state.documentsLoading = true;
    el.documentsList.innerHTML = '<p class="document-empty">Carregando documentos…</p>';
    updateDocumentsUI();

    try {
      let query = supabaseClient()
        .from('documents')
        .select('*');

      // "Meus documentos" deve trazer somente os arquivos do próprio usuário.
      // O administrador tem RLS para ver todos, então o filtro é obrigatório.
      if (state.documentsView !== 'all' || !isAdminUser()) {
        query = query.eq('user_id', state.user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      let documents = data || [];

      if (state.documentsView === 'all' && isAdminUser() && documents.length) {
        const { data: profiles, error: profilesError } = await supabaseClient()
          .from('profiles')
          .select('id,name,email,apartment,block');

        if (!profilesError) {
          const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
          documents = documents.map((doc) => Object.assign({}, doc, {
            owner: byId.get(doc.user_id) || null
          }));
        }
      }

      state.documents = documents;
    } catch (err) {
      state.documents = [];
      showDocumentsError(documentsErrorMessage(err));
    } finally {
      state.documentsLoading = false;
      renderDocuments();
      updateDocumentsUI();
    }
  }

  async function openDocuments() {
    if (!isApprovedUser()) {
      toast('Acesso disponível apenas para moradores aprovados.', 'warn');
      return;
    }

    state.documentsView = 'mine';
    state.replaceDocId = null;
    state.documents = [];
    hideDocumentsError();
    openOverlay('documents');
    updateDocumentsUI();
    await loadDocuments();
  }

  async function setDocumentsView(view) {
    if (view === 'all' && !isAdminUser()) return;
    state.documentsView = view;
    state.documents = [];
    hideDocumentsError();
    updateDocumentsUI();
    await loadDocuments();
  }

  async function uploadNewDocument(file) {
    if (state.documentsLoading) return;

    const problem = validateDocumentFile(file);
    if (problem) {
      showDocumentsError(problem);
      return;
    }

    if (state.documents.length >= DOCUMENT_LIMIT) {
      showDocumentsError('Você já possui 2 documentos. Exclua um para enviar outro.');
      return;
    }

    const ext = documentExtension(file.name);
    const mime = documentMime(file);
    const id = newDocumentId();
    const path = `${state.user.id}/${id}.${ext}`;

    hideDocumentsError();
    state.documentsLoading = true;
    updateDocumentsUI();

    try {
      const { error: uploadError } = await authClient.storage
        .from('documentos')
        .upload(path, file, { contentType: mime, upsert: false });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabaseClient()
        .from('documents')
        .insert({
          id,
          user_id: state.user.id,
          name: file.name.slice(0, 120),
          storage_path: path,
          mime_type: mime,
          size_bytes: file.size
        })
        .select()
        .single();

      if (insertError) {
        try {
          await authClient.storage.from('documentos').remove([path]);
        } catch (err) {
          /* melhor esforço para não deixar arquivo órfão */
        }
        throw insertError;
      }

      toast('Documento enviado.', 'success');
      await loadDocuments();
    } catch (err) {
      showDocumentsError(documentsErrorMessage(err));
    } finally {
      state.documentsLoading = false;
      updateDocumentsUI();
      el.documentFile.value = '';
    }
  }

  async function replaceDocument(file) {
    if (state.documentsLoading || !state.replaceDocId) return;

    const document = state.documents.find((doc) => doc.id === state.replaceDocId);
    if (!document) return;

    const problem = validateDocumentFile(file);
    if (problem) {
      showDocumentsError(problem);
      state.replaceDocId = null;
      return;
    }

    const mime = documentMime(file);
    hideDocumentsError();
    state.documentsLoading = true;
    updateDocumentsUI();

    try {
      const { error: uploadError } = await authClient.storage
        .from('documentos')
        .upload(document.storage_path, file, { contentType: mime, upsert: true });

      if (uploadError) throw uploadError;

      const { error } = await supabaseClient()
        .from('documents')
        .update({
          name: file.name.slice(0, 120),
          mime_type: mime,
          size_bytes: file.size
        })
        .eq('id', document.id);

      if (error) throw error;

      toast('Documento substituído.', 'success');
      await loadDocuments();
    } catch (err) {
      showDocumentsError(documentsErrorMessage(err));
    } finally {
      state.documentsLoading = false;
      state.replaceDocId = null;
      el.documentReplaceFile.value = '';
      updateDocumentsUI();
    }
  }

  async function renameDocument(document) {
    const value = window.prompt('Novo nome do documento:', document.name);
    if (value === null) return;

    const name = value.trim();
    if (!name) {
      showDocumentsError('Informe um nome para o documento.');
      return;
    }
    if (name.length > 120) {
      showDocumentsError('O nome deve ter até 120 caracteres.');
      return;
    }

    hideDocumentsError();
    try {
      const { error } = await supabaseClient()
        .from('documents')
        .update({ name })
        .eq('id', document.id);

      if (error) throw error;
      toast('Documento renomeado.', 'success');
      await loadDocuments();
    } catch (err) {
      showDocumentsError(documentsErrorMessage(err));
    }
  }

  async function deleteDocument(document) {
    if (!window.confirm(`Excluir o documento "${document.name}"?`)) return;

    hideDocumentsError();
    try {
      const { error: storageError } = await authClient.storage
        .from('documentos')
        .remove([document.storage_path]);

      if (storageError) throw storageError;

      const { error } = await supabaseClient()
        .from('documents')
        .delete()
        .eq('id', document.id);

      if (error) throw error;
      toast('Documento excluído.', 'success');
      await loadDocuments();
    } catch (err) {
      showDocumentsError(documentsErrorMessage(err));
    }
  }

  async function downloadDocument(document) {
    hideDocumentsError();
    try {
      const { data, error } = await authClient.storage
        .from('documentos')
        .createSignedUrl(document.storage_path, 300);

      if (error) throw error;
      if (!data || !data.signedUrl) throw new Error('Não foi possível gerar o link do documento.');

      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (err) {
      showDocumentsError(documentsErrorMessage(err));
    }
  }

  function handleDocumentAction(action, id) {
    const document = state.documents.find((doc) => doc.id === id);
    if (!document) return;

    if (action === 'download') downloadDocument(document);
    else if (action === 'rename') renameDocument(document);
    else if (action === 'replace') {
      state.replaceDocId = document.id;
      el.documentReplaceFile.value = '';
      el.documentReplaceFile.click();
    } else if (action === 'delete') {
      deleteDocument(document);
    }
  }

  /* ---------------- Administração de usuários ---------------- */

  function showAdminError(message) {
    el.adminError.textContent = message;
    el.adminError.hidden = false;
  }

  function hideAdminError() {
    el.adminError.textContent = '';
    el.adminError.hidden = true;
  }

  function adminRoleBadge(role) {
    return role === 'admin'
      ? '<span class="admin-badge admin-badge--admin">Administrador</span>'
      : '<span class="admin-badge admin-badge--resident">Morador</span>';
  }

  function adminStatusBadge(status) {
    const map = {
      pending: ['Aguardando', 'pending'],
      approved: ['Aprovado', 'approved'],
      rejected: ['Recusado', 'rejected']
    };
    const item = map[status] || ['—', 'resident'];
    return `<span class="admin-badge admin-badge--${item[1]}">${item[0]}</span>`;
  }

  function setAdminFilter(filter) {
    state.adminFilter = filter;
    const pending = filter === 'pending';
    el.adminFilterPending.classList.toggle('is-active', pending);
    el.adminFilterAll.classList.toggle('is-active', !pending);
    el.adminFilterPending.setAttribute('aria-selected', pending ? 'true' : 'false');
    el.adminFilterAll.setAttribute('aria-selected', pending ? 'false' : 'true');
    renderAdminUsers();
  }

  function renderAdminUsers() {
    const filter = state.adminFilter;
    const order = { pending: 0, rejected: 1, approved: 2 };
    const users = state.adminUsers
      .filter((user) => filter === 'all' || user.status === 'pending')
      .sort((a, b) => {
        const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
        if (byStatus !== 0) return byStatus;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

    if (users.length === 0) {
      el.adminUserList.innerHTML = `<p class="admin-empty">${
        filter === 'pending'
          ? 'Nenhuma solicitação pendente no momento.'
          : 'Nenhum usuário encontrado.'
      }</p>`;
      return;
    }

    el.adminUserList.innerHTML = users.map((user) => {
      const self = state.user && user.id === state.user.id;
      const details = [
        user.apartment ? `Apt. ${esc(user.apartment)}` : '',
        user.block ? `Bloco ${esc(user.block)}` : '',
        user.phone ? esc(user.phone) : ''
      ].filter(Boolean).join(' · ');

      const actions = [];

      if (self) {
        actions.push('<span class="admin-self">Você</span>');
      } else {
        if (user.status !== 'approved') {
          actions.push(`<button class="btn btn--primary btn--xs" type="button" data-admin-action="approve" data-id="${esc(user.id)}">Aprovar</button>`);
        }
        if (user.status !== 'rejected') {
          actions.push(`<button class="btn btn--danger btn--xs" type="button" data-admin-action="reject" data-id="${esc(user.id)}">Recusar</button>`);
        }
        actions.push(`<button class="btn btn--ghost btn--xs" type="button" data-admin-action="toggle-role" data-id="${esc(user.id)}">${
          user.role === 'admin' ? 'Tornar morador' : 'Tornar administrador'
        }</button>`);
      }

      return `<article class="admin-user">
        <div>
          <div class="admin-user__name">${esc(user.name || 'Sem nome')} ${adminRoleBadge(user.role)} ${adminStatusBadge(user.status)}</div>
          <div class="admin-user__email">${esc(user.email || '')}</div>
          ${details ? `<div class="admin-user__meta">${details}</div>` : ''}
          <div class="admin-user__meta">Solicitado em ${esc(fmtDateTime(user.created_at))}</div>
        </div>
        <div class="admin-user__actions">${actions.join('')}</div>
      </article>`;
    }).join('');
  }

  async function loadAdminUsers() {
    if (!isAdminUser()) return;

    hideAdminError();
    el.adminUserList.innerHTML = '<p class="admin-empty">Carregando usuários…</p>';

    try {
      const { data, error } = await supabaseClient()
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      state.adminUsers = data || [];
      renderAdminUsers();
    } catch (err) {
      el.adminUserList.innerHTML = '<p class="admin-empty">Não foi possível carregar os usuários.</p>';
      showAdminError(err.message || 'Erro ao carregar usuários.');
    }
  }

  async function openAdmin() {
    if (!isAdminUser()) {
      toast('Acesso restrito a administradores.', 'error');
      return;
    }

    state.adminUsers = [];
    setAdminFilter('pending');
    openOverlay('admin');
    await loadAdminUsers();
  }

  async function updateAdminUser(id, kind, value) {
    if (!isAdminUser()) return;

    hideAdminError();
    const buttons = el.adminUserList.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });

    try {
      const rpc = kind === 'status' ? 'admin_set_user_status' : 'admin_set_user_role';
      const params = kind === 'status'
        ? { p_id: id, p_status: value }
        : { p_id: id, p_role: value };

      const { error } = await supabaseClient().rpc(rpc, params);
      if (error) throw error;

      await loadAdminUsers();

      if (kind === 'status') {
        toast(value === 'approved' ? 'Usuário aprovado.' : 'Status do usuário atualizado.', 'success');
      } else {
        toast('Papel do usuário atualizado.', 'success');
      }
    } catch (err) {
      showAdminError(err.message || 'Não foi possível atualizar o usuário.');
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function handleAdminAction(action, id) {
    const user = state.adminUsers.find((item) => item.id === id);
    if (!user) return;

    if (action === 'approve') {
      await updateAdminUser(id, 'status', 'approved');
      return;
    }

    if (action === 'reject') {
      if (!window.confirm(`Recusar o acesso de ${user.name || user.email}?`)) return;
      await updateAdminUser(id, 'status', 'rejected');
      return;
    }

    if (action === 'toggle-role') {
      const nextRole = user.role === 'admin' ? 'resident' : 'admin';
      const label = nextRole === 'admin' ? 'tornar administrador' : 'remover o acesso de administrador';
      if (!window.confirm(`Deseja ${label} de ${user.name || user.email}?`)) return;
      await updateAdminUser(id, 'role', nextRole);
    }
  }

  /* ---------------- Eventos ---------------- */

  function bindEvents() {
    el.tabLogin.addEventListener('click', () => setAuthTab('login'));
    el.tabSignup.addEventListener('click', () => setAuthTab('signup'));
    el.loginForm.addEventListener('submit', submitLogin);
    el.signupForm.addEventListener('submit', submitSignup);
    el.logoutBtn.addEventListener('click', logout);
    el.approvalRefresh.addEventListener('click', refreshApproval);
    el.approvalLogout.addEventListener('click', logout);

    el.adminBtn.addEventListener('click', openAdmin);
    el.adminRefresh.addEventListener('click', loadAdminUsers);
    el.adminFilterPending.addEventListener('click', () => setAdminFilter('pending'));
    el.adminFilterAll.addEventListener('click', () => setAdminFilter('all'));
    el.adminUserList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-admin-action]');
      if (!button) return;
      handleAdminAction(button.dataset.adminAction, button.dataset.id);
    });

    el.documentsBtn.addEventListener('click', openDocuments);
    el.documentUploadBtn.addEventListener('click', () => {
      if (state.documentsView !== 'mine' || state.documentsLoading) return;
      el.documentFile.value = '';
      el.documentFile.click();
    });
    el.documentFile.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) uploadNewDocument(file);
    });
    el.documentReplaceFile.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) replaceDocument(file);
    });
    el.documentsMineTab.addEventListener('click', () => setDocumentsView('mine'));
    el.documentsAllTab.addEventListener('click', () => setDocumentsView('all'));
    el.documentsList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-doc-action]');
      if (!button) return;
      handleDocumentAction(button.dataset.docAction, button.dataset.id);
    });

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('#profileBtn, #userName');
      if (trigger && state.user) {
        event.preventDefault();
        openProfile();
      }
    });

    el.userName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfile();
      }
    });

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
