# Moteur et licences

## Décision

React + Vite, Tiptap 3 / ProseMirror, extensions publiques MIT, API Node sur Netlify, PostgreSQL sur Neon et fichiers sur Netlify Blobs.

| Moteur | Atouts | Contraintes | Décision |
| --- | --- | --- | --- |
| Tiptap / ProseMirror | Arbre JSON extensible, marques persistantes, transactions et écosystème | Le cœur et les extensions publiques utilisées sont MIT. Les offres Pages/conversion/cloud avancées ne sont pas présumées gratuites. | Retenu sans extension commerciale. |
| ONLYOFFICE Document Server Community | Suite bureautique et forte compatibilité Office | Licence AGPL-3.0 vérifiée dans le dépôt ; nécessite un serveur documentaire distinct, pas une fonction Netlify. | Non retenu sur l’infrastructure demandée. |
| ONLYOFFICE commercial | Intégration et options commerciales | Licence/offre à examiner séparément ; aucun achat ni tarif supposé. | Évolution possible si la fidélité Office devient prioritaire. |

Le prix actuel des offres avancées Tiptap n’a pas pu être confirmé : l’accès à sa documentation a renvoyé HTTP 403. Aucun tarif chiffré inventé et aucune dépendance à une offre payante n’ont été introduits. La pagination automatique exacte à l’écran n’est pas livrée.

Tiptap fournit le moteur, les sélections, transactions et historique. Les extensions propres ajoutent uniquement recherche, attributs de paragraphe, sauts explicites et identités de passages.

## Licences des composants utilisés

Tiptap/ProseMirror, React, Vite, Better Auth, Drizzle, Hono, KaTeX, `docx` et le client Netlify Blobs : MIT. Mammoth : BSD-2-Clause. DOMPurify : Apache-2.0 ou MPL-2.0. PGlite : Apache-2.0 avec les notices PostgreSQL embarquées. Les versions exactes sont verrouillées dans `package-lock.json` ; les notices amont accompagnent les paquets.

Les services hébergés Neon/Netlify ont leurs propres quotas gratuits, distincts des licences des bibliothèques. Aucun abonnement n’a été modifié.

Sources inspectées : manifestes et fichiers LICENSE installés ; [licence Tiptap](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md), [licence ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer/blob/master/LICENSE). Références pour un choix commercial ultérieur : [Tiptap Pages](https://tiptap.dev/docs/pages/getting-started/overview), [offres Tiptap](https://tiptap.dev/pricing), [ONLYOFFICE Docs](https://www.onlyoffice.com/docs-enterprise.aspx).
