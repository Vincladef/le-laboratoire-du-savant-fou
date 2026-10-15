# Mission 4 — design, sécurité et recette

Recette du 15 octobre 2026. Les résultats de publication sont ajoutés après vérification, pas déduits d’un push. Les rapports des missions précédentes restent des instantanés historiques ; cette mission remplace leur choix d’interface de facturation à la demande du titulaire.

## Livraison fonctionnelle

- Palette papier, encre verte et laiton, titres Georgia et instruments Lucide ; aucun service de polices ou traceur externe ajouté. Les styles du thème concernent l’interface, pas les polices/couleurs choisies dans les documents.
- Page à la largeur disponible par défaut, jusqu’à 200 % de zoom ; zooms physiques toujours accessibles. Les marges, le format et les exports enregistrés ne sont pas modifiés par cet ajustement visuel.
- Plan fermé par défaut, commande visible près du titre, fermeture dans le panneau, préférence conservée par compte. Sur tablette/téléphone, le plan s’ouvre au-dessus du document au lieu d’être masqué de force.
- Outils mobiles en lignes défilantes plutôt qu’en multiples rangées encombrantes ; hauteur dynamique du viewport. Les panneaux de mémorisation restent repliables.
- Liens Stripe Pro/Premium directs, sans cases d’acceptation ni bloc juridique volumineux. Fenêtre légale discrète, nom accessible, fermeture Échap et retour du focus. Textes préparatoires identifiés comme tels.
- Écran de récupération si un module d’interface ne se charge pas : rechargement ou retour à la bibliothèque sans effacement des brouillons.

Les droits payants ne sont jamais déduits d’un lien ou d’un paiement annoncé par le navigateur. La synchronisation Stripe n’étant pas configurée, un achat externe ne débloque pas automatiquement les quotas. Aucun achat réel n’a été effectué.

## Audit et protections conservées

| Périmètre | Contrôle et résultat |
| --- | --- |
| Sessions et comptes | Chaque route privée revalide Neon Auth, filtre par propriétaire ; identité historique conservée, email vérifié exigé. Récupération avec révocation des sessions du seul sujet résolu côté serveur. |
| Autorisations | Administration réservée au sujet propriétaire configuré côté serveur. Aucun rôle accepté dans les modifications de profil. Droits/quotas évalués dans les transactions de création et de sauvegarde. |
| Écritures et données | Origine exacte exigée ; révisions optimistes 409, versions immuables, copies locales par compte/onglet, aucune fusion/écrasement silencieux. |
| Stripe | Route webhook exacte seule exemptée du contrôle Origin ; corps original, vérification SDK/signature et déduplication transactionnelle conservés. Tests avec transport Stripe substitué, pas avec des paiements réels. |
| Fichiers et imports | Images privées servies après autorisation ; PNG/JPEG/WebP, signature et taille contrôlées, SVG et URL arbitraire refusés. DOCX borné avant décompression, HTML nettoyé par DOMPurify, JSON documentaire validé côté serveur. |
| Secrets et navigateur | Variables serveur sans préfixe VITE, aucune clé dans le client/Git ; CSP, refus d’encadrement, nosniff, no-store API, cookies sécurisés. Pas de nouveau fournisseur externe. |
| Migrations | Aucune nouvelle migration requise pour cette mission d’interface. Journal/hashes des 10 migrations existantes vérifiés sur development avant production ; aucune réécriture ni purge. |
| Reprise | Défaut de retour du focus et contrastes corrigés après tests. Une panne volontaire de chargement est récupérée dans le navigateur. Brouillons, conflits et notes hors ligne restent testés. |

Neon indique par API **21 600 secondes, soit six heures de restauration historique** sur le projet existant. Les versions documentaires et brouillons ne constituent pas une sauvegarde indépendante de la base. Aucune restauration destructive de production ni export intégral contenant des données personnelles n’a été exécuté. Avant une exploitation commerciale durable : définir rétention, sauvegarde externe chiffrée avec destination autorisée et tester sa restauration isolée ; aucun stockage supplémentaire payant n’a été souscrit.

`npm audit --omit=dev` : **7 alertes modérées, 0 haute, 0 critique**, code de sortie 1. Elles concernent esbuild transitif de l’outillage Drizzle (serveur de développement non utilisé en production) et sprintf-js/argparse transitifs de Mammoth. Le chemin d’import navigateur ne lance pas le CLI argparse ; les limites DOCX restent appliquées. Cela ne rend pas les alertes inexistantes. Aucun `audit fix --force` ni rétrogradation incompatible des moteurs.

## Tests locaux

TypeScript, **76 tests Vitest dans 8 fichiers**, compilation Vite et empaquetage officiel Functions v2 réussis. **12 parcours Playwright/Chromium réussis** après correction et relance intégrale. Les tests navigateur utilisent Chromium, PGlite et mails locaux isolés, pas Neon pour cette partie. Le contrôle axe-core couvre connexion, formules, dialogue, bibliothèque, éditeur et révisions : aucune violation des règles WCAG A/AA sélectionnées sur ces écrans lors de la recette. Il ne constitue pas une certification globale ni un audit manuel de lecteur d’écran.

Un premier essai a détecté un focus perdu et des contrastes insuffisants : corrigés puis rejoués. Le retour du focus est synchrone avant affichage, afin de ne pas écraser une sélection suivante dans l’éditeur. L’extension de la suite a ensuite atteint la limite réelle de cinq inscriptions/minute d’une même IP de développement : le proxy Vite ajoutait une adresse de boucle locale non déclarée comme proxy de confiance. Ces seuls relais locaux sont désormais déclarés en développement et chaque client de test possède une IP distincte. Un test prouve le refus de la neuvième tentative et l’indépendance d’un autre client ; **la protection n’est pas désactivée ni relâchée en production**. Une erreur JavaScript de chargement est provoquée uniquement dans le scénario de récupération, et attendue par celui-ci.

La campagne couvre : inscription/confirmation locale, reconnexion, documents/dossiers, formats Word/PDF, texte riche, tableaux, image, équation, versions, collage, conflits entre onglets, brouillons après coupure, annotations multistyles, indices/priorités, FSRS, déduplication et reprise mobile, liens Stripe exacts et refus de privilèges.

Un document de **1 000 paragraphes et 100 annotations** est créé via l’API, ouvert, modifié et relu après sauvegarde. Mesure du dernier passage complet : **340 495 caractères de JSON, ouverture 1 210 ms, modification et sauvegarde 2 306 ms**. La mesure est jointe au rapport Playwright ; c’est un échantillon Chromium local, pas un SLA ou une garantie sur tous les téléphones. Maximum documentaire existant : 2 Mo JSON / 50 000 nœuds.

## Déploiements et persistance

Le commit applicatif `42d6b1491dd55cc10041614757d5d347d8684a84` est présent sur la branche de test GitHub. Le déploiement development **`6ad136064ac161d0e285bf86`** est `ready`, avec **15 contrôles Auth/Neon réussis**, journal des **10 migrations** reconnu, **0 migration nouvelle**, **19 tables**. Inventaires avant/après identiques : les 4 identités Auth préexistantes sont conservées et les fixtures ont été retirées. Les contrôles du site HTTPS publié suivent cette première vérification de la vraie base.

La seconde recette development, déploiement **`6ad1367885fa75fd3e38e0d6`**, est `ready` : **16 contrôles HTTPS/Neon et 7 parcours Chromium hébergés réussis**, ordinateur et 390×844, **0 erreur JavaScript**. Elle vérifie notamment la page élargie et le plan, l’annotation multistyle, les deux modes de révision, FSRS/reprise et reconnexion, les liens Stripe et la fenêtre légale mobile. La lecture SQL confirme 3 cartes et 3 révisions avant nettoyage des fixtures ; inventaires avant/après identiques.

Production : le commit `280f17872e74e8e326d5d11a247aa583d3f19436` a été poussé puis relu depuis `main`. Son déploiement **`6ad137295e39dc184fadada2`** est `ready`, avec **15 contrôles Neon réussis**, 10 migrations reconnues et aucune migration nouvelle. L’inventaire actuel est de **1 utilisateur applicatif, 2 documents, 16 versions, 2 identités Auth, 1 passage et 1 carte** ; il diffère normalement de l’ancien rapport de mission 3 et n’a pas été ramené artificiellement à cet ancien état. Inventaires avant/après identiques et empreinte documentaire `2c1bb5577e9679c2a32856b8fb5ac947` inchangée ; données et protection des versions historiques conservées. La recette HTTPS/navigateur du site public suit ce premier déploiement.

La recette de production **`6ad1379e5ca0ddfee49ae51b`** est `ready` sur l’URL réelle : **16 contrôles HTTPS/Neon et 7 parcours Chromium réussis**, ordinateur et mobile, **0 erreur JavaScript**. Les cartes et notes créées via le navigateur sont relues directement dans Neon, puis les seules fixtures sont nettoyées. L’inventaire et l’empreinte documentaire restent identiques à ceux ci-dessus ; abonnements et événements de paiement réels non modifiés. L’artefact `index.html` publié correspond au build local : SHA-1 `7e8172aed8183d1771ad53b529593dd8f6006d4b`.

Après recette, les **8 variables temporaires** de préparation/validation ont été retirées de tous leurs contextes. L’API confirme qu’il ne reste que les **5 variables permanentes** du socle, séparées entre production et development. Aucun test ni migration ne sera rejoué par un build ordinaire. Les paramètres temporaires restent régénérables par les API autorisées.

L’installation figée `npm ci --cache /workspace/.npm-cache` a été rejouée (820 paquets), puis les builds réussis, sans modification inattendue du lockfile. Le démarrage explicite `LAB_LOCAL=1 AUTH_BASE_URL=http://localhost:5173 npm run dev` répond avec la vraie API locale PostgreSQL et une interface HTTP 200. Le processus `concurrently` identifié a été arrêté avec SIGINT et l’absence de ports locaux résiduels a été vérifiée ; ne pas arrêter seulement le shell npm parent.

## Limites explicites

- Word : conversion partielle (styles complexes, flottants, en-têtes/pieds de page, équations Word non garantis). PDF par impression, pagination continue à l’écran ; pas de moteur de pagination Google Docs. Les sauts manuels sont testés.
- Sauvegardes concurrentes : conflit explicite, pas de collaboration temps réel ni fusion automatique. Les brouillons sont privés au compte dans le navigateur mais non chiffrés contre l’accès au profil de l’appareil.
- Google : test de la redirection OAuth initiale uniquement, pas de consentement personnel. Email : service Neon et parcours vérifiés avec comptes synthétiques ; réception dans une boîte personnelle non attestée.
- Stripe : liens externes vérifiables, mais aucun achat, 3DS/refus, renouvellement ou portail réel testé. Pas d’activation automatique après achat sans raccordement serveur autorisé.
- Propriétaire : mécanisme sécurisé testé ; le rattachement du compte personnel reste dépendant de l’identité Neon vérifiée prévue côté serveur. Aucun autre compte promu arbitrairement.
- Conditions juridiques reportées selon la demande du titulaire, non inventées et non déclarées conformes. La version peut être publiée techniquement sans prétendre à une commercialisation entièrement automatisée et validée.
