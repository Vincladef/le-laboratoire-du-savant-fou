# Textes à trous et révision simple

Le parcours courant est **Réviser**. Il n’y a plus de séances, d’itérations, de calendrier, d’échéances ni de planification. Les rapports des missions précédentes décrivent des versions historiques et ne constituent pas la spécification actuelle.

## Deux propriétés indépendantes

- Priorité : Haute, Moyenne (par défaut), Basse.
- Difficulté : Facile, Moyenne, Difficile, Non évaluée (par défaut).

La priorité et l’indice restent dans les marques du document et son index transactionnel. La difficulté et sa révision sont dans `memory_anchors`, séparées du JSON documentaire. Une sauvegarde, un changement de style/indice/priorité ou une restauration ne réécrivent pas cette évaluation.

La difficulté est facultative : révéler, lire ou masquer une réponse ne transmet aucune évaluation. L’utilisateur peut la modifier après révélation, ou dans les outils des passages de l’éditeur, y compris revenir à Non évaluée. Seule la dernière valeur est conservée ; aucune statistique ou nouvelle ligne d’historique n’est créée.

## Lecture et filtres

L’action Réviser de l’éditeur ouvre directement son document. La navigation globale Réviser ouvre un document disponible, en privilégiant ceux contenant des trous ; le sélecteur permet de changer de document et de réduire la liste par dossier et descendants.

Les filtres sont multisélections : chaque catégorie propose des cases à cocher, initialement toutes cochées (y compris Non évaluée). Une priorité quelconque cochée ET une difficulté quelconque cochée rendent le passage éligible. Aucune case cochée dans une catégorie signifie aucun trou masqué. Seuls les passages actifs correspondant aux deux catégories sont masqués. Tout le reste reste du texte normal et fournit le contexte. Les indices apparaissent près du passage concerné, sans panneau latéral.

Un clic ou le clavier révèle individuellement une réponse ; les boutons globaux Tout révéler et Masquer sont retirés. Espace révèle le prochain passage lorsque le focus n’est pas dans un contrôle. Échap ferme un indice ou un menu d’évaluation. Un changement de filtre ou un rechargement remasque les réponses ; aucune séance n’est enregistrée. Les difficultés demeurent stockées dans Neon.

## Fiabilité et isolation

`GET /documents/:id/review` lit le document et les annotations sous verrou partagé du document. Les accès vérifient son propriétaire et excluent la corbeille.

`PATCH /anchors/:id/difficulty` exige la valeur attendue de `difficultyRevision`. Verrou profil puis document, validation stricte et transaction côté serveur. Un ancien état concurrent retourne 409 ; un renvoi immédiat de la même requête après perte de réponse est idempotent. Les données du client ne choisissent jamais le propriétaire. Une erreur réseau est affichée, avec renvoi explicite ; la difficulté n’est pas présentée comme enregistrée avant confirmation serveur. Aucun stockage de séance ou de note en attente n’est ajouté.

La lecture de révision est rafraîchie au retour dans la fenêtre. L’éditeur conserve ses mécanismes existants de brouillons locaux, conflits et historique. Ces protections ne constituent pas une édition collaborative temps réel.

## Identité et modifications

Le texte original, ses styles, images, équations et sa structure ne sont jamais remplacés par des cartes. Le masquage utilise des décorations ProseMirror sur une vue non modifiable, pas une réécriture du document.

Une modification de réponse ou une fragmentation reste visible jusqu’à validation. La validation ne remet pas la difficulté à zéro. Supprimer une annotation laisse le texte ; la restaurer retrouve la même identité et sa difficulté actuelle. Un copier-coller dupliqué ou une copie de document renouvelle les UUID avec `sourceId` et commence Non évaluée. Un déplacement conservant l’identité conserve sa difficulté.

Le JSON exporté porte texte, styles, indices, priorités et éventuel choix initial de difficulté, mais pas les évaluations serveur ultérieures. Importer ce JSON crée de nouvelles identités avec ce choix initial, sinon Non évaluées. DOCX/PDF transportent le contenu lisible selon les limites documentées, pas les évaluations.

## Migration sans perte — 0012

Ajout de `difficulty` (valeur initiale unrated) et `difficulty_revision`, avec contraintes PostgreSQL. Pour chaque passage ayant un historique, reprise de la dernière réponse explicite, ordonnée par la véritable colonne historique `created_at`, puis identifiant en cas d’égalité :

| Ancienne réponse | Difficulté reprise |
| --- | --- |
| Oublié / Difficile (1 / 2) | Difficile |
| Moyen (3) | Moyenne |
| Facile (4) | Facile |
| Aucune réponse | Non évaluée |

La difficulté numérique calculée par FSRS n’est pas une évaluation utilisateur et n’est pas convertie arbitrairement. Documents, indices, priorités et mises en forme ne sont pas modifiés par la migration.

Les tables historiques `fsrs_cards`, `review_history`, `study_sessions`, `study_items` restent une archive inactive pour éviter une perte irréversible. Elles ne sont plus initialisées, alimentées, affichées ou utilisées pour filtrer. Les routes anciennes répondent 410 ; les liens historiques de révision libre redirigent vers Réviser, ceux de séance vers le choix de document. La dépendance `ts-fsrs` et le moteur serveur sont retirés. Une suppression de compte conserve les cascades de suppression de ses propres archives.

## Vérification

Les tests couvrent migration depuis le schéma précédent, conservation des archives et du contenu, filtres combinés, valeurs initiales, évaluation sans modification du document, concurrence et renvoi idempotent, changements d’indices/styles/priorité, suppressions/restaurations/copies, isolation et retrait des anciens endpoints. Les parcours navigateur vérifient les contrôles réellement affichés, le clavier, l’accessibilité, le mobile, les erreurs réseau et la reconnexion. Les résultats de publication sont consignés dans le bilan de simplification UX.
