# Architecture

## API, comptes et isolation

La SPA React communique avec `/api/*`, une fonction Netlify/Hono. Chaque route privée fait revalider la session par Neon Managed Better Auth puis filtre par propriétaire. Les écritures exigent l’origine exacte configurée. Cookies HttpOnly, SameSite=Lax et Secure en production ; aucun jeton de session dans localStorage. Le proxy utilise le toolkit serveur officiel `@neondatabase/auth` 0.6.0-beta, fixé au lockfile ; le backend d’authentification est géré par Neon.

Le schéma PostgreSQL `lab` est isolé des autres produits. Des clés étrangères composées imposent le même propriétaire aux dossiers parents, documents, versions et futures cartes. Drizzle versionne les migrations. Les mots de passe, sessions, confirmation et réinitialisation sont gérés par Better Auth, sans cryptographie artisanale.

L’inventaire de la mission 2 a confirmé les intégrations Neon existantes, initialement inaccessibles à la mission 1. Les mots de passe et sessions gérés résident dans `neon_auth`. Better Auth auto-hébergé reste disponible pour le mode local et un repli de déploiement contrôlé ; la configuration gérée utilise `NEON_AUTH_BASE_URL`. Les enregistrements historiques `lab.user` et leurs clés documentaires ne sont pas supprimés.

`auth_identities` relie le sujet Neon vérifié au propriétaire historique des documents. Un email ne peut rattacher un compte existant que si les deux identités sont vérifiées côté serveur. Les collisions et anciens comptes non vérifiés restent bloqués avec leurs données préservées. Aucun mot de passe en clair n’est récupéré et aucun jeton OAuth historique n’est copié. Les anciens mots de passe auto-hébergés ne sont pas automatiquement ceux du service Neon ; l’inventaire de production détermine si des comptes nécessitent un traitement avant bascule.

La confirmation email est obligatoire. Neon fournit des codes avec son email partagé, et Google utilise son intégration partagée pour les essais. La révocation des sessions est vérifiée auprès du service, sans autoriser des écritures à partir du cache local de session. Les rôles `free`, `pro`, `premium`, `owner` restent propres à l’application ; un rôle administrateur d’organisation Neon ne confère aucun privilège documentaire. Le rôle initial est `free`. `OWNER_NEON_SUBJECT`, attribué administrativement à un sujet vérifié, réserve l’accès Premium permanent au propriétaire ; aucune comparaison d’email fourni par le navigateur ne confère ce rôle.

## Sauvegardes

1. Chaque modification est copiée dans IndexedDB et dans une copie d’urgence synchrone localStorage, séparée par utilisateur/document/onglet.
2. Après 900 ms de pause, le client envoie contenu et révision de base.
3. Une transaction verrouille le document, vérifie la révision et écrit contenu et version ensemble.
4. Une révision obsolète produit HTTP 409. Le client conserve sa copie et propose un nouveau document, la version distante ou un remplacement explicite.
5. Les erreurs réseau déclenchent des tentatives espacées et au retour réseau. Les copies non synchronisées sont proposées à la réouverture.

Pas de collaboration temps réel ni de fusion automatique. Les positions de lecture ne génèrent pas de versions. L’interface montre les 100 dernières versions ; aucun nettoyage automatique des versions n’est activé. Une politique de rétention compatible avec les limites Neon devra être définie pour une exploitation commerciale prolongée.

Les copies navigateur ne sont pas chiffrées contre quelqu’un ayant accès au profil de cet appareil. Leur effacement, le mode privé ou une panne de stockage peuvent les supprimer ; les erreurs sont signalées avec export possible. Elles ne remplacent pas une sauvegarde serveur.

## Fichiers et quotas

Images PNG/JPEG/WebP dans Netlify Blobs, servies par une route authentifiée. PostgreSQL ne stocke que les métadonnées. Images distantes arbitraires et SVG refusés. Vérification du type et de la taille serveur.

Les limites sont centralisées dans `src/shared/plans.ts`, appliquées via `server/billing/rights.ts` dans les transactions de création : gratuit 100 documents/25 Mo d’images, plafonds payants provisoires dans [billing.md](billing.md). Maximum 2 Mo de JSON par document et 4 Mo par image. Les réservations sont sérialisées par propriétaire. Les images retirées restent disponibles aux versions historiques et continuent de compter dans le quota ; pas de purge automatique. Une baisse de droits ne supprime pas les données existantes.

## Suite

Mission 2 : `memoryAnchor`, `memory_anchors`, `fsrs_cards`, `review_history`, `study_sessions` et `study_items` portent l’apprentissage actif. Voir [learning.md](learning.md) pour FSRS, les conflits et la reprise. La migration personnalisée `0004` rend la référence entre historique et élément de séance différable : une suppression de compte termine ses cascades avant de vérifier cette référence.

Mission 3 : `subscriptions`, `billing_events` et `billing_admin_audit` portent la facturation. Le SDK Stripe vérifie les signatures ; les événements et la projection des droits sont transactionnels. L’état courant est relu par API pour éviter les inversions lors d’événements tardifs. Les intentions Checkout sont persistées avant l’appel externe. Un événement ne retire pas le droit propriétaire et ne déclenche pas son paiement. Voir [billing.md](billing.md), notamment le blocage volontaire des ventes non raccordées ou non validées juridiquement.
