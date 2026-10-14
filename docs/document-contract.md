# Contrat documentaire pour la mission 2

Pas d’interface de textes à trous dans la mission 1. Le point d’extension est une marque ProseMirror :

```json
{"type":"text","text":"Un passage","marks":[
  {"type":"bold"},
  {"type":"memoryAnchor","attrs":{"id":"UUID","sourceId":null}}
]}
```

Le texte et ses styles restent dans l’arbre. Un passage traversant plusieurs styles porte la même identité sur plusieurs nœuds. `inclusive:false` évite d’étendre automatiquement la marque aux frappes adjacentes. Les transactions préservent les marques lors des modifications internes.

À la sauvegarde, le serveur conserve texte courant, fragment original formaté, origine, métadonnées et révision. Un passage supprimé devient `deleted` ; une modification de texte appelle une revue pédagogique (`needs_review`). Les positions numériques ne sont jamais utilisées comme identités persistantes.

Une copie collée reçoit de nouveaux UUID et conserve `sourceId` pour distinguer filiation et identité. Les collisions avec un autre document sont refusées côté serveur. Les futures cartes référencent la table `memory_anchors` du même propriétaire. `fsrs_cards` et `review_history` sont réservées, sans scheduling actif.

Un couper-coller complet dans le même éditeur conserve l’identité via un jeton de presse-papiers local, à condition que le passage ne subsiste pas ailleurs. Un glisser-déposer interne qui déplace, plutôt que copie, conserve aussi les marques. Entre documents, après réouverture, ou lorsqu’une partie du passage original subsiste, le collage crée une nouvelle identité avec filiation. Effacer la mise en forme ne supprime pas les identités de passages.

La mission 2 devra définir les règles métier pour changement de réponse, découpage de passage et suppression partielle au-dessus de ce contrat. L’éditeur n’a pas besoin d’être remplacé.
