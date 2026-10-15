# Validation de la mission 2

Recette du 15 octobre 2026. Les confirmations locales, development hébergé et production sont distinguées.

## Vérifications locales

Node 24.19.0, npm 11.9.0, Chromium système. Installation reproductible par `npm ci --cache /workspace/.npm-cache` : 817 paquets ; avertissements de pairs dans les dépendances UI transitives du SDK Neon, sans échec d’installation. Aucun contournement TLS ou de vérification d’intégrité.

| Commande exécutée | Résultat |
| --- | --- |
| `npm run typecheck` | Réussi |
| `npm test` | 45 tests réussis, 7 fichiers |
| `npm run test:e2e` | 6 parcours Chromium réussis |
| `npm run build` | Build de production réussi |
| `npm run build:functions` | ZIP officiel Netlify Functions v2 produit, environ 3,95 Mo |

Les tests utilisent de vraies instances PostgreSQL PGlite isolées. Ils couvrent identité et rôles, passages multistyles, indices/priorités, conservation du calendrier, notes FSRS 1–4 comparées au moteur, révélation obligatoire, double envoi, deux séances concurrentes, déconnexion/reconnexion, modifications et validations, suppression, restauration depuis une version stockée, filiation des copies, conflits et accès entre comptes. Une suppression de compte vérifie les cascades et l’absence d’historiques orphelins.

Un document de **420 passages indépendants** est créé puis restylé sans réinitialiser ses cartes. La séance est bornée à 200 éléments tandis que les 420 restent éligibles. Le calcul à travers le retour à l’heure d’hiver conserve dix minutes réelles et le même résultat FSRS pour deux représentations du même instant.

Les tests de l’éditeur utilisent Tiptap/ProseMirror réels dans jsdom : styles, paragraphes/listes/tableaux/code, équation en ligne, suppression d’annotation sans effacer la réponse, chevauchement refusé, copie réidentifiée et couper-coller conservant l’identité. Ces tests ne sont pas présentés comme des interactions physiques du presse-papiers sur tous les navigateurs.

Les parcours Chromium comprennent ceux de la mission 1 et un parcours de mémorisation complet : deux passages formatés, indices, filtres, mode libre sans mutation des cartes, raccourcis, séance programmée, révélation persistée après rechargement, réponse HTTP perdue après enregistrement puis renvoyée sans doublon, véritable interruption réseau et reprise automatique, vue mobile 390×844 sans débordement et données conservées après reconnexion. Un test d’interface simule uniquement la configuration Neon et les réponses d’envoi pour vérifier les écrans confirmation par code/récupération par lien.

## Development avec Neon et Netlify réels

Cible : branche Neon existante `br-twilight-term-bax765a0`, base `laboratoire`, URL https://mission-2--le-laboratoire-du-savant-fou.netlify.app.

Déploiement `6ad0fc5fd69a68af4414118e`, constaté `ready` et rapport Netlify `success` : **18 tables, 5 migrations connues, aucune migration rejouée, 14 contrôles distants et 5 parcours navigateur hébergés réussis**.

Les requêtes ont visé le service HTTPS déjà publié depuis le build Netlify, avec le vrai service Managed Better Auth et la vraie base Neon :

- accès anonyme refusé, connexion par mot de passe et cookies Secure/HttpOnly ;
- rattachement d’une identité à un propriétaire historique avec document inchangé ;
- révocation, reconnexion et document conservé ;
- annotations multistyles, indices et priorités ;
- calcul et persistance FSRS, retransmission dédupliquée et lecture SQL directe ;
- conflit documentaire et isolation entre deux comptes Neon ;
- récupération par lien, nouveau mot de passe et anciennes sessions effectivement refusées ;
- inscription publique acceptée et accès refusé avant vérification ;
- démarrage du flux Google partagé et redirection vers l’autorisation du fournisseur.

Chromium contre ce même site a vérifié connexion Neon, création d’un passage formaté, révision libre, FSRS avec reprise après rechargement, affichage mobile et persistance après une nouvelle connexion. **Aucune erreur JavaScript**. Une lecture SQL après le navigateur confirme les trois cartes et leurs trois révisions.

Les deux fixtures administratives de connexion et la fixture d’inscription publique sont supprimées précisément. Inventaires avant/après identiques : aucun utilisateur/document/passage/carte/révision/séance d’application ajouté durablement par la recette ; les 4 identités gérées development sont conservées. Ce nombre inclut le compte propriétaire réservé administrativement, en plus des identités préexistantes.

Deux essais development avaient mis en évidence une contrainte de suppression de compte. Une régression locale l’a reproduite, la migration `0004` l’a corrigée, puis les deux seules fixtures abandonnées ont été nettoyées par identifiants et fenêtre temporelle précis. Les essais ont repris avec des inventaires stables. Aucun compte ni document réel n’a été supprimé.

## Production

L’inventaire préalable en lecture seule a constaté 0 utilisateur auto-hébergé, 0 document, 0 version et 0 identité Auth dans la branche production ; aucun ancien mot de passe n’était donc à transférer. Neon Auth était activé mais son espace production était vide, indépendamment des identités development.

La bascule et sa recette publiée sont enregistrées dans le rapport de livraison final. Ne pas confondre le déploiement development ci-dessus avec une validation de production.

## Limites attestées

- L’inscription publique est réellement demandée au fournisseur partagé, et la vérification est exigée. Le code reçu dans une boîte personnelle n’a pas été saisi : le test refuse l’accès non vérifié et ne prétend pas attester la réception ou une confirmation personnelle.
- Le jeton de récupération de la seule fixture est lu administrativement dans le stockage géré pour tester sa consommation, le nouveau mot de passe et la révocation. Cela teste le service réel, pas la livraison du message dans une boîte personnelle.
- Le démarrage Google est testé ; aucun consentement Google personnel n’est simulé ni revendiqué comme testé.
- Les comptes vérifiés des autres parcours sont des fixtures administratives, pas un contournement public de vérification.
- Les limites DOCX, pagination et sauvegardes de la mission 1 restent applicables. Les règles d’annotation, de réponse modifiée, de séance et de synchronisation sont dans [learning.md](learning.md).
- `npm audit --omit=dev` conserve 7 alertes modérées, aucune haute ni critique lors de l’exécution ; mêmes avis de portée outillage/conversion que la mission 1. L’audit n’est pas présenté comme intégralement réussi.
- Aucune action Stripe n’est exposée à cette conversation malgré son installation visible dans Codex. Aucun produit, paiement ou abonnement Stripe n’a été créé ou modifié.
