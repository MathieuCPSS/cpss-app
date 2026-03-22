/**
 * CPSS API Client
 * Gère la communication avec le serveur avec fallback localStorage hors-ligne
 */
const CPSS = (function() {

  let _role = null;
  let _online = true;

  // ── Détection connexion ──────────────────────────────────────────
  async function checkOnline() {
    try {
      const r = await fetch('/ping', { cache: 'no-store' });
      _online = r.ok;
    } catch {
      _online = false;
    }
    return _online;
  }

  function showStatus(msg, color) {
    let bar = document.getElementById('cpss-status-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cpss-status-bar';
      bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:6px 12px;font-size:12px;text-align:center;z-index:9999;transition:opacity 1s;';
      document.body.appendChild(bar);
    }
    bar.style.background = color || '#333';
    bar.style.color = 'white';
    bar.style.opacity = '1';
    bar.textContent = msg;
    if (color !== '#c62828') {
      setTimeout(() => { bar.style.opacity = '0'; }, 3000);
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────
  async function getRole() {
    if (_role) return _role;
    try {
      const r = await fetch('/api/me');
      if (r.ok) {
        const d = await r.json();
        _role = d.role;
        return _role;
      }
    } catch {}
    return null;
  }

  async function requireAuth() {
    const role = await getRole();
    if (!role) window.location.href = '/';
    return role;
  }

  // ── Stock ─────────────────────────────────────────────────────────
  async function loadStock() {
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/stock');
        if (r.ok) {
          const data = await r.json();
          // Mettre à jour le cache local
          localStorage.setItem('stockItems', JSON.stringify(data));
          showStatus('✅ Stock synchronisé', '#2e7d32');
          return data;
        }
      } catch {}
    }
    // Fallback localStorage
    showStatus('⚠️ Mode hors-ligne — données locales', '#c62828');
    const local = localStorage.getItem('stockItems');
    return local ? JSON.parse(local) : [];
  }

  async function saveStock(items) {
    // Toujours sauvegarder localement
    localStorage.setItem('stockItems', JSON.stringify(items));
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(items)
        });
        if (r.ok) {
          showStatus('✅ Stock sauvegardé', '#2e7d32');
          return true;
        }
      } catch {}
    }
    showStatus('💾 Sauvegardé localement (hors-ligne)', '#e65100');
    return false;
  }

  // ── Rapports ──────────────────────────────────────────────────────
  async function loadRapports() {
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/rapports');
        if (r.ok) {
          const data = await r.json();
          // Mettre à jour le cache local (clé par clé)
          Object.keys(data).forEach(k => {
            localStorage.setItem('rapportCPSS_' + k, JSON.stringify(data[k]));
          });
          // Retourner la liste des clés avec labels
          return Object.keys(data).map(k => ({ key: k, label: nomAffichage(k) }));
        }
      } catch {}
    }
    // Fallback : reconstruire depuis localStorage
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rapportCPSS_')) {
        keys.push({ key: k.replace('rapportCPSS_', ''), label: nomAffichage(k.replace('rapportCPSS_', '')) });
      }
    }
    return keys;
  }

  async function loadRapport(key) {
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/rapports/' + encodeURIComponent(key));
        if (r.ok) {
          const data = await r.json();
          localStorage.setItem('rapportCPSS_' + key, JSON.stringify(data));
          return data;
        }
      } catch {}
    }
    const local = localStorage.getItem('rapportCPSS_' + key);
    return local ? JSON.parse(local) : null;
  }

  async function saveRapport(key, data) {
    localStorage.setItem('rapportCPSS_' + key, JSON.stringify(data));
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/rapports/' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (r.ok) {
          showStatus('✅ Rapport sauvegardé', '#2e7d32');
          return true;
        }
      } catch {}
    }
    showStatus('💾 Rapport sauvegardé localement (hors-ligne)', '#e65100');
    return false;
  }

  async function deleteRapport(key) {
    localStorage.removeItem('rapportCPSS_' + key);
    await checkOnline();
    if (_online) {
      try {
        await fetch('/api/rapports/' + encodeURIComponent(key), { method: 'DELETE' });
      } catch {}
    }
  }

  // ── Utilitaire label rapport ──────────────────────────────────────
  function nomAffichage(cle) {
    const match = cle.match(/^(.+)_S(\d+)_(\d+)$/);
    if (match) return decodeURIComponent(match[1]) + ' — Semaine ' + match[2] + ' / ' + match[3];
    return cle;
  }

  // ── Ping auto toutes les 10 min pour garder le serveur éveillé ───
  setInterval(() => {
    fetch('/ping', { cache: 'no-store' }).catch(() => {});
  }, 10 * 60 * 1000);

  return { loadStock, saveStock, loadRapports, loadRapport, saveRapport, deleteRapport, getRole, requireAuth, nomAffichage, checkOnline };

})();
