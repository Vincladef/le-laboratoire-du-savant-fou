# Assistant compact et révision personnelle — 6 novembre 2026

L’assistant conserve ses trois actions dans un menu déroulant. Les annotations utilisent la sélection éventuelle, sinon uniquement l’onglet actif. Les commandes de portée documentaire et le bloc « Onglet actuel » sont supprimés. La rédaction libre reste possible sans contexte ; la continuation reste une option repliée. Les explications redondantes sont retirées et les marges réduites ; une longue proposition conserve son défilement.

La révision retrouve les filtres directs Priorité/Difficulté. « Recommencer la révision » remasque les réponses sans écrire ni effacer les évaluations. Les boutons d’évaluation et les réglages des réponses révélées sont hors du contenu ProseMirror : aucune commande ne s’intercale entre les mots. Les raccourcis, indices, contrôles de concurrence et erreurs d’enregistrement sont préservés.

La page publique possède les mêmes filtres. Chaque visiteur commence avec une difficulté Non évaluée et une priorité Moyenne, indépendantes des données de l’auteur. Ses ajustements sont conservés dans localStorage, par lien et identité connectée (ou visiteur anonyme). Ils restent propres à ce navigateur ; ils ne sont pas synchronisés entre appareils. « Mes réglages » permet de remettre ces valeurs à zéro. Le contenu reste non modifiable et aucune écriture d’annotation n’est envoyée au serveur depuis cette page. La copie après connexion ou inscription reste disponible.

Aucune migration ni modification des permissions serveur. Les documents, archives et évaluations de l’auteur ne sont pas réécrits.

## Vérifications

TypeScript, compilation Vite et 109 tests unitaires/intégration réussis. Suite complète : 21 parcours navigateur réussis ; un contrôle d’accessibilité a identifié un libellé sans rôle sur le groupe d’évaluation. Après correction, les trois parcours concernés (accessibilité, confort et mobile) passent, ce qui valide les 22 scénarios distincts. Les sept parcours ciblés IA, partage et révision avaient également passé.

Les vérifications ajoutées couvrent le panneau initial sans défilement à 1440 × 650, le ciblage de la sélection quand le panneau est déjà ouvert, les annotations limitées à l’onglet actif, le redémarrage sans effacement des évaluations, les réglages du visiteur après rechargement, leurs filtres et leur remise à zéro, ainsi que l’absence de modification des évaluations de l’auteur. La copie après inscription et connexion est conservée. Les essais mobiles utilisent Chromium avec viewport simulé, pas des appareils iOS/Android physiques.

Première publication `6aedffc14bf3e7c4c8c79d10` prête : 15 contrôles Neon Auth et 11 parcours Chromium hébergés passent, sans erreur JavaScript. Aucune migration. Inventaire et empreinte identiques avant/après nettoyage des fixtures : 6 documents, 123 versions, 46 annotations ; empreinte `15bdb95fd82e1af8966b43c9ba18ccd3`.

Recette finale `6aee006a952aa92e20f72bcf`, commit applicatif `83972e883e302b4d9cdab1e3c39e938629f0934c` : **ready**. Sur la nouvelle interface publiée, 15 contrôles Neon Auth et 11 parcours navigateur passent, sans erreur JavaScript. Les inventaires et empreintes restent identiques aux valeurs ci-dessus. Le dernier ajustement réduit aussi la hauteur du panneau IA à son contenu. Les variables temporaires de recette sont retirées après validation ; la clé OpenAI de production est conservée. Aucun appel fournisseur supplémentaire n’a été nécessaire pour cette livraison frontend.
