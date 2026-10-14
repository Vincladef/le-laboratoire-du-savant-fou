# Validation

Recettes du 14 octobre 2026. Les résultats locaux et ceux du service hébergé sont distingués ci-dessous.

## Tests locaux

Node 24.19.0 et Chromium système. Dernière exécution après ajout du déploiement contrôlé :

| Vérification exécutée | Résultat |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache` | Installation reproductible : 624 paquets |
| `npm run typecheck` | Réussi, aucune erreur TypeScript |
| `npm test` | 25 tests réussis, 5 fichiers |
| `npm run build` | Build de production réussi |
| `npm run build:functions` | Paquet officiel Netlify ZIP généré, API v2, environ 3 Mo |
| `npm run test:e2e` | 4 tests Chromium réussis |

Le build conserve un avertissement de taille sur le module d’éditeur chargé à la demande : environ 865 ko minifiés, 263 ko compressés. L’import et l’export DOCX sont chargés séparément. TypeScript est fixé à 5.9.3 : la version 7 testée ne fournissait pas l’API JavaScript attendue par le bundler Netlify.

Les tests API utilisent une base PostgreSQL PGlite réelle et le schéma/API destinés à Neon. Ils vérifient confirmation email, sessions, connexion/récupération, révocation, origine, isolation des comptes et des images, refus de promotion, contenus, versions, conflits, dossiers, recherche, corbeille et persistance après reconnexion. Une fermeture/réouverture de la base, avec réapplication idempotente des migrations, conserve comptes, session et documents.

Le contrat documentaire teste la recherche traversant les styles, la réidentification de copies, les fragments formatés et le rejet des structures invalides. Les tests d’éditeur vérifient aussi le couper-coller préservant l’identité et le saut de page préservant l’image sélectionnée. Les tests de formats examinent le contenu XML du DOCX produit, sa réimportation sémantique et le refus d’archives trop volumineuses.

Les quatre tests Chromium couvrent :

1. Inscription, confirmation depuis la boîte locale, dossier, document, mise en forme, recherche/remplacement, tableau modifiable, équation, image, saut de page, versions, exports DOCX/PDF, déconnexion/reconnexion et contenu conservé. Le PDF produit contient plusieurs pages A4 ; les erreurs JavaScript sont surveillées.
2. Conflit entre deux onglets, conservation dans une nouvelle copie, interruption réseau, rechargement et récupération/synchronisation de la copie locale.
3. Import DOCX, liste, case à cocher, lien, collage HTML enrichi et affichage mobile sans débordement horizontal.
4. Message explicite et inscription désactivée lorsque l’email est indisponible, tout en conservant la connexion. Ce test d’interface simule uniquement la réponse de configuration sans SMTP.

Captures et exports : `test-results/`, ignoré par Git. Le workflow `.github/workflows/ci.yml` reproduit les vérifications ; son exécution distante n’est pas attestée par les résultats locaux.

## Service Netlify avec Neon réel

URL : https://le-laboratoire-du-savant-fou.netlify.app. Ressources existantes réutilisées : site `449cbaf7-eaaa-43ce-8b27-50460f3d036c`, projet Neon `little-dust-51900608`, branche `production`, base `laboratoire`.

Le déploiement `6acff50a52807745eacd6afb` a été constaté `ready`, plugin `success`. Le rapport a été récupéré par l’API authentifiée Netlify `plugin_runs/latest` : **15 tables, une migration déjà appliquée, zéro migration rejouée et 8 contrôles distants réussis**. Il provient de requêtes HTTPS vers le service de production depuis le build Netlify, pas de PGlite ni d’un faux serveur.

| Contrôle hébergé | Résultat |
| --- | --- |
| Santé du service, connexion PostgreSQL réelle | Réussi |
| Accès sans session | Refusé, HTTP 401 attendu |
| Inscription sans SMTP | Refusée proprement, HTTP 503 attendu |
| Connexion email/mot de passe des comptes de contrôle | Réussie ; cookies Secure, HttpOnly, SameSite=Lax |
| Dossiers, contenu riche, sauvegarde et historique | Réussi |
| Image Netlify Blobs et isolation entre deux comptes | Octets conservés ; accès croisés refusés |
| Sauvegarde avec révision obsolète | Conflit HTTP 409 attendu |
| Déconnexion/reconnexion et lecture directe Neon | Même contenu et même révision conservés |

Deux comptes gratuits temporaires `@example.test` sont provisionnés administrativement pour la recette, puis supprimés avec leurs documents et sessions. Cette provision de fixtures **ne valide pas une inscription par email public**. Les images de test restantes sont signalées séparément pour nettoyage ciblé par l’API Netlify : un jeton de build ne peut pas supprimer un fichier du magasin partagé.

Le nettoyage ciblé des images des recettes terminées a été effectué via l’API Netlify après vérification de leur identité, taille et empreinte. Les réponses DELETE 204 puis GET 404 confirment leur suppression. La liste du magasin peut temporairement conserver des entrées périmées ; aucun fichier utilisateur ni magasin complet n’a été supprimé.

La machine Codex reste soumise à sa liste de domaines autorisés : la recette hébergée a été exécutée dans le déploiement Netlify. Les tests Chromium restent une recette locale ; aucune recette navigateur distante n’est revendiquée.

## Audit des dépendances

`npm audit --omit=dev` : **7 alertes modérées, aucune haute ni critique** à cette date. L’audit sort donc avec un code non nul ; il n’est pas présenté comme intégralement réussi.

- Quatre entrées concernent esbuild ancien via `@esbuild-kit/*` et `drizzle-kit`, outil de génération des migrations. L’avis GHSA-67mh-4wv8-2f99 concerne son serveur de développement, non utilisé par cette application. Ces outils ne sont pas importés par la fonction de production.
- Trois entrées concernent `sprintf-js`, `argparse` et Mammoth (GHSA-hp3w-g68c-fv3c). L’import d’argparse se trouve dans `mammoth/bin/mammoth`, pas dans le convertisseur navigateur utilisé. Aucune version corrigée de sprintf-js n’était publiée lors de l’inspection. Le programme CLI Mammoth n’est pas exécuté.

Les rétrogradations majeures proposées automatiquement par npm ne sont pas appliquées. Cette analyse de portée ne remplace pas le suivi des correctifs amont ni un audit de sécurité complet.

## Vérifications encore en attente

Réception SMTP externe, inscription/confirmation/récupération avec un véritable email, et OAuth Google réel restent non validés. Aucun fournisseur email ni identifiant Google n’est configuré. L’inscription et la récupération publiques restent donc désactivées ; les clés Neon/Netlify ne donnent pas accès à un fournisseur SMTP ou à un projet Google Cloud. Les confirmations de la recette locale utilisent explicitement la boîte locale.
