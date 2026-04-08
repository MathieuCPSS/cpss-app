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
      const r = await fetch('/api/me', { credentials: 'include' });
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
        const r = await fetch('/api/stock', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          localStorage.setItem('stockItems', JSON.stringify(data));
          showStatus('✅ Stock synchronisé', '#2e7d32');
          return data;
        }
      } catch {}
    }
    showStatus('⚠️ Mode hors-ligne — données locales', '#c62828');
    const local = localStorage.getItem('stockItems');
    return local ? JSON.parse(local) : [];
  }

  async function saveStock(items) {
    localStorage.setItem('stockItems', JSON.stringify(items));
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(items),
          credentials: 'include'
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
        const r = await fetch('/api/rapports', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          if (Object.keys(data).length > 0) {
            Object.keys(data).forEach(k => {
              localStorage.setItem('rapportCPSS_' + k, JSON.stringify(data[k]));
            });
            showStatus('✅ Rapports synchronisés', '#2e7d32');
            return Object.keys(data).map(k => ({ key: k, label: nomAffichage(k) }));
          }
          showStatus('⚠️ Serveur vide — données locales', '#e65100');
        }
      } catch {}
    } else {
      showStatus('⚠️ Mode hors-ligne — données locales', '#c62828');
    }

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rapportCPSS_')) {
        const cle = k.replace('rapportCPSS_', '');
        keys.push({ key: cle, label: nomAffichage(cle) });
      }
    }
    return keys;
  }

  async function loadRapport(key) {
    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/rapports/' + encodeURIComponent(key), {
          credentials: 'include'
        });
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

    const heuresTerrain = JSON.parse(localStorage.getItem("heuresTerrain") || "{}");
    const heuresTrajet  = JSON.parse(localStorage.getItem("heuresTrajet")  || "{}");
    const joursTerrain  = JSON.parse(localStorage.getItem("joursTerrain")  || "{}");
    const joursTrajet   = JSON.parse(localStorage.getItem("joursTrajet")   || "{}");

    const datesRapport = (data.lignes || [])
      .map(l => l.date)
      .filter(d => d && d.length === 10);

    data._heuresTerrain = {};
    data._heuresTrajet  = {};
    data._joursTerrain  = {};
    data._joursTrajet   = {};

    datesRapport.forEach(date => {
      if (heuresTerrain[date] !== undefined) data._heuresTerrain[date] = heuresTerrain[date];
      if (heuresTrajet[date]  !== undefined) data._heuresTrajet[date]  = heuresTrajet[date];
      if (joursTerrain[date]  !== undefined) data._joursTerrain[date]  = joursTerrain[date];
      if (joursTrajet[date]   !== undefined) data._joursTrajet[date]   = joursTrajet[date];
    });

    localStorage.setItem('rapportCPSS_' + key, JSON.stringify(data));

    await checkOnline();
    if (_online) {
      try {
        const r = await fetch('/api/rapports/' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
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
        await fetch('/api/rapports/' + encodeURIComponent(key), {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch {}
    }
  }

  function nomAffichage(cle) {
    const match = cle.match(/^(.+)_S(\d+)_(\d+)$/);
    if (match) return decodeURIComponent(match[1]) + ' — Semaine ' + match[2] + ' / ' + match[3];
    return cle;
  }

  setInterval(() => {
    fetch('/ping', { cache: 'no-store' }).catch(() => {});
  }, 10 * 60 * 1000);

  return { loadStock, saveStock, loadRapports, loadRapport, saveRapport, deleteRapport, getRole, requireAuth, nomAffichage, checkOnline };

})();
