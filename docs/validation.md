# Validation

Recette locale du 14 octobre 2026, Node 24.19.0 et Chromium système. Les résultats ci-dessous ne sont pas une recette du service hébergé.

| Vérification exécutée | Résultat |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache` | Installation reproductible : 624 paquets |
| `npm run typecheck` | Réussi, aucune erreur TypeScript |
| `npm test` | 22 tests réussis, 4 fichiers |
| `npm run build` | Build de production réussi |
| `npm run build:functions` | Paquet officiel Netlify ZIP généré, API v2, environ 3 Mo |
| `npm run test:e2e` | 3 parcours Chromium réussis |

Le build conserve un avertissement de taille sur le module d’éditeur chargé à la demande : environ 865 ko minifiés, 263 ko compressés. L’import et l’export DOCX sont chargés séparément. TypeScript est fixé à 5.9.3 : la version 7 testée ne fournissait pas l’API JavaScript attendue par le bundler Netlify.

Les tests API utilisent une base PostgreSQL PGlite réelle et le schéma/API destinés à Neon. Ils vérifient confirmation email, sessions, connexion/récupération, révocation, origine, isolation des comptes et des images, refus de promotion, contenus, versions, conflits, dossiers, recherche, corbeille et persistance après reconnexion. Une fermeture/réouverture de la base, avec réapplication idempotente des migrations, conserve comptes, session et documents.

Le contrat documentaire teste la recherche traversant les styles, la réidentification de copies, les fragments formatés et le rejet des structures invalides. Les tests d’éditeur vérifient aussi le couper-coller préservant l’identité et le saut de page préservant l’image sélectionnée. Les tests de formats examinent le contenu XML du DOCX produit, sa réimportation sémantique et le refus d’archives trop volumineuses.

Les trois parcours Chromium couvrent :

1. Inscription, confirmation depuis la boîte locale, dossier, document, mise en forme, recherche/remplacement, tableau modifiable, équation, image, saut de page, versions, exports DOCX/PDF, déconnexion/reconnexion et contenu conservé. Le PDF produit contient plusieurs pages A4 ; les erreurs JavaScript sont surveillées.
2. Conflit entre deux onglets, conservation dans une nouvelle copie, interruption réseau, rechargement et récupération/synchronisation de la copie locale.
3. Import DOCX, liste, case à cocher, lien, collage HTML enrichi et affichage mobile sans débordement horizontal.

Captures et exports : `test-results/`, ignoré par Git. Le workflow `.github/workflows/ci.yml` reproduit les vérifications ; son exécution distante n’est pas attestée par les résultats locaux.

## Audit des dépendances

`npm audit --omit=dev` : **7 alertes modérées, aucune haute ni critique** à cette date. L’audit sort donc avec un code non nul ; il n’est pas présenté comme intégralement réussi.

- Quatre entrées concernent esbuild ancien via `@esbuild-kit/*` et `drizzle-kit`, outil de génération des migrations. L’avis GHSA-67mh-4wv8-2f99 concerne son serveur de développement, non utilisé par cette application. Ces outils ne sont pas importés par la fonction de production.
- Trois entrées concernent `sprintf-js`, `argparse` et Mammoth (GHSA-hp3w-g68c-fv3c). L’import d’argparse se trouve dans `mammoth/bin/mammoth`, pas dans le convertisseur navigateur utilisé. Aucune version corrigée de sprintf-js n’était publiée lors de l’inspection. Le programme CLI Mammoth n’est pas exécuté.

Les rétrogradations majeures proposées automatiquement par npm ne sont pas appliquées. Cette analyse de portée ne remplace pas le suivi des correctifs amont ni un audit de sécurité complet.

## Vérifications encore bloquées

Non attesté sans configuration externe : Neon hébergé, publication Netlify, Blobs en production, réception SMTP externe et OAuth Google réel. Les accès correspondants ne sont pas fournis à cet environnement. La recette locale utilise des emails déposés sur disque, pas un envoi SMTP simulé présenté comme reçu.
