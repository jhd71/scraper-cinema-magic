# 🎬 Scraper Cinéma Magic Le Creusot

Ce projet utilise **Puppeteer** pour scraper automatiquement les horaires du cinéma **Magic** au Creusot.

## 📁 Structure

```
scraper-cinema-magic/
├── scrape-magic.js           # Script de scraping
├── package.json              # Dépendances
├── .github/
│   └── workflows/
│       └── scrape-magic.yml  # GitHub Actions
└── data/
    └── cinema-magic.json     # Données des films (généré)
```

## 🔄 Fonctionnement

Le script `scrape-magic.js` :
1. Lance un navigateur Puppeteer (Chrome headless)
2. Charge la page des horaires du Cinéma Magic
3. Attend que le JavaScript charge les films
4. Extrait les titres, horaires, durées et genres
5. Sauvegarde le tout dans `data/cinema-magic.json`

## ⏰ Exécution automatique

Le workflow GitHub Actions s'exécute :
- 🕒 **Toutes les 3 heures** (cron)
- Ou **manuellement** depuis l'onglet Actions

## 📦 Données générées

Le fichier `data/cinema-magic.json` contient :

```json
{
  "cinema": {
    "nom": "Magic",
    "ville": "Le Creusot",
    "adresse": "Le Creusot",
    "url": "https://www.cinemamagic-creusot.fr"
  },
  "date": "2026-02-06",
  "dateUpdate": "2026-02-06T08:00:00.000Z",
  "films": [
    {
      "titre": "Film Example",
      "duree": "1h40",
      "genre": "Comédie",
      "horaires": ["14:00", "16:30", "20:30"]
    }
  ]
}
```

## 🔗 Utilisation avec actuetmedia.fr

Le widget cinéma d'actuetmedia.fr peut récupérer ce fichier JSON via :

```
https://raw.githubusercontent.com/jhd71/scraper-cinema-magic/main/data/cinema-magic.json
```

## 🛠️ Installation locale

```bash
npm install
npm run scrape
```

## 📬 Contact

[contact@actuetmedia.fr](mailto:contact@actuetmedia.fr)
