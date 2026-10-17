# Simplification UX de Bouche-trou

## Périmètre

Mission demandée le 17 octobre 2026 : identité Bristol conservée, commandes plus compactes, document prioritaire et un seul parcours **Réviser**, sans FSRS, séances ou échéances. Les paiements et autres limites des missions précédentes ne sont pas modifiés par ce travail.

- Accès direct à la lecture depuis l’éditeur, sans choix de mode ni étape de lancement.
- Filtres exacts de priorité et de difficulté, combinables et initialement sur Toutes.
- Contexte intact : seuls les trous filtrés sont masqués ; les autres sont du texte normal.
- Indices au niveau du passage ; évaluation facultative après révélation et modification possible dans les outils de l’éditeur.
- Barre compacte, commandes de révélation visibles, navigation des onglets distincte du plan des titres.
- Espace de navigation absent lorsqu’il est fermé ; panneau des passages non ouvert automatiquement après création. Papier, encre, ruban et couleurs douces conservés.
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
