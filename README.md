# Le Laboratoire du Savant Fou

Application d’écriture et bibliothèque privée. Mission 1 : React / Tiptap / PostgreSQL, API Netlify Functions, comptes Better Auth, historique et récupération des sauvegardes.

Site déployé : https://le-laboratoire-du-savant-fou.netlify.app. La base de production est Neon. L’ouverture des inscriptions publiques attend encore la configuration de l’envoi d’emails ; Google est facultatif et non configuré.

## Démarrer

Node.js 24 et npm :

```sh
npm ci
npm run dev
```

Interface sur le port 5173, API sur 3001. Le développement utilise **PGlite, PostgreSQL embarqué persistant**, dans `.local/`. Ce mode n’est pas un branchement à Neon. En production, `DATABASE_URL` est obligatoire, sans repli vers une base locale.

Au démarrage local, seules les migrations de la base locale sont appliquées. Les emails de développement sont déposés dans `.local/mail/*.json` : ouvrir le lien du fichier correspondant à son inscription pour confirmer le compte. Ces fichiers contiennent des liens d’authentification et ne doivent pas être publiés. Aucun compte ni mot de passe de production n’est prédéfini.

## Vérifier

```sh
npm run typecheck
npm test
npm run build
npm run build:functions
npm run test:e2e
```

Les tests navigateur créent une base distincte par exécution et des serveurs sur les ports 5174/3002. Chromium est détecté dans `/usr/bin/chromium` ; sinon installer le navigateur de Playwright avec `npx playwright install --with-deps chromium`. `CHROMIUM_PATH` permet d’indiquer une autre installation. Les tests ne sollicitent pas les services de production. Les résultats et captures sont dans `test-results/`.

## Fonctions du socle

- Comptes avec confirmation email, connexion, récupération et profil ; Google activable par configuration OAuth serveur.
- Documents, dossiers hiérarchiques, déplacement, recherche, corbeille restaurable et reprise du travail.
- Texte riche, polices/tailles/couleurs, titres, plan, alignement, interlignes, retraits, listes/tâches, tableaux, images privées, liens et équations LaTeX.
- Recherche/remplacement, undo/redo, raccourcis, collage enrichi, sauvegarde automatique, conflits explicites et copies locales de récupération.
- Historique, import/export DOCX, PDF via l’impression, export texte et JSON.
- A4/Letter, marges, orientation et sauts de page manuels. **Pas de pagination automatique exacte à l’écran** : le document s’affiche en continu et se pagine à l’impression.

Les conversions Word ne sont pas sans perte ; le JSON référence les images sans leurs fichiers. Voir [les limites des formats](docs/formats.md).

## Déploiement et documentation

Le [guide Netlify/Neon](docs/deployment.md) indique les ressources réutilisées et les variables nécessaires. Le build n’exécute aucune migration distante par défaut ; une préparation contrôlée est disponible sur activation explicite. Une configuration absente produit `503 SETUP_REQUIRED`, jamais un faux compte ou une fausse sauvegarde.

[Architecture](docs/architecture.md) · [Choix du moteur et licences](docs/editor-decision.md) · [Contrat des passages](docs/document-contract.md) · [Résultats de validation](docs/validation.md)

```text
src/components/   connexion et composants communs
src/library/      bibliothèque et dossiers
src/editor/       Tiptap, outils, conversions, sauvegardes
src/lib/          API, authentification cliente, récupération locale
src/shared/       contrat et validation documentaire
server/           API, authentification, stockage, schéma PostgreSQL
migrations/       migrations SQL versionnées
netlify/functions/ point d’entrée serverless
scripts/          serveur local et migration distante
tests/            tests API, contrat documentaire et navigateur
```

Le schéma `lab` ne remplace aucune table d’un autre produit. Les tables FSRS, passages et abonnements anticipent les missions suivantes ; aucune fonctionnalité pédagogique ou Stripe n’est active dans cette mission.
