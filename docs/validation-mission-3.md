# Validation de la mission 3

Recette du 15 octobre 2026. Le code livré, les tests avec transport Stripe substitué et une véritable recette Stripe ne sont pas confondus.

## Vérifications locales exécutées

| Vérification | Résultat |
| --- | --- |
| TypeScript | Réussi |
| Tests PostgreSQL/éditeur/API | **72 tests réussis, 8 fichiers**, dont 27 cas de facturation |
| Chromium | **7 parcours réussis** : les 6 régressions des missions précédentes et le parcours commercial fermé |
| Build frontend | Réussi |
| Netlify Functions v2 | ZIP officiel produit, environ 4,43 Mo |
| Provisionnement Stripe, sans clé | Refus explicite `STRIPE_CONFIGURATION_BLOCKED`, code 2 ; aucune configuration ni transaction Stripe exécutée |

Les tests de facturation utilisent de vraies transactions PostgreSQL PGlite isolées, les vrais endpoints Hono et le SDK Stripe officiel pour les signatures. **Le transport des appels Stripe est substitué**, sans utiliser un compte Stripe ni faire croire à un abonnement réel. Ils couvrent :

- consentements, versions des CGV/de l’offre, refus des prix/clients/rôles envoyés par le navigateur ;
- client et Checkout liés au compte authentifié, intention persistée avant l’appel externe ;
- double onglet et réponse perdue, clé d’idempotence et paramètres identiques lors de la reprise ;
- mauvais compte, montant ou mode ; signatures absentes, corps altéré, horodatage expiré et événement Connect refusés ;
- événement dédupliqué et client inconnu ignoré ; événement tardif ne réactivant pas une résiliation ;
- activation, renouvellement, hausse et baisse ; droit payé antérieur conservé pendant une hausse non réglée, sans être transféré à un nouvel abonnement ;
- résiliation à échéance et expiration exacte, `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `trialing`, `canceled`, facture ouverte et prix inconnu ;
- panne de lecture Stripe, transaction annulée et événement retransmissible ;
- isolation du portail, administration refusée aux comptes ordinaires, correspondance exacte du propriétaire Neon et Premium permanent sans facturation ;
- administration journalisée, quotas serveur documents/images et documents encore éditables après retour gratuit.

Le navigateur vérifie pages publiques, état préparatoire des textes légaux, compte privé, formule gratuite, cases de consentement sans possibilité d’achat non configuré, refus API malgré un appel direct avec bonne origine, refus administratif et affichage mobile 390×844. Les autres parcours continuent à tester les documents, les formats, la sauvegarde, les conflits et FSRS.

Un premier test attendait la boîte email locale avant sa création ; il a été corrigé pour attendre réellement son apparition. Un autre appel Playwright omettait l’en-tête Origin et était correctement refusé en 403 : le test fournit désormais l’origine légitime pour contrôler séparément le refus 503 de facturation. Une exécution a aussi été invalidée par un redémarrage du serveur de développement pendant une modification ; la suite complète a été relancée sur des sources stabilisées et les 7 parcours ont réussi.

## Déploiement et Neon

La préparation est d’abord réalisée sur la branche de test existante `mission-2`, liée à Neon `development`, sans créer de nouveau projet. Les nouvelles migrations `0005`–`0007` ajoutent les projections de facturation, l’audit, les contraintes et la preuve du dernier droit payé sans réécrire les cinq migrations appliquées ni modifier les documents ou calendriers FSRS.

Les références des déploiements et résultats hébergés sont ajoutées après confirmation ; les seuls résultats locaux ci-dessus ne valent pas validation de production.

## Blocages réels et opérations non exécutées

L’inventaire des outils et ressources de cette conversation ne propose pas d’action Stripe ; l’inventaire des noms de variables de la machine et du site Netlify ne contient pas de clé Stripe serveur. Le plugin est visible comme installé dans l’interface du titulaire, mais ses actions ne sont pas fournies ici. Les deux Payment Links publics fournis sont conservés dans [billing.md](billing.md) et ne sont pas des autorisations API.

**Non testés avec Stripe réel** : achat en sandbox, refus bancaire/3DS, renouvellement via horloge de test, changement/résiliation dans Customer Portal, émission et livraison de webhooks depuis Stripe. Aucun produit/prix ou compte Stripe n’a été créé, aucun abonnement ni paiement réel lancé, aucun remboursement effectué. Le script automatique de provisionnement est compilé mais son chemin API reste non exécuté sans autorisation.

Les coordonnées légales de l’éditeur, sa situation fiscale, son médiateur, ses durées de conservation et engagements contractuels n’ont pas été inventés. Les pages publiques sont préparatoires et la vente est bloquée côté serveur. La mission 3 ne peut donc pas être déclarée commercialement opérationnelle sur la seule base de ces tests. Aucun travail de mission 4 n’est commencé.
