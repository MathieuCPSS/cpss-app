# CPSS App — Guide de déploiement sur Render.com

## Structure des fichiers
```
cpssapp/
├── server.js          # Serveur Node.js
├── package.json       # Dépendances
├── render.yaml        # Config déploiement
├── data/              # Données (créé automatiquement)
│   ├── stock.json
│   └── rapports.json
└── public/            # Pages web
    ├── login.html     # Page de connexion
    ├── menu.html      # Menu principal
    ├── stock.html     # Gestion du stock
    ├── rapport.html   # Rapports d'intervention
    └── api.js         # Client API partagé
```

---

## Déploiement sur Render.com (gratuit)

### Étape 1 — Créer un compte GitHub
1. Allez sur https://github.com et créez un compte gratuit
2. Créez un nouveau repository **privé** nommé `cpss-app`
3. Uploadez tous les fichiers du dossier `cpssapp/`

### Étape 2 — Déployer sur Render
1. Allez sur https://render.com et créez un compte gratuit
2. Cliquez **New → Web Service**
3. Connectez votre repository GitHub `cpss-app`
4. Render détecte automatiquement la config grâce à `render.yaml`

### Étape 3 — Configurer les mots de passe
Dans Render, allez dans **Environment** et modifiez :
- `ADMIN_PASSWORD` → votre mot de passe admin
- `VIEWER_PASSWORD` → mot de passe pour le bureau

### Étape 4 — C'est prêt !
Render vous donne une URL du type `https://cpss-app.onrender.com`
- Ouvrez cette URL sur PC, téléphone et tablette
- Connectez-vous avec votre mot de passe
- Les données sont synchronisées entre tous les appareils

---

## Fonctionnement hors-ligne
Si internet est coupé :
- L'app continue de fonctionner avec les données locales (localStorage)
- Une barre orange indique le mode hors-ligne
- Dès que la connexion revient, les données se synchronisent automatiquement

---

## Partager avec le bureau
Donnez simplement :
- L'URL de l'app
- Le mot de passe bureau (`VIEWER_PASSWORD`)

Le bureau pourra **consulter** le stock et les rapports mais **pas modifier**.

---

## Changer les mots de passe
Dans Render → votre service → **Environment** → modifier les variables → **Save Changes**
Le serveur redémarre automatiquement.
