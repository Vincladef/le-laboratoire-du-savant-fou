# Ergonomie : lecture, filtres et édition

## Périmètre

- Connexion : papier froissé conservé à gauche ; à droite, fond uni blanc cassé d’origine (`#fcfaf4`) rétabli à la demande suivante. Le fichier `src/assets/desk-paper.png` reste strictement inchangé (SHA-256 `7d8879a6cd386c5c44f3c728184eb30541828576714bc7a7efec9ccb80823af2`). Aucune texture approchante ni nouvelle illustration.
- Révision : cases à cocher multisélections dans les menus Priorité et Difficulté, initialement toutes sélectionnées, y compris Non évaluée. Union à l’intérieur d’une catégorie, intersection entre catégories. Aucune sélection dans une catégorie = aucun trou masqué. Les passages exclus restent lisibles dans leur contexte.
- Seule la révélation individuelle demeure, au clic ou au clavier. Les boutons globaux Masquer / Tout révéler sont supprimés. Les indices et l’évaluation facultative ne changent pas.
- Plan : ouvert par défaut au-dessus de 760 px, fermé sur téléphone. Préférences manuelles séparées et persistantes pour chaque catégorie d’écran ; les anciennes valeurs enregistrées automatiquement sont remplacées par ces nouveaux défauts.
- Éditeur : aucun en-tête général (marque, espace privé, avatar). Navigation latérale conservée ; le bouton du menu mobile rejoint l’en-tête du document. Réglages et compte restent accessibles par cette navigation.
- Édition : outils directement visibles, sans état d’ouverture ni bouton Outils. Commandes de base et de mémorisation sur la première bande ; mise en forme et insertions sur la seconde, défilable horizontalement sur petit écran. Aucun outil de document n’est supprimé.
- Ordinateur et téléphone : conteneur de commandes sticky jusqu’en fin de document ; suppression de l’overflow du parent qui empêchait ce comportement. Hauteur mesurée sur les deux formats, prise en compte du visual viewport mobile et marges de défilement de ProseMirror pour garder la saisie sous les commandes. Sur ordinateur, le plan reste sous la barre et sa hauteur disponible est ajustée. Les mises à jour de géométrie inchangées sont ignorées. L’apparence des commandes n’est pas modifiée.

## Données et limites de vérification

Pas de migration ni de changement d’authentification, d’offres ou de données documentaires. Les filtres et révélations restent locaux ; les évaluations continuent d’être sauvegardées dans Neon avec leur contrôle de concurrence.

Les tests couvrent un document de 100 paragraphes, défilement intermédiaire et final, saisie et formatage sur ordinateur 1440 × 1000 puis 1440 × 550, et sur mobile 390 × 844 puis 390 × 420 simulant une hauteur disponible réduite, position du caret, navigation et réglages. Cela ne constitue pas un essai matériel des claviers iOS/Android : leur comportement exact dépend du navigateur et reste à contrôler sur appareil réel.

La recette hébergée ajoute un parcours dédié à la barre mobile, avec document synthétique et vérification d’enregistrement réelle. Les fixtures sont retirées et les empreintes des données existantes sont comparées avant/après, sans effacer de contenu utilisateur.

## Vérification locale

TypeScript, compilation Vite et 96 tests unitaires/intégration réussis. Les 15 parcours navigateur sont validés : 13 dans la dernière exécution complète puis les 2 restants rejoués avec succès après correction d’une lecture concurrente de mail de développement et adaptation du test au bouton Masquer supprimé. Le scénario de défilement mobile a aussi réussi isolément. Les contrôles de contraste et de navigation clavier sont conservés, sans assertions désactivées.

## Développement hébergé

Commit `079ff274719c4dd608f19ab83d680a3bc69713ae`, déploiement de recette `6ad3865f2082312a2004f65e` **ready** : 17 contrôles HTTPS/Neon et 10 parcours Chromium hébergés réussis, aucune erreur JavaScript. Le nouveau parcours vérifie la barre sticky, la saisie en petite hauteur et l’accès aux réglages depuis l’éditeur mobile. Les filtres multiples sont vérifiés sur l’URL réelle. Inventaire et empreintes avant/après inchangés, aucune migration appliquée.

La validation production doit être contrôlée séparément après publication sur `main`.

## Extension de la barre persistante à l’ordinateur

La barre reste désormais sticky à toutes les largeurs. Le plan et le panneau des passages se placent sous sa hauteur réelle ; les marges de défilement protègent la saisie. Son empilement reste inférieur aux menus de l’en-tête pour ne pas bloquer l’export ou l’historique.

Vérification locale : 96 tests unitaires/intégration, TypeScript et compilation réussis. Les 16 scénarios navigateur ont été validés entre l’exécution complète et les reprises ciblées après correction de l’empilement des menus et d’une attente du test de redimensionnement. Les nouveaux parcours vérifient la barre au milieu et en fin de document, la saisie visible et le formatage sur ordinateur et téléphone. La recette hébergée contrôle également la barre et la persistance de la saisie sur ordinateur.
