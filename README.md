# Le Laboratoire du Savant Fou

Application d’écriture, bibliothèque privée et mémorisation intégrée. React / Tiptap / PostgreSQL, API Netlify Functions, Neon Managed Better Auth, historique et récupération des sauvegardes. La mission 2 ajoute les textes à trous et FSRS 6.

Site : https://le-laboratoire-du-savant-fou.netlify.app. Les ressources Neon et Netlify existantes sont conservées. Les essais de migration et de mémorisation utilisent d’abord la branche Neon `development` et un déploiement de branche Netlify ; la production n’est mise à jour qu’après leur validation. Les intégrations partagées email et Google de Neon évitent la configuration d’un SMTP externe pour cette étape.

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

- Comptes Neon Managed Better Auth avec codes de confirmation/récupération et Google partagé. Sessions vérifiées côté serveur ; identifiants documentaires historiques préservés.
- Documents, dossiers hiérarchiques, déplacement, recherche, corbeille restaurable et reprise du travail.
- Texte riche, polices/tailles/couleurs, titres, plan, alignement, interlignes, retraits, listes/tâches, tableaux, images privées, liens et équations LaTeX.
- Recherche/remplacement, undo/redo, raccourcis, collage enrichi, sauvegarde automatique, conflits explicites et copies locales de récupération.
- Historique, import/export DOCX, PDF via l’impression, export texte et JSON.
- A4/Letter, marges, orientation et sauts de page manuels. **Pas de pagination automatique exacte à l’écran** : le document s’affiche en continu et se pagine à l’impression.
- Textes à trous : sélection multistyle, indices et priorités, annotations supprimables sans effacer le texte, identité persistante et filiation des copies.
- Révision libre sans modification du calendrier ; révision programmée filtrée par documents/dossiers/priorités, séances conservées côté serveur, notes dédupliquées et reprise après interruption réseau.
- FSRS 6 avec `ts-fsrs` 5.4.2. Les réponses modifiées ou fragmentées sont suspendues jusqu’à validation explicite ; changer la priorité conserve l’apprentissage.

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

Le schéma `lab` ne remplace aucune table d’un autre produit ; Neon Auth conserve son schéma géré `neon_auth`. Les abonnements restent réservés à la mission 3. Consulter [le fonctionnement de la mémorisation](docs/learning.md), [les prérequis](docs/prerequisites.md) et [les résultats de validation](docs/validation.md).
