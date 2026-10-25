# 🏀 Hoop Track

Application web (PWA) pour suivre **une équipe de basket pendant une saison** : effectif, calendrier et résultats, statistiques détaillées et **saisie en direct des actions pendant le match**. Conçue pour une **tablette Android en paysage**, elle fonctionne **entièrement hors ligne** : les données restent sur l’appareil.

## Fonctionnalités

| Écran | Contenu |
| --- | --- |
| **Accueil** | Bilan V/D, série en cours, points marqués / encaissés, prochain match, écart de points par match, meilleurs joueurs, derniers résultats |
| **Joueurs** | Effectif (numéro, poste, actif/inactif), ajout en rafale (« Enregistrer et ajouter ») |
| **Fiche joueur** | Moyennes, adresse aux tirs, évolution par match, radar comparé à l’équipe, carte des tirs (points / zones), répartition des points, historique match par match |
| **Matchs** | Calendrier, filtres à venir / joués, saisie d’un score seul pour un match non suivi |
| **Préparation** | Convocations, cinq de départ, chrono suivi ou non |
| **Match en direct** | Terrain tactile, pavé d’actions, score adverse, fautes, changements, chrono, journal modifiable |
| **Résumé du match** | Feuille de stats, graphiques (évolution du score, points par période), carte des tirs, déroulé, export CSV, impression PDF |
| **Stats équipe** | Moyennes, points marqués/encaissés, carte des zones de tir, tableau joueurs (moyennes / totaux) triable, export CSV |
| **Réglages** | Nom et couleur de l’équipe, saisons, format par défaut, vibration, sauvegarde / restauration JSON, saison de démonstration |

### Saisie en direct

Pensée pour être **rapide et sans erreur**, dans les deux sens : *joueur → action* ou *action → joueur*.

- **Tir** : touchez un joueur, puis l’endroit du tir sur le terrain. La zone et la valeur (2 ou 3 pts) sont détectées automatiquement et restent modifiables. Validez ensuite par **Réussi** ou **Raté**.
- **Questions de suivi** (5 s, ignorables) :
  - **passe décisive** après un panier réussi ;
  - **rebond offensif** après un tir ou un lancer franc raté ;
  - **nombre de lancers francs** après une faute provoquée, puis réussi/raté pour chacun.
- **Actions** : LF réussi/raté, rebonds offensif/défensif, passe décisive, interception, contre, faute provoquée, balle perdue, faute.
- **Adversaire** : +1 / +2 / +3.
- **Fautes** :
  - fautes personnelles visibles sur chaque joueur ;
  - fautes d’équipe par période, avec alerte à la 5e (lancers francs) ;
  - à la 5e faute personnelle, le joueur est exclu et le changement est proposé.
- **Changements** : plusieurs à la fois, dans n’importe quel ordre.
- **Annulation et corrections** : bouton **Annuler** sur chaque notification et dans le journal ; toute action du journal peut être modifiée ou supprimée.
- **Confort** : vibration à chaque saisie, écran maintenu allumé, mode plein écran.
- **Chrono optionnel** : s’il est activé, il permet de calculer les minutes jouées de chaque joueur.

### Statistiques calculées

Points, tirs (2 pts, 3 pts, LF) et pourcentages, eFG %, rebonds offensifs et défensifs, passes décisives, interceptions, contres, balles perdues, fautes commises et provoquées, minutes, +/-, évaluation.

**Évaluation** = PTS + REB + PD + INT + CTR + FPr − (tirs ratés + LF ratés + BP + FP)

## Démarrage

Prérequis : Node.js 22 (ou 20.19+).

```bash
npm install
npm run dev        # http://localhost:5173
```

Sur la page d’accueil, **Charger la démo** remplit une saison fictive pour découvrir l’application.

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` (avec service worker) |
| `npm run preview` | Sert le build localement |
| `npm test` | Tests unitaires du moteur de statistiques (Vitest) |
| `npm run e2e` | Tests de bout en bout (Playwright, tablette 1280×800) |
| `npm run lint` | Analyse statique (oxlint) |
| `npm run icons` | Régénère les icônes PWA à partir du logo |

> Les tests e2e nécessitent Chromium : `npx playwright install chromium`.

## Installation sur une tablette Android

1. Déployez le dossier `dist/` sur un hébergement statique en **HTTPS**, obligatoire pour une PWA. Par exemple : GitHub Pages, Netlify, Vercel ou Cloudflare Pages. Les chemins sont relatifs, donc un sous-dossier fonctionne aussi.
2. Ouvrez l’adresse dans **Chrome** sur la tablette.
3. Menu ⋮ → **Ajouter à l’écran d’accueil** (ou **Installer l’application**).
4. L’application s’ouvre en plein écran, en paysage, et fonctionne **sans connexion**. Les mises à jour s’installent automatiquement au lancement suivant.

## Données et sauvegarde

- Toutes les données sont stockées **localement**, dans IndexedDB sur la tablette. Aucun compte et aucun serveur ne sont utilisés.
- **Réglages → Exporter** crée un fichier JSON complet. **Importer** le restaure, sur la même tablette ou une autre.
- ⚠️ Désinstaller l’application ou effacer les données de Chrome supprime tout. Exportez régulièrement.

## Technique

- React 19, TypeScript, Vite, Tailwind CSS 4
- Dexie (IndexedDB), Recharts, terrain en SVG
- vite-plugin-pwa (Workbox)
- Stockage *event sourcing* : chaque action du match est un événement. Les statistiques sont recalculées à la volée (`src/domain/stats.ts`), ce qui rend les corrections et annulations fiables.

```
src/
  domain/      types, géométrie du terrain, moteur de statistiques (+ tests)
  db/          base IndexedDB, opérations, données de démonstration
  hooks/       accès réactif aux données, fonctions de l’appareil (vibration, écran allumé)
  components/  UI, terrain, graphiques, tableaux, composants de saisie live
  pages/       écrans de l’application
e2e/           tests Playwright
```
