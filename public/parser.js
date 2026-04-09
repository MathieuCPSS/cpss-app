'use strict';

// ── Helpers numériques ────────────────────────────────────────────────
function parseNombre(s) {
  if (!s) return null;
  s = String(s).trim().replace(/[€£$\s]/g, '');
  if (!s || !/\d/.test(s)) return null;
  if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Parseur Natgraph ──────────────────────────────────────────────────
function parseNatgraph(texte) {
  console.log("OCR local simple >>>");
console.log(texte);
console.log("<<< OCR local simple");
  const lignes = texte
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const articles = [];

  for (const ligne of lignes) {
    const cols = ligne
      .replace(/\t/g, '    ')
      .split(/\s{2,}/)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (/^(Total|Tax|Document|BANK|TERMS|ACCOUNT|SWIFT|IBAN|Registered|All)/i.test(cols[0])) continue;
    if (cols.length < 6) continue;

    const ref        = cols[0];
    const designation = cols[1];
    const quantite   = parseFloat(cols[2].replace(',', '.'));
    const pu         = parseFloat(cols[3].replace(',', '.'));
    const remise     = parseFloat(cols[4].replace(',', '.'));

    if (isNaN(quantite) || isNaN(pu)) continue;

    articles.push({
      ref,
      designation,
      quantite,
      pu,
      remise,
      prix:  pu * quantite,
      total: pu * quantite
    });
  }

  return articles;
}

// ── Parseur Sakurai ───────────────────────────────────────────────────
function parseSakurai(text) {
  const lines = text
    .split('\n')
    .map(l => l.replace(/\r/g, '').trim())
    .filter(l => l.length > 0);

  const items = [];
  let i = 0;

  while (i < lines.length) {
    const line1 = lines[i];

    if (!line1 || /^attach\b/i.test(line1.trim())) { i++; continue; }

    const cols = line1.split('\t').map(c => c.trim());

    if (cols.length < 8) { i++; continue; }

    const parts_no = cols[5];
    if (!parts_no) { i++; continue; }

    const parts_name = cols[6];
    const qty        = parseInt(cols[7], 10) || 1;

    const linePrice = lines[i + 2] || '';
    let unit_price = 0;
    const match = linePrice.match(/(\d[\d.,]*)\s*$/);
    if (match) unit_price = parseFloat(match[1].replace(',', '.')) || 0;

    const total = unit_price * qty;

    items.push({
      ref:        parts_no,
      designation: parts_name,
      quantite:   qty,
      pu:         unit_price,
      remise:     0,
      total,
      prix:       total
    });

    i += 3;
  }

  return items;
}

// ── Détection complexité Natgraph ─────────────────────────────────────
// Complexe si : Serial #, désignation multi-lignes, ou multi-pages
function isNatgraphComplex(texte) {
  if (/Serial\s*#/i.test(texte)) return true;
  if (/PAGE\s+1\s+of\s+[2-9]/i.test(texte)) return true;
  if (/^\d{3}-\d{2}-\d{1,2}\s*$/m.test(texte)) return true;
  return false;
}

// ── Détection du type de PDF ──────────────────────────────────────────
function detectFormat(texte) {
  // Sakurai
  if (
    /Attach\b/i.test(texte)              ||
    /Checking Parts No\./i.test(texte)   ||
    /Over\s*\d*month/i.test(texte)       ||
    /\bParts No\b.*\bParts Name\b/i.test(texte)
  ) return 'sakurai';

  // Natgraph
  if (
    /Product\s+Code/i.test(texte)    ||
    /Total\s+GBP/i.test(texte)       ||
    /\bDiscount\s*%/i.test(texte)    ||
    /\bHandelsbanken\b/i.test(texte) ||
    /\bEORI\b/i.test(texte)          ||
    /\bA\/C CODE\b/i.test(texte)
  ) return isNatgraphComplex(texte) ? 'natgraph-complex' : 'natgraph-simple';

  return 'unknown';
}

// ── Point d'entrée principal ──────────────────────────────────────────
// Retourne { format, articles, devise } ou null si → Claude
function parsePDF(texte) {
  const format = detectFormat(texte);

  if (format === 'sakurai') {
    return { format, articles: parseSakurai(texte), devise: 'EUR' };
  }
  if (format === 'natgraph-simple') {
    return { format, articles: parseNatgraph(texte), devise: 'GBP' };
  }
  // natgraph-complex ou unknown → Claude
  return null;
}


// Rendre les fonctions accessibles au front
if (typeof window !== 'undefined') {
    window.parseNombre = parseNombre;
    window.detectFormat = detectFormat;
    window.parseNatgraph = parseNatgraph;
    window.parseSakurai = parseSakurai;
    window.isNatgraphComplex = isNatgraphComplex;
}


