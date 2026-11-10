'use strict';

/**
 * Área Gourmet · Servidor de reservas
 * ------------------------------------------------------------
 * Servidor HTTP sem dependências externas (apenas Node.js).
 * Guarda as reservas em data/reservations.json e entrega o
 * site (index.html, assets) para todos os moradores da rede.
 *
 * Uso:  node server.js        (porta 3000 por padrão)
 *       PORT=8080 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reservations.json');
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 20 * 1024;
const MAX_GUESTS = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ------------------------- utilidades ------------------------- */

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function clean(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value) {
  return clean(value, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeApartment(value) {
  return normalizeText(value).replace(/[\s.\-]/g, '');
}

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function sanitizeReservations(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((r) =>
    r && typeof r.id === 'string' &&
    typeof r.date === 'string' && isValidDate(r.date) &&
    typeof r.name === 'string' && typeof r.apartment === 'string'
  );
}

/* ------------------------- persistência ------------------------- */

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ reservations: [] }, null, 2) + '\n', 'utf8');
  }
}

function readDB() {
  ensureDataFile();
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (err) {
    throw new HttpError(500, 'Não foi possível ler o arquivo de reservas.');
  }

  if (!raw.trim()) return { reservations: [] };

  try {
    const parsed = JSON.parse(raw);
    return { reservations: sanitizeReservations(parsed.reservations) };
  } catch (err) {
    const backup = `${DATA_FILE}.corrompido-${Date.now()}.json`;
    try {
      fs.copyFileSync(DATA_FILE, backup);
      fs.writeFileSync(DATA_FILE, JSON.stringify({ reservations: [] }, null, 2) + '\n', 'utf8');
    } catch (copyErr) {
      throw new HttpError(500, 'Arquivo de reservas inválido e não foi possível criar um backup.');
    }
    console.error(`[aviso] Arquivo de dados invalido. Backup criado em: ${backup}`);
    return { reservations: [] };
  }
}

function writeDB(db) {
  ensureDataFile();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

/**
 * Serializa as gravações para que duas pessoas clicando em "reservar"
 * ao mesmo tempo não consigam gravar o mesmo dia.
 */
let mutationQueue = Promise.resolve();

function withLock(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

/* ------------------------- HTTP helpers ------------------------- */

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    req.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        finished = true;
        reject(new HttpError(413, 'Os dados enviados são grandes demais.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (finished) return;
      finished = true;
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('formato inesperado');
        }
        resolve(parsed);
      } catch (err) {
        reject(new HttpError(400, 'Dados inválidos na solicitação.'));
      }
    });

    req.on('error', () => {
      if (finished) return;
      finished = true;
      reject(new HttpError(400, 'Falha ao ler os dados enviados.'));
    });
  });
}

/* ------------------------- API ------------------------- */

function validateReservation(body) {
  const date = clean(body.date, 10);
  if (!isValidDate(date)) throw new HttpError(400, 'Informe uma data válida.');
  if (date < todayISO()) throw new HttpError(400, 'Não é possível reservar uma data que já passou.');

  const name = clean(body.name, 60);
  if (name.length < 3) throw new HttpError(400, 'Informe o nome com pelo menos 3 letras.');

  const apartment = clean(body.apartment, 20);
  if (!apartment) throw new HttpError(400, 'Informe o apartamento.');

  const phone = clean(body.phone, 30);
  const notes = clean(body.notes, 120);

  const guests = Number.parseInt(body.guests, 10);
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
    throw new HttpError(400, `O número de pessoas deve estar entre 1 e ${MAX_GUESTS}.`);
  }

  return { date, name, apartment, phone, guests, notes };
}

function getState(res) {
  const db = readDB();
  const reservations = db.reservations
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  sendJSON(res, 200, {
    mode: 'server',
    today: todayISO(),
    reservations
  });
}

async function createReservation(req, res) {
  const body = await readJsonBody(req);
  const payload = validateReservation(body);

  const reservation = await withLock(() => {
    const db = readDB();
    if (db.reservations.some((r) => r.date === payload.date)) {
      throw new HttpError(409, 'Este dia já está reservado. Escolha outra data.');
    }

    const created = {
      id: newId(),
      date: payload.date,
      name: payload.name,
      apartment: payload.apartment,
      phone: payload.phone,
      guests: payload.guests,
      notes: payload.notes,
      createdAt: new Date().toISOString()
    };

    db.reservations.push(created);
    writeDB(db);
    return created;
  });

  sendJSON(res, 201, { reservation });
}

async function cancelReservation(req, res, id) {
  const body = await readJsonBody(req);
  const name = clean(body.name, 60);
  const apartment = clean(body.apartment, 20);

  await withLock(() => {
    const db = readDB();
    const index = db.reservations.findIndex((r) => r.id === id);
    if (index === -1) throw new HttpError(404, 'Esta reserva não existe mais.');

    const reservation = db.reservations[index];
    if (normalizeText(reservation.name) !== normalizeText(name) ||
        normalizeApartment(reservation.apartment) !== normalizeApartment(apartment)) {
      throw new HttpError(403, 'Nome ou apartamento não conferem com esta reserva.');
    }

    db.reservations.splice(index, 1);
    writeDB(db);
  });

  sendJSON(res, 200, { ok: true });
}

/* ------------------------- arquivos estáticos ------------------------- */

function serveStatic(pathname, res, headOnly) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const segments = relative.split(/[\\/]+/).filter(Boolean);

  if (segments.some((part) => part.startsWith('.') || part === 'data' || part === 'node_modules')) {
    throw new HttpError(404, 'Arquivo não encontrado.');
  }

  const target = path.resolve(ROOT, relative);
  const rootWithSeparator = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (target !== ROOT && !target.startsWith(rootWithSeparator)) {
    throw new HttpError(403, 'Acesso negado.');
  }

  let stats;
  try {
    stats = fs.statSync(target);
  } catch (err) {
    throw new HttpError(404, 'Arquivo não encontrado.');
  }

  if (!stats.isFile()) throw new HttpError(404, 'Arquivo não encontrado.');

  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stats.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  if (headOnly) {
    res.end();
    return;
  }

  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ------------------------- roteamento ------------------------- */

async function handle(req, res) {
  const started = Date.now();

  try {
    const host = req.headers.host || 'localhost';
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    } catch (err) {
      throw new HttpError(400, 'Endereço inválido.');
    }

    if (pathname === '/api/state') {
      if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
      getState(res);
      return;
    }

    if (pathname === '/api/reservations') {
      if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
      await createReservation(req, res);
      return;
    }

    const cancelMatch = pathname.match(/^\/api\/reservations\/([A-Za-z0-9-]+)\/cancel$/);
    if (cancelMatch) {
      if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
      await cancelReservation(req, res, cancelMatch[1]);
      return;
    }

    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Recurso não encontrado.');

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Método não permitido.');
    }

    serveStatic(pathname, res, req.method === 'HEAD');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      sendJSON(res, status, {
        error: err instanceof HttpError ? err.message : 'Erro interno no servidor.'
      });
    } else {
      res.destroy();
    }
  } finally {
    const status = res.statusCode || 200;
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${req.method} ${req.url} -> ${status} (${Date.now() - started} ms)`);
  }
}

/* ------------------------- inicialização ------------------------- */

function isPrivateIPv4(address) {
  const [a, b] = address.split('.').map(Number);
  return a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

function lanAddresses() {
  const found = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal && isPrivateIPv4(net.address)) {
        found.push(net.address);
      }
    });
  });
  return found;
}

ensureDataFile();

const server = http.createServer((req, res) => { handle(req, res); });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nA porta ${PORT} ja esta em uso. Feche o outro programa ou use outra porta:`);
    console.error(`  set PORT=3001 && node server.js\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ================================================');
  console.log('   AREA GOURMET - RESERVAS DO CONDOMINIO');
  console.log('  ================================================');
  console.log(`   Servidor:      http://localhost:${PORT}`);
  lanAddresses().forEach((ip) => {
    console.log(`   Na rede:       http://${ip}:${PORT}`);
  });
  console.log(`   Dados:         ${DATA_FILE}`);
  console.log('');
  console.log('   Deixe esta janela aberta enquanto estiver usando.');
  console.log('   Pressione Ctrl+C para encerrar.');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\nEncerrando o servidor...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
