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

Une copie collée reçoit de nouveaux UUID et conserve `sourceId`, indice et priorité pour distinguer filiation et identité. Les collisions avec un autre document sont refusées côté serveur. Les cartes référencent `memory_anchors` du même propriétaire. `fsrs_cards` et `review_history` utilisent FSRS 6 ; `study_sessions` et `study_items` conservent la progression.

Un couper-coller complet dans le même éditeur conserve l’identité via un jeton de presse-papiers local, à condition que le passage ne subsiste pas ailleurs. Un glisser-déposer interne qui déplace, plutôt que copie, conserve aussi les marques. Entre documents, après réouverture, ou lorsqu’une partie du passage original subsiste, le collage crée une nouvelle identité avec filiation. Effacer la mise en forme ne supprime pas les identités de passages.

Une réponse différente de la réponse validée ou devenue fragmentée est suspendue jusqu’à validation. L’utilisateur peut conserver le calendrier ou le recommencer explicitement ; les historiques restent conservés. Les styles, indices et priorités n’effacent pas l’apprentissage. Voir [learning.md](learning.md) pour les règles de restauration, séances et concurrence. L’éditeur reste le même.
