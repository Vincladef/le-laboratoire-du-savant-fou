# Contrat documentaire des passages mémorisés

La mission 2 exploite le point d’extension préparé dans la mission 1, une marque ProseMirror :

```json
{"type":"text","text":"Un passage","marks":[
  {"type":"bold"},
  {"type":"memoryAnchor","attrs":{"id":"UUID","sourceId":null,"hint":"Indice facultatif","priority":"medium"}}
]}
```

Le texte et ses styles restent dans l’arbre. Un passage traversant plusieurs styles porte la même identité sur plusieurs nœuds. `inclusive:false` évite d’étendre automatiquement la marque aux frappes adjacentes. Les transactions préservent les marques lors des modifications internes.

À la sauvegarde, le serveur conserve texte courant, fragment original formaté, origine, métadonnées et révision. Un passage supprimé devient `deleted` ; une modification de texte appelle une revue pédagogique (`needs_review`). Les positions numériques ne sont jamais utilisées comme identités persistantes.

Une copie collée reçoit de nouveaux UUID et conserve `sourceId`, indice et priorité pour distinguer filiation et identité. Les collisions avec un autre document sont refusées côté serveur. La difficulté est une propriété serveur indépendante de la mise en forme ; une nouvelle identité commence « Non évaluée ». Les anciennes cartes, révisions et séances restent des archives inactives, jamais utilisées pour masquer un passage ou proposer une échéance.

Un couper-coller complet dans le même éditeur conserve l’identité via un jeton de presse-papiers local, à condition que le passage ne subsiste pas ailleurs. Un glisser-déposer interne qui déplace, plutôt que copie, conserve aussi les marques. Entre documents, après réouverture, ou lorsqu’une partie du passage original subsiste, le collage crée une nouvelle identité avec filiation. Effacer la mise en forme ne supprime pas les identités de passages.

Une réponse différente de la réponse validée ou devenue fragmentée reste visible jusqu’à validation dans l’éditeur. Styles, indices, priorités et validation ne changent pas sa dernière difficulté. Une restauration retrouve les identités et leurs difficultés actuelles, sans réécrire les évaluations depuis une ancienne version du document. Voir [learning.md](learning.md) pour restauration et concurrence. L’éditeur reste le même.

## Onglets Bouche-trou

Les anciens documents restent des arbres `doc` de blocs, sans conversion forcée. Lorsqu’un onglet est ajouté, la racine contient exclusivement des nœuds `documentTab` : attributs `id` (UUID, ou `main` pour le premier onglet historique), `title` et `parentId`, puis leurs blocs d’origine. Pas de mélange blocs/onglets ni d’onglets imbriqués dans un paragraphe. Validation serveur : 100 onglets maximum, trois niveaux, parents existants, identités uniques et absence de cycle. Le document complet est soumis aux mêmes limites de taille, quotas et contrôles de révision.

L’éditeur ProseMirror ne charge que l’onglet actif. Chaque sauvegarde compose tous les onglets ; les autres contenus ne dépendent pas de blocs HTML cachés. Le changement d’onglet recrée la vue et sa pile d’annulation : Ctrl+Z ne peut pas importer le contenu d’un onglet précédent. L’annulation immédiate concerne donc l’onglet ouvert pendant cette session ; l’historique persistant couvre le document entier.

La duplication conserve le texte, les styles et les indices, mais renouvelle les identités des trous avec `sourceId` : chaque copie commence « Non évaluée ». Un couper-coller complet entre onglets de la même ouverture partage le jeton local et ne conserve les identités que si elles ont réellement disparu de tout le document. Supprimer un onglet supprime ses descendants et archive ses passages ; une restauration de version peut les rétablir, avec leur dernière difficulté conservée.

La migration additive `0010` ajoute `documents.view_state` pour l’onglet actif et les curseurs par onglet. Cette préférence de navigation est enregistrée indépendamment de la révision du contenu, avec contrôle du propriétaire et validation de l’existence de l’onglet. Les révisions, le JSON, le texte brut, le DOCX et l’impression via la commande PDF portent sur tous les onglets. Word aplatit leurs sections avec un titre ; un import Word ne reconstitue pas automatiquement cette arborescence.
