# Ergonomie : lecture, filtres et édition

## Périmètre

- Connexion : les deux panneaux deviennent transparents sur le fond commun. Le fichier `src/assets/desk-paper.png` reste strictement inchangé (SHA-256 `7d8879a6cd386c5c44f3c728184eb30541828576714bc7a7efec9ccb80823af2`). Aucune texture approchante ni nouvelle illustration.
- Révision : cases à cocher multisélections dans les menus Priorité et Difficulté, initialement toutes sélectionnées, y compris Non évaluée. Union à l’intérieur d’une catégorie, intersection entre catégories. Aucune sélection dans une catégorie = aucun trou masqué. Les passages exclus restent lisibles dans leur contexte.
- Seule la révélation individuelle demeure, au clic ou au clavier. Les boutons globaux Masquer / Tout révéler sont supprimés. Les indices et l’évaluation facultative ne changent pas.
- Plan : ouvert par défaut au-dessus de 760 px, fermé sur téléphone. Préférences manuelles séparées et persistantes pour chaque catégorie d’écran ; les anciennes valeurs enregistrées automatiquement sont remplacées par ces nouveaux défauts.
- Éditeur : aucun en-tête général (marque, espace privé, avatar). Navigation latérale conservée ; le bouton du menu mobile rejoint l’en-tête du document. Réglages et compte restent accessibles par cette navigation.
- Édition : outils directement visibles, sans état d’ouverture ni bouton Outils. Commandes de base et de mémorisation sur la première bande ; mise en forme et insertions sur la seconde, défilable horizontalement sur petit écran. Aucun outil de document n’est supprimé.
- Téléphone : conteneur de commandes sticky jusqu’en fin de document ; suppression de l’overflow du parent qui empêchait ce comportement. Hauteur mesurée, prise en compte du visual viewport et marges de défilement de ProseMirror pour garder la saisie sous les commandes. Les mises à jour de géométrie inchangées sont ignorées.

## Données et limites de vérification

Pas de migration ni de changement d’authentification, d’offres ou de données documentaires. Les filtres et révélations restent locaux ; les évaluations continuent d’être sauvegardées dans Neon avec leur contrôle de concurrence.

Les tests couvrent un document de 100 paragraphes, défilement intermédiaire et final, saisie et formatage dans une fenêtre 390 × 420 simulant une hauteur disponible réduite, position du caret, navigation et réglages. Cela ne constitue pas un essai matériel des claviers iOS/Android : leur comportement exact dépend du navigateur et reste à contrôler sur appareil réel.

La recette hébergée ajoute un parcours dédié à la barre mobile, avec document synthétique et vérification d’enregistrement réelle. Les fixtures sont retirées et les empreintes des données existantes sont comparées avant/après, sans effacer de contenu utilisateur.

## Vérification locale

TypeScript, compilation Vite et 96 tests unitaires/intégration réussis. Les 15 parcours navigateur sont validés : 13 dans la dernière exécution complète puis les 2 restants rejoués avec succès après correction d’une lecture concurrente de mail de développement et adaptation du test au bouton Masquer supprimé. Le scénario de défilement mobile a aussi réussi isolément. Les contrôles de contraste et de navigation clavier sont conservés, sans assertions désactivées.
