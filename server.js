const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs'); // actuellement non utilisé, mais dispo si tu veux hasher plus tard
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Mots de passe (issus des variables d'environnement) ───────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cpss-admin-2025';
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'cpss-bureau-2025';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cpss-secret-change-me';

// ── Chemins des fichiers de données ───────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const STOCK_FILE = path.join(DATA_DIR, 'stock.json');
const RAPPORTS_FILE = path.join(DATA_DIR, 'rapports.json');

// Créer le dossier data si nécessaire
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STOCK_FILE)) fs.writeFileSync(STOCK_FILE, '[]');
if (!fs.existsSync(RAPPORTS_FILE)) fs.writeFileSync(RAPPORTS_FILE, '{}');

// ── Middleware globaux ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Sessions sécurisées
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
cookie: {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict"
}
}));

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limit sur /api/login ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 tentatives par minute
  standardHeaders: true,
  legacyHeaders: false
});

// ── Helpers ───────────────────────────────────────────────────────────
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return file === STOCK_FILE ? [] : {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (req.session && req.session.role) return next();
  res.status(401).json({ error: 'Non authentifié' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Accès admin requis' });
}

// ── Auth ──────────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    req.session.role = 'admin';
    return res.json({ ok: true, role: 'admin' });
  }

  if (password === VIEWER_PASSWORD) {
    req.session.role = 'viewer';
    return res.json({ ok: true, role: 'viewer' });
  }

  // On ne donne pas plus d'info que nécessaire
  res.status(401).json({ error: 'Mot de passe incorrect' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.role) {
    res.json({ role: req.session.role });
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});

// ── Stock API ─────────────────────────────────────────────────────────
app.get('/api/stock', requireAuth, (req, res) => {
  res.json(readJSON(STOCK_FILE));
});

app.post('/api/stock', requireAdmin, (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Format invalide' });
  writeJSON(STOCK_FILE, items);
  res.json({ ok: true });
});

// ── Rapports API ──────────────────────────────────────────────────────
app.get('/api/rapports', requireAuth, (req, res) => {
  res.json(readJSON(RAPPORTS_FILE));
});

app.get('/api/rapports/:key', requireAuth, (req, res) => {
  const rapports = readJSON(RAPPORTS_FILE);
  const key = decodeURIComponent(req.params.key);
  if (!rapports[key]) return res.status(404).json({ error: 'Rapport non trouvé' });
  res.json(rapports[key]);
});

app.post('/api/rapports/:key', requireAdmin, (req, res) => {
  const rapports = readJSON(RAPPORTS_FILE);
  const key = decodeURIComponent(req.params.key);
  rapports[key] = req.body;
  writeJSON(RAPPORTS_FILE, rapports);
  res.json({ ok: true });
});

app.delete('/api/rapports/:key', requireAdmin, (req, res) => {
  const rapports = readJSON(RAPPORTS_FILE);
  const key = decodeURIComponent(req.params.key);
  delete rapports[key];
  writeJSON(RAPPORTS_FILE, rapports);
  res.json({ ok: true });
});

// ── Ping pour garder le serveur éveillé ───────────────────────────────
app.get('/ping', (req, res) => res.send('pong'));

// ── Page principale ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
  console.log(`CPSS App démarrée sur le port ${PORT}`);
});
