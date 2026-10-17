# Renommage du site : bouche-trou.netlify.app

Le site Netlify conserve l’ID `449cbaf7-eaaa-43ce-8b27-50460f3d036c`, le dépôt GitHub et les branches Neon existantes. Il ne s’agit pas d’un déplacement de données.

- Production : `https://bouche-trou.netlify.app`.
- Développement : `https://mission-2--bouche-trou.netlify.app`.
- `AUTH_BASE_URL` doit correspondre à chaque origine, dans son contexte Netlify propre. Les autres variables et secrets restent inchangés.
- Les nouvelles origines doivent figurer dans les domaines autorisés de Neon Auth ; les anciennes adresses Netlify sont retirées pour ne pas laisser un domaine abandonné approuvé. Les autres domaines légitimes sont préservés.
- Les endpoints Neon Auth et le callback Google hébergé chez Neon ne changent pas. Le retour vers l’application utilise la nouvelle origine et `/api/auth/complete`. Les liens de récupération sont aussi vérifiés sur cette origine.
- Le script de provisionnement Stripe utilise désormais les nouvelles adresses pour ses futures configurations. Aucun provisionnement Stripe ni paiement n’est lancé par ce changement ; les liens d’abonnement publics sont conservés.

## Conséquences pour le navigateur

Les cookies et le stockage local appartiennent à une origine. Une reconnexion est donc nécessaire sur la nouvelle adresse ; les comptes, documents et évaluations synchronisés dans Neon sont conservés. Les brouillons non synchronisés et préférences locales de l’ancien domaine ne se transfèrent pas automatiquement. Ne pas effacer les données de cet ancien domaine si un brouillon doit être récupéré.

Les anciens rapports de recette gardent leurs URLs historiques : ils décrivent les déploiements à la date des tests, et ne constituent pas la configuration courante.

## Accueil

Sous-titre sous la marque, « L’atelier de vos connaissances », texte « Un espace à vous… » et phrase « Vos documents vous attendent. Reprenons le fil. » retirés. Les indications utiles aux parcours d’inscription, confirmation et récupération restent visibles. Les tests vérifient ces suppressions, les formulaires, l’accessibilité et les affichages ordinateur/téléphone.
