# Textes à trous et FSRS

## Contrat de passage

Le texte reste dans l’arbre Tiptap/ProseMirror, avec ses styles, listes, cellules, équations et blocs. Une marque `memoryAnchor` porte un UUID, l’éventuel `sourceId`, un indice et une priorité. Les fragments multistyles d’un passage partagent cette identité. La sauvegarde du document, sa version, l’index des passages et la création de leurs cartes forment une seule transaction PostgreSQL.

La priorité (`high`, `medium`, `low`) est indépendante du calendrier. Ses modifications et celles d’un indice passent par la sauvegarde versionnée du document. Le fragment initial formaté reste dans `original_slice` ; la réponse validée sert de référence pédagogique dans les métadonnées.

- Les frappes adjacentes n’étendent pas automatiquement le passage (`inclusive:false`). Un changement de texte, même partiel, suspend sa carte jusqu’à validation. Un changement de style seul conserve le calendrier.
- Un déplacement complet dans le même éditeur conserve l’identité. Une copie reçoit un nouvel UUID avec filiation, indice et priorité ; elle démarre un apprentissage distinct.
- Une sélection chevauchant une annotation est refusée. Plusieurs fragments séparés par du texte non annoté rendent le passage inéligible ; l’utilisateur doit recréer une annotation cohérente.
- Retirer l’annotation conserve le texte. Supprimer son texte marque le passage `deleted` et l’exclut des séances, tout en gardant son historique.
- Restaurer une version retrouve les UUID historiques. Une réponse différente de la dernière réponse validée reste à vérifier. Retrouver une réponse déjà validée ne réinitialise pas son calendrier.
- La validation peut conserver le calendrier ou le recommencer explicitement. Les anciennes révisions restent conservées dans les deux cas.

Les indices sont limités à 1 000 caractères. Les éléments qui n’ont pas de texte sélectionnable, par exemple une image seule, ne deviennent pas des cartes textuelles.

Depuis la mission 3, un quota de passages actifs est contrôlé dans la transaction documentaire (voir [billing.md](billing.md)). Les passages supprimés restent archivés mais libèrent une place ; la corbeille compte tant que ses annotations existent. Un dépassement refuse la croissance et annule ensemble document/version/index/cartes, sans effacer le brouillon local. Un compte déjà au-dessus du plafond peut modifier son texte ou retirer des annotations ; aucune carte ni révision existante n’est supprimée à cause d’un changement d’offre.

Le JSON documentaire conserve les annotations, indices et priorités. Son import crée un nouveau document avec de nouvelles identités et filiation, donc un nouvel apprentissage. La restauration depuis l’historique du même document conserve ses identités. DOCX et PDF conservent le contenu lisible et les styles pris en charge, sans transporter les calendriers ou historiques FSRS ; les limites de conversion Word restent celles de la mission 1.

## Deux modes

Le mode libre masque les annotations actives correspondant aux priorités choisies, permet d’afficher les indices, de révéler une réponse ou toutes les réponses, et de recommencer. Il n’envoie aucune note et ne modifie pas les cartes FSRS.

Le mode programmé sélectionne uniquement des cartes actives et échues, hors documents à la corbeille. Les filtres peuvent couvrir plusieurs documents ou dossiers ; les sous-dossiers sont inclus. Une séance contient au plus 200 passages ; les autres cartes dues restent disponibles pour la séance suivante. Chaque passage est présenté une fois par séance ; une échéance d’apprentissage ultérieure revient dans une nouvelle séance lorsqu’elle est atteinte.

L’ordre, les révélations, les notes et les passages devenus inéligibles sont enregistrés côté serveur. Au retour, la séance saute les cartes supprimées, modifiées ou déjà révisées ailleurs. Un changement de priorité en cours de séance ne réinitialise rien ; une présentation devenue obsolète est sautée et peut être reprise dans une nouvelle séance si elle demeure éligible.

## Moteur et paramètres

Implémentation maintenue : [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), version **5.4.2**, licence MIT, algorithme **FSRS 6**. Version de bibliothèque fixée et paramètres complets enregistrés avec chaque carte ; pas de réimplémentation de la formule.

| Interface | Note FSRS |
| --- | --- |
| Oublié | `Again = 1` |
| Difficile | `Hard = 2` |
| Moyen | `Good = 3` |
| Facile | `Easy = 4` |

Rétention demandée : 0,9 ; intervalle maximal : 36 500 jours ; apprentissage court actif, étapes `1m` puis `10m` ; réapprentissage `10m` ; variation aléatoire désactivée pour rendre les calculs reproductibles. Les poids officiels fournis par cette version sont enregistrés via `generatorParameters`. Aucun ajustement de l’intervalle selon la priorité.

Stabilité, difficulté, état, échéance, dernière révision, compteurs et étape d’apprentissage sont persistés. Une carte provenant d’un ancien emplacement réservé n’est initialisée que si elle n’a encore aucune révision ; aucun apprentissage existant n’est réinitialisé automatiquement.

## Cohérence et reprise

Les instants sont des `timestamptz`, évalués à l’heure du serveur et transportés en ISO UTC. Le navigateur affiche les dates dans son fuseau ; un changement de fuseau ne change pas les échéances. Les intervalles sont calculés par FSRS à partir d’instants, sans addition manuelle de jours calendaires à minuit local.

Une note conservée hors connexion est appliquée à son instant de synchronisation. La séance attend sa confirmation avant de passer au passage suivant ; elle ne simule pas un calendrier FSRS hors ligne à partir de l’horloge du navigateur. L’envoi est repris au retour réseau, au rechargement ou via le bouton de retransmission.

Une note exige une réponse révélée et les révisions courantes de la carte et du passage. Les sauvegardes documentaires et les notes sérialisent leurs changements par propriétaire, puis vérifient le document. L’état FSRS, l’historique et l’avancement sont modifiés dans une transaction.

Un UUID d’action est conservé dans le navigateur avant l’envoi d’une note. La retransmission avec le même UUID rend le résultat déjà enregistré ; une seconde note pour le même élément est refusée. Une réponse reçue par le serveur dont la réponse HTTP est perdue peut donc être renvoyée après rechargement sans double révision. Le navigateur doit pouvoir conserver quelques octets de stockage local pour garantir cette reprise ; une impossibilité d’écriture empêche l’envoi et produit une erreur explicite.

Raccourcis : Ctrl/Cmd + Maj + M dans l’éditeur ; espace pour révéler ; 1–4 pour noter après révélation ; R pour recommencer en mode libre. Les champs de saisie et boutons gardent leur fonctionnement clavier normal.

L’isolation repose sur les sessions vérifiées côté serveur et des contraintes composites de propriétaire ; aucun `ownerId` fourni par le navigateur ne décide des droits. Les passages, cartes, séances et historiques d’un autre compte renvoient une absence d’accès.
