# Formats et fidélité

La source canonique est le JSON Tiptap, avec `schema_version`. L’HTML n’est pas persisté comme source.

## Import DOCX

Mammoth extrait une structure sémantique, assainie par DOMPurify puis convertie en Tiptap. Les images compatibles sont chargées dans l’espace privé ; un échec de chargement fait échouer l’import avec un message. Les avertissements Mammoth sont présentés. Un nouveau document est créé.

Conservés dans les cas simples : texte, paragraphes, titres, gras/italique/souligné/barré, listes, liens, tableaux et images compatibles. Fidélité non garantie : polices/corps/couleurs exacts, retraits/interlignes Word, sections/marges, styles complexes, fusions de tableaux, champs, références, commentaires, suivi de modifications, objets flottants, SmartArt, en-têtes/pieds de page et équations OMML. **Conserver le fichier original.**

## Export DOCX

`docx` génère un véritable Office Open XML avec styles usuels, titres, alignement, interlignes, retraits, numérotation, tableaux, images embarquées, liens, format, marges, orientation et sauts de page. Les tâches deviennent des symboles cochés/non cochés, pas des formulaires Word.

Les équations sont exportées comme **source LaTeX lisible, pas comme équations natives Word**. Les identités des passages ne sont pas conservées dans DOCX ; utiliser JSON pour ces métadonnées. Les polices système et la pagination peuvent différer sur l’appareil de destination.

## PDF et pages

Le bouton ouvre l’impression du navigateur : choisir « Enregistrer au format PDF ». CSS `@page` règle format/marges/orientation, retire l’interface et applique les sauts explicites. Les tableaux/images trop grands peuvent être découpés. Désactiver les en-têtes/pieds de page du navigateur si nécessaire.

Il ne s’agit ni d’un service PDF distant ni d’un téléchargement silencieux. À l’écran, le papier respecte la largeur et les marges mais s’allonge en flux continu. Il n’y a **pas de pagination automatique ligne par ligne identique à Word/Google Docs**.

## JSON et texte

JSON conserve contenu, styles, pages et métadonnées, mais référence les images privées **sans embarquer les fichiers**. Ce n’est pas une archive autonome. L’import refuse les images d’un autre compte et renouvelle les identités des passages. Le texte brut omet mise en forme, images et identités.
