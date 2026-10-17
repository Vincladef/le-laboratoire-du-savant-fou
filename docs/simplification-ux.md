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
