# Confort d’écriture et parcours simplifiés — 6 novembre 2026

## Comportements

- Nouveaux paragraphes : 11 pt, interligne 1,15, aucun espacement avant/après. Les attributs explicites des documents existants restent prioritaires. Même valeur de repli pour DOCX ; révision et partage utilisent les mêmes extensions de document.
- Zoom : 100 % initialement sur ordinateur, adaptation à l’écran sur téléphone. Préférences persistantes séparées par catégorie d’écran. L’assistant flotte au-dessus de la page sans modifier sa largeur ni la position de lecture.
- Trous : fond jaune visible, soulignement ocre pointillé, survol et sélection distincts ; propositions IA conservées en vert discontinu. Création manuelle immédiate, réglages contextuels inchangés. Barre de sélection près du texte sur ordinateur et en bas sur mobile.
- Assistant IA : titre explicite ; rédaction libre à partir de la consigne, continuation dans une option repliée. Après application, fermeture du panneau, confirmation temporaire et focus rendu à l’éditeur. Prévisualisation, modification, rejet et protection contre une proposition devenue obsolète conservés.
- Révision : filtres secondaires regroupés sous « Filtres », compteur de réponses révélées et trois évaluations directes pour la réponse qui vient d’être révélée. L’évaluation reste facultative et modifiable ; après sauvegarde, focus sur le prochain trou. Les vues publiques ne proposent aucune écriture d’évaluation.
- Partage : « Toujours à jour » par défaut pour les nouveaux liens, version figée sous « Options du lien », action « Voir comme un visiteur ». Les liens existants gardent leur mode.
- Documents sans titre : première ligne non vide proposée comme titre tant que l’utilisateur ne le renomme pas ; nom informatif de repli dans la bibliothèque. Une restauration conserve son titre explicite. Navigation latérale ouverte par défaut sur ordinateur, préférence manuelle conservée.

## Vérification locale

Commit applicatif `66f8fd8d9db373a221a794d380a2a9b0a743379c`.

TypeScript, compilation Vite et empaquetage des fonctions réussis. Après le correctif des citations générées, 108 tests unitaires/intégration passent dans une exécution complète, puis les 27 tests API et fournisseur concernés passent après ajout du dernier scénario (109 tests distincts au total). Les 22 scénarios navigateur ont passé ; après le dernier ajustement de l’évaluation et de la restauration du titre, les 7 scénarios IA, partage, confort et révision ont été rejoués avec succès.

Les tests couvrent ordinateur et viewport mobile 390 × 844, sélection IA (y compris panneau déjà ouvert), création successive de trous, absence de changement de largeur/défilement à l’ouverture IA, retour à l’écriture, partage vivant par défaut, lien visiteur, évaluation successive et filtres combinés. Les parcours existants couvrent sauvegardes, versions, onglets, export et permissions. Cette vérification navigateur ne remplace pas un essai matériel des claviers iOS et Android.

Aucune migration de schéma ni réécriture des documents existants dans cette livraison.

## Préproduction et publication

La préproduction `6aedf2327fcae46d335f2092` et la publication production `6aedf30246278b8ef0bae894` sont **ready**. Recette de production exécutée avant publication : 15 contrôles Neon Auth et 13 parcours Chromium hébergés, sur ordinateur et mobile 390 × 844, sans erreur JavaScript. Elle inclut des appels réels à Luna, la persistance des trous générés, la lecture publique anonyme, la révision, la copie après connexion et la révocation du lien.

Aucune migration appliquée. Les inventaires et empreintes documentaires sont identiques avant/après nettoyage des fixtures : 6 documents, 115 versions et 46 annotations ; empreinte agrégée `00188b4e84a556b0c21f1d232b2a7d5e`.

## Citations des textes générés

Le correctif `72a4af1d6ee98e13b5b632e55d4c44fdeb9bd637` impose `generated` comme source dans le schéma structuré de composition. La même normalisation exacte est utilisée par l’API et la recette fournisseur : une source ou une occurrence incorrecte est récupérée uniquement quand la citation est présente une seule fois dans le texte cible. Pour la composition, aucune recherche n’est effectuée dans les sources de contexte. Les citations absentes, ambiguës ou qui se chevauchent restent refusées. Les tests couvrent également le refus d’une réponse présente seulement dans le contexte et l’absence de modification documentaire avant application.

## Recette finale en production

Déploiement `6aedf5ac744052b6941f85ff`, commit applicatif `72a4af1d6ee98e13b5b632e55d4c44fdeb9bd637` : **ready**. Les vérifications hébergées portent désormais sur la nouvelle interface. Les 15 contrôles Neon Auth et les 13 parcours Chromium passent, sans erreur JavaScript ; la recette fournisseur valide les quatre modes avec Luna. Inventaire et empreinte documentaire identiques à ceux indiqués ci-dessus, aucune migration.

Le test navigateur du partage a également été renforcé et rejoué après ce correctif : ouverture directe d’une copie privée modifiable après une nouvelle inscription et validation email, en plus du parcours après connexion déjà couvert.

Les variables temporaires de recette sont retirées après validation ; les builds ordinaires ne déclenchent pas de générations payantes. La clé OpenAI reste uniquement en production.
