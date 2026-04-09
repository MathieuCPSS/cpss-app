const express = require('express');
const session = require('express-session');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { parsePDF } = require('./parser');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// ── Mots de passe & secrets ───────────────────────────────────────────
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'cpss-admin-2025';
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'cpss-bureau-2025';
const SESSION_SECRET  = process.env.SESSION_SECRET  || 'cpss-secret-change-me';
const MONGODB_URI     = process.env.MONGODB_URI;    // Variable Render — jamais dans le code
 
// ── Connexion MongoDB ─────────────────────────────────────────────────
let db = null;
 
async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI non défini — mode fichiers JSON local (développement)');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('cpss');
    console.log('✅ MongoDB Atlas connecté');
  } catch (err) {
    console.error('❌ Erreur connexion MongoDB :', err.message);
    // On continue sans MongoDB — le serveur démarre quand même
  }
}
 
// ── Fallback fichiers JSON (si MongoDB indisponible) ──────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const STOCK_FILE    = path.join(DATA_DIR, 'stock.json');
const RAPPORTS_FILE = path.join(DATA_DIR, 'rapports.json');
 
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR))      fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STOCK_FILE))    fs.writeFileSync(STOCK_FILE, '[]');
  if (!fs.existsSync(RAPPORTS_FILE)) fs.writeFileSync(RAPPORTS_FILE, '{}');
}
 
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return file === STOCK_FILE ? [] : {}; }
}
 
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
 
// ── Helpers stock (MongoDB ou JSON) ──────────────────────────────────
async function getStock() {
  if (db) {
    const doc = await db.collection('stock').findOne({ _id: 'stock' });
    return doc ? doc.items : [];
  }
  ensureDataDir();
  return readJSON(STOCK_FILE);
}
 
async function setStock(items) {
  if (db) {
    await db.collection('stock').updateOne(
      { _id: 'stock' },
      { $set: { items } },
      { upsert: true }
    );
    return;
  }
  ensureDataDir();
  writeJSON(STOCK_FILE, items);
}
 
// ── Helpers rapports (MongoDB ou JSON) ───────────────────────────────
async function getRapports() {
  if (db) {
    const docs = await db.collection('rapports').find({}).toArray();
    const result = {};
    docs.forEach(doc => {
      const key = doc._id;
      const data = { ...doc };
      delete data._id;
      result[key] = data;
    });
    return result;
  }
  ensureDataDir();
  return readJSON(RAPPORTS_FILE);
}
 
async function getRapport(key) {
  if (db) {
    const doc = await db.collection('rapports').findOne({ _id: key });
    if (!doc) return null;
    const data = { ...doc };
    delete data._id;
    return data;
  }
  ensureDataDir();
  const all = readJSON(RAPPORTS_FILE);
  return all[key] || null;
}
 
async function setRapport(key, data) {
  if (db) {
    // replaceOne pour écraser le document entier (pas $set qui fusionne)
    await db.collection('rapports').replaceOne(
      { _id: key },
      { ...data, _id: key },
      { upsert: true }
    );
    return;
  }
  ensureDataDir();
  const all = readJSON(RAPPORTS_FILE);
  all[key] = data;
  writeJSON(RAPPORTS_FILE, all);
}
 
async function deleteRapport(key) {
  if (db) {
    await db.collection('rapports').deleteOne({ _id: key });
    return;
  }
  ensureDataDir();
  const all = readJSON(RAPPORTS_FILE);
  delete all[key];
  writeJSON(RAPPORTS_FILE, all);
}
 
// ── Middleware globaux ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
 
// Indispensable sur Render : le serveur est derrière un proxy HTTPS
app.set('trust proxy', 1);
 
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,    // Render est toujours en HTTPS
    sameSite: 'none' // Nécessaire pour mobile/tablette derrière proxy
  }
}));
 
app.use(express.static(path.join(__dirname, 'public')));
 
// ── Rate limit login ──────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});
 
// ── Middleware auth ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.role) return next();
  res.status(401).json({ error: 'Non authentifié' });
}
 
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Accès admin requis' });
}
 
// ── Auth routes ───────────────────────────────────────────────────────
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
  res.status(401).json({ error: 'Mot de passe incorrect' });
});
 
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
 
app.get('/api/me', (req, res) => {
  if (req.session && req.session.role) {
    res.json({ role: req.session.role });
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});
 
// ── Stock API ─────────────────────────────────────────────────────────
app.get('/api/stock', requireAuth, async (req, res) => {
  try {
    res.json(await getStock());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/api/stock', requireAdmin, async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Format invalide' });
  try {
    await setStock(items);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// ── Rapports API ──────────────────────────────────────────────────────
app.get('/api/rapports', requireAuth, async (req, res) => {
  try {
    res.json(await getRapports());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.get('/api/rapports/:key', requireAuth, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const rapport = await getRapport(key);
    if (!rapport) return res.status(404).json({ error: 'Rapport non trouvé' });
    res.json(rapport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.post('/api/rapports/:key', requireAdmin, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    await setRapport(key, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.delete('/api/rapports/:key', requireAdmin, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    await deleteRapport(key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    t1_coeff: parseFloat(process.env.TAUX_T1_COEFF),
    t1_max:   parseFloat(process.env.TAUX_T1_MAX),
    t2_coeff: parseFloat(process.env.TAUX_T2_COEFF),
    t2_max:   parseFloat(process.env.TAUX_T2_MAX),
    t3_coeff: parseFloat(process.env.TAUX_T3_COEFF),
    gbp_eur:  parseFloat(process.env.TAUX_GBP_EUR),
 
    marge: {
      seuil1: parseFloat(process.env.MARGE_SEUIL1 || '150'),
      seuil2: parseFloat(process.env.MARGE_SEUIL2 || '800'),
      coeff1: parseFloat(process.env.MARGE_COEFF1 || '1'),
      coeff2: parseFloat(process.env.MARGE_COEFF2 || '1'),
      coeff3: parseFloat(process.env.MARGE_COEFF3 || '1'),
    },
 
    taux: {
      GBP: parseFloat(process.env.TAUX_GBP || '1.25'),
      USD: parseFloat(process.env.TAUX_USD || '1'),
      CHF: parseFloat(process.env.TAUX_CHF || '1'),
    }
  });
});
 
// ── Ping ──────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.send('pong'));
 
// ── Page principale ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
const upload = multer({ storage: multer.memoryStorage() });
 
// ── Extraction texte PDF via pdf-parse (local, gratuit) ───────────────
async function extractPDFText(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text;
}

// ── Analyse PDF complexe via Claude (document natif) ──────────────────
async function analyserAvecClaude(pdfBuffer) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY manquant sur le serveur');
 
  const base64 = pdfBuffer.toString('base64');
 
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            {
              type: 'text',
              text: `Analyse ce devis fournisseur et renvoie UNIQUEMENT un tableau JSON valide, sans texte autour, sans balises markdown :
[
  { "ref": "...", "designation": "...", "quantite": 1, "pu": 0, "remise": 0 }
]
- "ref" : référence produit (chaîne, peut être vide)
- "designation" : description de l'article
- "quantite" : nombre entier ou décimal
- "pu" : prix unitaire HT (nombre décimal, sans symbole monétaire)
- "remise" : remise en % (0 si absente)
N'inclus pas les lignes de total, sous-total, frais de port ou TVA.`
            }
          ]
        }
      ]
    })
  });
 
  const data = await response.json();
  console.log('Réponse Claude parse-pdf :', JSON.stringify(data).slice(0, 300));
 
  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('Réponse Claude invalide : ' + JSON.stringify(data).slice(0, 200));
  }
 
  const raw = data.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}
 
// ── Route principale ──────────────────────────────────────────────────
app.post('/api/parse-pdf', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier PDF reçu' });
    }

    const buffer = req.file.buffer;

    // 1) Essayer d'abord le parseur local (Sakurai + Natgraph simple) — gratuit
    try {
      const texte = await extractPDFText(buffer);
      const resultat = parsePDF(texte);
      if (resultat) {
        console.log(`Parseur local utilisé : ${resultat.format}`);
        return res.json({ mode: resultat.format, articles: resultat.articles, devise: resultat.devise });
      }
    } catch (parseErr) {
      console.warn('Extraction texte locale échouée, passage à Claude :', parseErr.message);
    }

    // 2) Natgraph complexe ou format inconnu → Claude
    console.log('Analyse Claude (natgraph-complex ou format inconnu)');
    const articles = await analyserAvecClaude(buffer);
    return res.json({ mode: 'claude', articles });

  } catch (err) {
    console.error('Erreur /api/parse-pdf :', err);
    res.status(500).json({ error: err.message });
  }
});

 
 
// ── Démarrage ─────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`CPSS App démarrée sur le port ${PORT}`);
    console.log(`Mode stockage : ${db ? 'MongoDB Atlas' : 'Fichiers JSON locaux'}`);
  });
});
