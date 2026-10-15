# Validation de la mission 3

Recette du 15 octobre 2026. Le code livré, les tests avec transport Stripe substitué et une véritable recette Stripe ne sont pas confondus.

## Vérifications locales exécutées

| Vérification | Résultat |
| --- | --- |
| TypeScript | Réussi |
| Tests PostgreSQL/éditeur/API | **74 tests réussis, 8 fichiers**, dont 29 cas de facturation |
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
- administration journalisée, quotas serveur documents/images/passages et documents encore éditables après retour gratuit ;
- sauvegarde de 500 annotations, refus transactionnel de la 501e en gratuit puis acceptation Pro ; fenêtres de 10/30 versions et protection historique de 100, sans suppression des 35 archives utilisées dans le test.

Le navigateur vérifie pages publiques, état préparatoire des textes légaux, compte privé, formule gratuite, cases de consentement sans possibilité d’achat non configuré, refus API malgré un appel direct avec bonne origine, refus administratif et affichage mobile 390×844. Les autres parcours continuent à tester les documents, les formats, la sauvegarde, les conflits et FSRS.

Un premier test attendait la boîte email locale avant sa création ; il a été corrigé pour attendre réellement son apparition. Un autre appel Playwright omettait l’en-tête Origin et était correctement refusé en 403 : le test fournit désormais l’origine légitime pour contrôler séparément le refus 503 de facturation. Une exécution a aussi été invalidée par un redémarrage du serveur de développement pendant une modification ; la suite complète a été relancée sur des sources stabilisées et les 7 parcours ont réussi.

## Déploiement et Neon

La préparation est d’abord réalisée sur la branche de test existante `mission-2`, liée à Neon `development`, sans créer de nouveau projet. Les nouvelles migrations `0005`–`0009` ajoutent projections de facturation, audit, contraintes, preuve du dernier droit payé, protection de l’historique et index propriétaire/statut. Les cinq migrations antérieures ne sont pas réécrites ; documents et calendriers FSRS ne sont pas modifiés par ces migrations.

Development : `6ad1225d37186b7504e9210d` a appliqué `0005`–`0007` et réussi 15 contrôles Neon ; `6ad12606af386205134fc0ac` a appliqué `0008`–`0009` et réussi les 15 contrôles du code avec les plafonds définitifs côté serveur. Puis le déploiement **`6ad1267dc8a186ac21589590`**, code applicatif `7a4d6d4fa9c6ca146aed6455370b372942d65fd5`, est `ready` : **10 migrations connues, 19 tables, 16 contrôles HTTPS et 6 parcours Chromium hébergés réussis**, aucune erreur JavaScript. Les fonctions testées couvrent le socle documentaire/FSRS, les droits gratuits, les plafonds repris de Stripe, les ventes fermées sans raccordement et les pages légales mobiles.

Les comptes de recette sont nettoyés précisément ; inventaires avant/après identiques : les 4 identités Auth development préexistantes sont conservées ; aucun document, passage, carte, révision, séance, abonnement ou événement de facturation de test ne reste. La lecture SQL après le navigateur confirme 3 cartes et 3 révisions, avant leur nettoyage.

L’inventaire **READ ONLY** de production a trouvé **1 utilisateur applicatif, 1 document, 14 versions, 2 identités Auth**, sans identité historique non associée. Deux inventaires consécutifs ont donné le même hash documentaire. La connexion secondaire de cet inventaire et le drapeau d’inspection des liens ont été retirés après usage ; ils sont régénérables par API.

La recette de production est enregistrée après confirmation, distinctement de development.

## Environnement et dépendances

`npm ci --cache /workspace/.npm-cache` a été réexécuté avec le lockfile et vérifications d’intégrité normales, puis TypeScript et les deux builds ont réussi. Le démarrage local explicite répond HTTP 200 et `status: ok`, `authentication: local`, `database: local-postgresql`. Le catalogue expose la version d’offre `2026-10-15-v2` et `checkoutReady: false`. Le serveur lancé pour le contrôle a été arrêté.

`npm audit --omit=dev` retourne **7 alertes modérées, 0 haute et 0 critique**, code 1 attendu ; ce n’est pas un audit sans alertes. Aucune correction forcée ou désactivation de sécurité. Les avertissements de dépendances paires transitives Neon restent signalés. Stripe Tax et toute offre payante supplémentaire ne sont pas activés. Les quotas techniques ne réservent pas une capacité garantie par utilisateur sur les plans gratuits Neon/Netlify ; surveiller leur capacité globale avant montée en charge.

## Blocages réels et opérations non exécutées

L’inventaire des outils et ressources de cette conversation ne propose pas d’action Stripe ; l’inventaire des noms de variables de la machine et du site Netlify ne contient pas de clé Stripe serveur. Le plugin est visible comme installé dans l’interface du titulaire, mais ses actions ne sont pas fournies ici. Les deux Payment Links publics fournis sont conservés dans [billing.md](billing.md) et ne sont pas des autorisations API.

**Non testés avec Stripe réel** : achat en sandbox, refus bancaire/3DS, renouvellement via horloge de test, changement/résiliation dans Customer Portal, émission et livraison de webhooks depuis Stripe. Aucun produit/prix ou compte Stripe n’a été créé, aucun abonnement ni paiement réel lancé, aucun remboursement effectué. Le script automatique de provisionnement est compilé mais son chemin API reste non exécuté sans autorisation.

Les coordonnées légales de l’éditeur, sa situation fiscale, son médiateur, ses durées de conservation et engagements contractuels n’ont pas été inventés. Les pages publiques sont préparatoires et la vente est bloquée côté serveur. La mission 3 ne peut donc pas être déclarée commercialement opérationnelle sur la seule base de ces tests. Aucun travail de mission 4 n’est commencé.
