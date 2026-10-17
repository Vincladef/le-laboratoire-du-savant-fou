# Simplification UX de Bouche-trou

## Périmètre

Mission demandée le 17 octobre 2026 : identité Bristol conservée, commandes plus compactes, document prioritaire et un seul parcours **Réviser**, sans FSRS, séances ou échéances. Les paiements et autres limites des missions précédentes ne sont pas modifiés par ce travail.

- Accès direct à la lecture depuis l’éditeur, sans choix de mode ni étape de lancement.
- Filtres exacts de priorité et de difficulté, combinables et initialement sur Toutes.
- Contexte intact : seuls les trous filtrés sont masqués ; les autres sont du texte normal.
- Indices au niveau du passage ; évaluation facultative après révélation et modification possible dans les outils de l’éditeur.
- Barre compacte et commandes de révélation visibles. Après retour utilisateur, le plan de l’éditeur reprend son organisation précédente : bouton « Plan » au-dessus du carnet à gauche et titres sous l’onglet actif, sans bouton « Navigation » dans l’en-tête.
- Le plan peut être masqué sans supprimer le contenu ; sa préférence reste persistante. Une seule zone défilante contient onglets et titres pour éviter les débordements sur mobile. Panneau des passages non ouvert automatiquement après création. Papier, encre, ruban et couleurs douces conservés.
- Ajustement suivant : croix du plan retirée ; seul le bouton « Plan » replie le panneau. Largeur du panneau réduite et plafond de 900 px supprimé : la page utilise la largeur disponible en mode « Largeur de page », sans modifier les dimensions d’export ni les zooms fixes.
- Le formulaire de création propose priorité et difficulté (Moyenne / Non évaluée par défaut). La difficulté initiale est sauvegardée atomiquement avec le document ; les sauvegardes et restaurations suivantes ne remplacent jamais une évaluation plus récente.
- Réglage de fuseau horaire retiré de l’interface, les dates documentaires utilisant le fuseau de l’appareil. Les anciennes préférences ne sont pas effacées lors d’un changement de nom.

## Données

La [migration 0012](../migrations/0012_amazing_cammi.sql) ajoute la difficulté et sa révision, sans réécrire le document. Dernière réponse explicite reprise (1/2 → Difficile, 3 → Moyenne, 4 → Facile), sinon Non évaluée. Aucune conversion arbitraire de la difficulté numérique FSRS.

Les tables historiques sont conservées comme archives inactives. Le code de planification, l’initialisation des cartes et la dépendance `ts-fsrs` sont supprimés ; les anciennes routes répondent 410. Ce retrait ne concerne pas les sessions d’authentification, indispensables à la sécurité des comptes.

Les évaluations sont distinctes des révisions documentaires, vérifiées et enregistrées en transaction. Contrôle optimiste pour ne pas écraser une autre évaluation ; renvoi immédiat idempotent après perte de réponse. Une erreur réseau n’est jamais affichée comme une réussite. Les protections de sauvegarde, l’historique documentaire et les identités des passages sont conservés. Détails : [révision simple](learning.md).

## Recette

La recette est exécutée sur bases locales isolées, puis development avant production. Les tests vérifient aussi les archives historiques, les styles, indices, priorités, suppressions, restaurations et copies. Les rapports des anciennes missions restent datés et décrivent leurs propres versions, pas le fonctionnement actuel.

Recette locale terminée : **95 tests Vitest dans 12 fichiers**, **14 parcours Playwright/Chromium**, TypeScript, compilation Vite et empaquetage officiel Netlify Functions v2 réussis. Les parcours incluent un document de 1 000 paragraphes/100 annotations, sa révision, les formats DOCX/PDF, la récupération après coupure réseau et les conflits documentaires. Axe-core WCAG A/AA ne signale aucune violation sur les écrans sélectionnés de cette campagne ; ce n’est pas une certification générale.

Les essais ont permis de corriger l’ordre serveur des passages (désormais celui du document, pas un ordre de dates identiques) et le rafraîchissement du nom du profil dans l’état client. Le scénario d’annotation prépare d’abord le texte complet, puis attend la fermeture réelle des fenêtres de création avant l’action suivante. Les assertions de persistance, de style, de concurrence et d’isolation restent actives.

Avant/après migration distante, des empreintes agrégées vérifient documents, annotations et archives sans publier leur contenu. La reprise de la dernière difficulté explicite est relue par SQL. La recette distante contrôle ensuite son inventaire avant/après et échoue en cas d’écart, sans effacer de nouvelles données pour rétablir un ancien comptage.

## Publication development

Le commit applicatif `e2a7ba14e25f0d42027c0d71f3a7717e2a40a581` est poussé et relu depuis GitHub. Le déploiement **`6ad3685574c0970654ae42e9`** est `ready` : **16 contrôles Neon réussis**, migration `0012` appliquée après reconnaissance des 12 migrations précédentes, 19 tables conservées.

Le contrôle SQL de migration confirme la préservation des documents, annotations, archives et évaluations explicites. L’inventaire development avant/après recette est identique : quatre identités Auth préexistantes conservées ; aucune donnée applicative de test restante. La production n’est pas modifiée par ce déploiement.

La recette publique **`6ad368c339c15e0abda1bc3a`** est `ready` : **17 contrôles HTTPS/Neon et 9 parcours Chromium hébergés**, ordinateur et 390×844, **0 erreur JavaScript**. Elle vérifie aussi la modification réelle du profil via Neon Managed Auth. Inventaire et empreintes des archives restent inchangés après nettoyage des fixtures.

Un dernier cas de navigation volumineuse (30 onglets et 25 titres sur téléphone) a mis en évidence un débordement des deux listes. Leur hauteur est désormais partagée dans le post-it, avec défilement interne ; elles ne recouvrent plus le document. Le scénario est conservé dans la recette d’onglets.

Le complément `d9dfe3d39efe34e782cc43034daaed8242789440` est rejoué localement (95 tests, 14 parcours), puis publié : préparation **`6ad36a3abb8fe7eec56c8029`** (`ready`, 16 contrôles Neon), recette publique finale **`6ad36a8d2c5d3d8bb76b8505`** (`ready`, **17 contrôles HTTPS/Neon, 9 parcours hébergés, 0 erreur JavaScript**). Les archives et l’inventaire restent inchangés ; aucune migration n’est réappliquée. Cette validation autorise la publication en production.

## Production — 17 octobre 2026

Le commit `62cf477274be210a480c969b7c6a76f4575c5198` est poussé sur `main` puis relu depuis GitHub. Le déploiement **`6ad36b28f02590fa05ace865`** est `ready` : une migration appliquée après les 12 précédentes, 19 tables et **16 contrôles Neon réussis**. La preuve SQL confirme documents, annotations et archives préservés ; deux passages présents, dont une difficulté reprise d’une évaluation explicite.

L’inventaire production avant/après recette est identique : 1 utilisateur applicatif, 2 documents, 27 versions, 2 identités Auth, 2 passages, 2 anciennes cartes, 1 ancienne révision et 1 ancienne séance ; profil historique préservé. Empreinte documentaire : `993207f8ba5f312f83c01f170ee0dcbe`. Ce sont les données constatées à ce moment, pas des nombres à rétablir en supprimant des modifications ultérieures. Aucune carte ou séance nouvelle n’est créée par la recette ; les fixtures sont retirées.

La recette publique production **`6ad36bb4026934cc262c4891`** est **`ready`** : **17 contrôles HTTPS/Neon et 9 parcours Chromium hébergés**, ordinateur et téléphone 390×844, **0 erreur JavaScript**. Elle vérifie connexion réelle, création multistyle de trous, filtrage combiné, révélation, difficulté facultative, reprise des onglets et reconnexion, profil Neon et affichage mobile. La persistance des difficultés est relue directement dans Neon ; documents, annotations et archives ont les mêmes empreintes avant/après nettoyage des fixtures.

Les huit variables temporaires de préparation/recette ont ensuite été retirées par API, dans tous leurs contextes. L’inventaire final confirme seulement les cinq variables serveur permanentes, dont les valeurs et contextes sont préservés. Les builds ordinaires ne lancent ni migration distante ni fixture de test. Aucun nouveau projet, changement d’offre ou achat de service n’a été effectué.

## Limites et choix explicites

- Un rechargement remasque les réponses : aucune séance ou progression n’est conservée. Seule la dernière difficulté enregistrée persiste.
- Après erreur réseau, l’évaluation n’est pas annoncée comme enregistrée ; le bouton de renvoi doit être utilisé avant de quitter la page. Aucun nouveau mécanisme de séance ou de suivi hors ligne n’est introduit.
- Les données FSRS historiques restent des archives inactives, récupérables dans la base. Leur conservation ne réactive aucun calendrier.
- Le JSON documentaire exporte texte, styles, indices et priorités, pas les évaluations serveur. DOCX reste une conversion partielle et PDF repose sur l’impression. Les limites détaillées des [formats](formats.md) restent valables.
- Aucun paiement réel n’a été exécuté. Les liens Stripe et les limites de raccordement automatique antérieures sont inchangés. La réception d’emails personnels et le consentement Google personnel ne sont pas attestés par ces fixtures.
