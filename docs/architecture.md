# Architecture

## API, comptes et isolation

La SPA React communique avec `/api/*`, une fonction Netlify/Hono. Chaque route privée vérifie une session Better Auth puis filtre par propriétaire. Les écritures exigent l’origine exacte configurée. Cookies HttpOnly, SameSite=Lax et Secure en production ; pas de jeton de session dans localStorage. La limitation de tentatives d’authentification est persistée en base.

Le schéma PostgreSQL `lab` est isolé des autres produits. Des clés étrangères composées imposent le même propriétaire aux dossiers parents, documents, versions et futures cartes. Drizzle versionne les migrations. Les mots de passe, sessions, confirmation et réinitialisation sont gérés par Better Auth, sans cryptographie artisanale.

Neon Auth est pertinent, mais aucun endpoint ni activation existante n’était disponible et les accès Neon manquent. Le choix effectif est Better Auth, libre, compatible PostgreSQL Neon et Netlify, qui permet de valider les mêmes parcours en local. Il ne prétend pas utiliser un service Neon Auth déjà configuré.

La confirmation email est obligatoire. La réinitialisation révoque les sessions. Google est invisible sans configuration serveur ; liaison automatique de fournisseurs désactivée. Les rôles `free`, `pro`, `premium`, `owner` sont serveur ; le rôle initial est toujours `free`. Aucun endpoint public ne permet de promotion. Une attribution propriétaire nécessite une opération administrative explicite sur l’identité interne vérifiée, pas une comparaison d’email navigateur.

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

Limites actuelles : 100 documents par compte, corbeille comprise ; 2 Mo de JSON par document ; 4 Mo par image ; 25 Mo de fichiers. Les réservations sont sérialisées par propriétaire. Tous les rôles utilisent ces limites tant que les offres ne sont pas implémentées. Les images retirées restent disponibles aux versions historiques et continuent de compter dans le quota ; pas de purge automatique.

## Suite

Mission 2 : contrat `memoryAnchor` et tables réservées, sans interface pédagogique active. FSRS disposera de la version de l’algorithme, des paramètres et de l’historique avant/après. Mission 3 : `subscriptions` et `billing_events` préparent les webhooks Stripe idempotents ; les droits devront provenir de webhooks vérifiés et jamais d’une redirection navigateur.
