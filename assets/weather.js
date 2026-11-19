'use strict';

/**
 * Previsão do tempo com Open-Meteo (https://open-meteo.com/).
 * Sem chave de API, chamada direto do navegador, com cache local.
 */
(function () {
  const API_URL = 'https://api.open-meteo.com/v1/forecast';
  const CACHE_KEY = 'areaGourmet.previsao.v1';
  const CACHE_TTL = 30 * 60 * 1000;
  const FORECAST_DAYS = 16;
  const REQUEST_TIMEOUT = 8000;
  const ATTRIBUTION = 'https://open-meteo.com/';

  const WEATHER_CODES = {
    0: { label: 'Céu limpo', icon: '☀️' },
    1: { label: 'Predominantemente limpo', icon: '🌤️' },
    2: { label: 'Parcialmente nublado', icon: '⛅' },
    3: { label: 'Nublado', icon: '☁️' },
    45: { label: 'Neblina', icon: '🌫️' },
    48: { label: 'Neblina com geada', icon: '🌫️' },
    51: { label: 'Garoa leve', icon: '🌦️' },
    53: { label: 'Garoa', icon: '🌦️' },
    55: { label: 'Garoa forte', icon: '🌧️' },
    56: { label: 'Garoa congelante', icon: '🌧️' },
    57: { label: 'Garoa congelante forte', icon: '🌧️' },
    61: { label: 'Chuva leve', icon: '🌦️' },
    63: { label: 'Chuva', icon: '🌧️' },
    65: { label: 'Chuva forte', icon: '🌧️' },
    66: { label: 'Chuva congelante', icon: '🌧️' },
    67: { label: 'Chuva congelante forte', icon: '🌧️' },
    71: { label: 'Neve leve', icon: '🌨️' },
    73: { label: 'Neve', icon: '🌨️' },
    75: { label: 'Neve forte', icon: '❄️' },
    77: { label: 'Grãos de neve', icon: '❄️' },
    80: { label: 'Pancadas leves', icon: '🌦️' },
    81: { label: 'Pancadas de chuva', icon: '🌧️' },
    82: { label: 'Pancadas fortes', icon: '⛈️' },
    85: { label: 'Pancadas de neve', icon: '🌨️' },
    86: { label: 'Pancadas de neve fortes', icon: '🌨️' },
    95: { label: 'Tempestade', icon: '⛈️' },
    96: { label: 'Tempestade com granizo', icon: '⛈️' },
    99: { label: 'Tempestade com granizo forte', icon: '⛈️' }
  };

  let inflight = null;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function isoOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseISO(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function shortDate(iso) {
    const date = parseISO(iso);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  }

  function shortDateTime(timestamp) {
    const date = new Date(timestamp);
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function weatherInfo(code) {
    return WEATHER_CODES[code] || { label: 'Tempo variável', icon: '🌥️' };
  }

  function getConfig() {
    const weather = window.APP_CONFIG && window.APP_CONFIG.weather;
    if (!weather) return null;

    const latitude = Number(weather.latitude);
    const longitude = Number(weather.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      timezone: weather.timezone || 'America/Sao_Paulo',
      label: weather.label || ''
    };
  }

  function readCache(config) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      if (!cached || !cached.daily || !Array.isArray(cached.daily.time)) return null;
      if (cached.latitude !== config.latitude || cached.longitude !== config.longitude) return null;
      if (!cached.fetchedAt || Date.now() - cached.fetchedAt > CACHE_TTL) return null;

      return cached;
    } catch (err) {
      return null;
    }
  }

  function writeCache(record) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(record));
    } catch (err) {
      /* cache é opcional */
    }
  }

  async function fetchDaily(config) {
    const params = new URLSearchParams({
      latitude: String(config.latitude),
      longitude: String(config.longitude),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      timezone: config.timezone,
      forecast_days: String(FORECAST_DAYS),
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm'
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);

      const data = await response.json();
      if (!data.daily || !Array.isArray(data.daily.time)) {
        throw new Error('Resposta de previsão inválida.');
      }

      return {
        latitude: config.latitude,
        longitude: config.longitude,
        fetchedAt: Date.now(),
        daily: data.daily
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getDaily(config) {
    const cached = readCache(config);
    if (cached) return cached;

    const key = `${config.latitude},${config.longitude}`;
    if (inflight && inflight.key === key) return inflight.promise;

    const promise = fetchDaily(config);
    inflight = { key, promise };

    try {
      const record = await promise;
      writeCache(record);
      return record;
    } finally {
      if (inflight && inflight.promise === promise) inflight = null;
    }
  }

  function forecastFor(record, iso) {
    const index = record.daily.time.indexOf(iso);
    if (index === -1) return null;

    const daily = record.daily;
    const pick = (key) => (Array.isArray(daily[key]) ? daily[key][index] : null);

    return {
      code: pick('weather_code'),
      max: pick('temperature_2m_max'),
      min: pick('temperature_2m_min'),
      rain: pick('precipitation_probability_max'),
      wind: pick('wind_speed_10m_max'),
      fetchedAt: record.fetchedAt
    };
  }

  function addCredit(container) {
    const credit = document.createElement('a');
    credit.className = 'weather-card__credit';
    credit.href = ATTRIBUTION;
    credit.target = '_blank';
    credit.rel = 'noopener';
    credit.textContent = 'Open-Meteo';
    container.appendChild(credit);
  }

  function renderForecast(container, iso, forecast) {
    const info = weatherInfo(forecast.code);
    const icon = document.createElement('div');
    icon.className = 'weather-card__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = info.icon;

    const body = document.createElement('div');
    body.className = 'weather-card__body';

    const title = document.createElement('p');
    title.className = 'weather-card__title';
    title.textContent = `Previsão para ${shortDate(iso)} · ${info.label}`;

    const main = document.createElement('p');
    main.className = 'weather-card__main';

    const parts = [];
    if (Number.isFinite(Number(forecast.max)) && Number.isFinite(Number(forecast.min))) {
      parts.push(`${Math.round(forecast.max)}° / ${Math.round(forecast.min)}°`);
    }
    if (forecast.rain !== null && forecast.rain !== undefined) {
      parts.push(`${Math.round(forecast.rain)}% de chuva`);
    }
    main.textContent = parts.length ? parts.join(' · ') : 'Dados de temperatura indisponíveis.';

    const meta = document.createElement('p');
    meta.className = 'weather-card__meta';

    const metaParts = [];
    if (forecast.wind !== null && forecast.wind !== undefined) {
      metaParts.push(`Vento ${Math.round(forecast.wind)} km/h`);
    }
    metaParts.push(`Atualizada em ${shortDateTime(forecast.fetchedAt)}`);
    meta.textContent = metaParts.join(' · ');

    body.append(title, main, meta);
    container.replaceChildren(icon, body);
    addCredit(container);
  }

  function renderUnavailable(container, availableFrom) {
    const icon = document.createElement('div');
    icon.className = 'weather-card__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🗓️';

    const body = document.createElement('div');
    body.className = 'weather-card__body';

    const title = document.createElement('p');
    title.className = 'weather-card__title';
    title.textContent = 'Previsão ainda não disponível';

    const text = document.createElement('p');
    text.className = 'weather-card__main';
    text.textContent = `A previsão para esta data estará disponível a partir de ${availableFrom}.`;

    const meta = document.createElement('p');
    meta.className = 'weather-card__meta';
    meta.textContent = 'O Open-Meteo cobre os próximos 16 dias.';

    body.append(title, text, meta);
    container.replaceChildren(icon, body);
  }

  function renderError(container) {
    const icon = document.createElement('div');
    icon.className = 'weather-card__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🌥️';

    const body = document.createElement('div');
    body.className = 'weather-card__body';

    const title = document.createElement('p');
    title.className = 'weather-card__title';
    title.textContent = 'Previsão indisponível agora';

    const text = document.createElement('p');
    text.className = 'weather-card__main';
    text.textContent = 'Não foi possível carregar a previsão. Tente novamente mais tarde.';

    body.append(title, text);
    container.replaceChildren(icon, body);
  }

  async function render(container, iso) {
    if (!container) return;

    const sequence = String(Number(container.dataset.weatherSeq || 0) + 1);
    container.dataset.weatherSeq = sequence;
    container.hidden = true;
    container.classList.remove('weather-card--loading');
    container.replaceChildren();

    const config = getConfig();
    if (!config || !iso) return;

    const today = isoOf(new Date());
    if (iso < today) return;

    const target = parseISO(iso);
    const lastForecast = new Date();
    lastForecast.setHours(0, 0, 0, 0);
    lastForecast.setDate(lastForecast.getDate() + FORECAST_DAYS - 1);

    container.hidden = false;

    if (target > lastForecast) {
      const available = new Date(target);
      available.setDate(available.getDate() - (FORECAST_DAYS - 1));
      renderUnavailable(container, shortDate(isoOf(available)));
      return;
    }

    container.classList.add('weather-card--loading');
    container.textContent = 'Carregando previsão…';

    try {
      const record = await getDaily(config);
      if (container.dataset.weatherSeq !== sequence) return;

      const forecast = forecastFor(record, iso);
      if (!forecast) {
        renderError(container);
        return;
      }

      renderForecast(container, iso, forecast);
    } catch (err) {
      if (container.dataset.weatherSeq !== sequence) return;
      renderError(container);
    } finally {
      if (container.dataset.weatherSeq === sequence) {
        container.classList.remove('weather-card--loading');
      }
    }
  }

  window.Weather = { render };
})();
