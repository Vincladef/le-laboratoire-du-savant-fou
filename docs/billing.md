# Facturation et droits — mission 3

## État du raccordement

Le code utilise le SDK officiel `stripe` **23.0.0**, licence MIT, API **2026-09-30.endive**. Il ne contient aucun identifiant de produit/prix inventé ni secret. Au démarrage de cette mission, les outils de cette conversation et les variables existantes de Netlify ne fournissaient aucun accès Stripe serveur. L’installation visible du plugin dans Codex n’est pas contestée ; ses actions ne sont pas exposées ici.

Liens publics fournis par le titulaire, conservés pour retrouver les produits existants :

- https://buy.stripe.com/14AcN40XQ29egaJ4ymffy0R
- https://buy.stripe.com/9B6fZg4a25lq1fPc0Offy0S

L’inspection Chromium depuis Netlify a identifié le premier comme Pro, le second comme Premium, avec leurs descriptions mensuelles et plafonds. Depuis la localisation du runner, les pages affichaient des USD et une conversion incluant 4 % de frais. Les Checkout de l’application sont donc explicitement en EUR, avec tarification adaptative désactivée. L’inspection publique ne fournit ni une clé serveur ni un secret de webhook ni les IDs de prix vérifiés par API. Les liens ne sont pas intégrés comme boutons d’achat anonymes : un achat non rattaché au compte applicatif ne doit pas promettre des droits. Aucun formulaire n’est rempli et aucun paiement n’est réalisé.

**Les ventes restent fermées** tant que Stripe et la validation juridique ne sont pas finalisés. Il n’existe aucun faux Checkout de démonstration sur le site. Une tentative directe vers l’API refuse également l’achat.

## Formules et quotas

`src/shared/plans.ts` centralise les prix, limites et version d’offre `2026-10-15-v2`. Les plafonds payants sont ceux lus sur les pages Stripe existantes, pas des valeurs inventées :

| Formule | Prix mensuel | Documents | Passages actifs | Images | Fenêtre d’historique |
| --- | --- | --- | --- | --- | --- |
| Gratuit, plafonds préparatoires | 0 € | 100 | 500 | 25 Mo | 10 dernières versions |
| Pro, description Stripe | 9 € | 100 | 5 000 | 100 Mo | 30 dernières versions |
| Premium, description Stripe | 19 € | 1 000 | 50 000 | 500 Mo | 100 dernières versions |

Les comptes antérieurs à la migration `0008` conservent leur accès historique aux 100 dernières versions, même en gratuit ou Pro. La migration ne supprime aucune archive. Les nouveaux plafonds gratuits restent centralisés et préparatoires, sans engagement commercial irréversible ; les 100 documents et 25 Mo existants sont conservés. Un compte déjà au-dessus d’un quota de passages ne perd rien et peut continuer ses modifications sans croissance du nombre de passages. Les prix Stripe doivent être fixes, EUR, mensuels, usage `licensed`, quantité 1, taxes incluses. La situation fiscale réelle reste à valider.

Éditeur, versions, import/export, annotations et FSRS sont disponibles dans chaque formule. Une image reste limitée à 4 Mo pour toutes les formules. Le quota en octets concerne les images privées, pas un disque général ni une promesse de stockage PostgreSQL illimité. La corbeille compte dans le quota documentaire.

Les nouvelles créations, annotations et images prennent le verrou du profil et calculent les droits dans la même transaction que la réservation du quota. Un dépassement d’annotations annule ensemble document, version, index et cartes ; le brouillon local reste récupérable. Retirer des annotations demeure possible. L’historique est une fenêtre consultable, pas une purge : ni les sauvegardes ni les révisions FSRS ne sont arrêtées parce que la fenêtre est pleine. Le serveur vérifie également la fenêtre sur l’accès individuel à une version. Un retour gratuit ne supprime aucun document, version, carte ou historique et n’empêche pas l’édition/l’export des documents existants. Les caches clients de facturation et d’administration sont séparés par identité ; le rôle affiché en cache ne suffit jamais à attribuer les droits.

## Cycle Stripe

- `POST /api/billing/checkout` : session authentifiée, origine vérifiée, offre/CGV versionnées et deux consentements explicites. Prix, compte, mode, client et URLs sont choisis côté serveur. Pas d’essai gratuit implicite ni de code promotionnel libre.
- Le client Stripe porte les métadonnées serveur `app=lab_savant_fou` et `labUserId`. Un propriétaire Premium permanent ne peut pas créer de client payant ou ouvrir Checkout.
- Une intention de souscription est enregistrée **avant** l’appel externe. UUID, expiration, CGV et offre restent identiques après une réponse perdue. Un Checkout ouvert est réutilisé ; changer de plan pendant cette ouverture est refusé. Une intention ambiguë non résolue peut nécessiter d’attendre son expiration de 31 minutes avant une nouvelle demande : aucune seconde facturation n’est risquée pour masquer une erreur réseau.
- Un abonnement non terminal empêche une deuxième souscription. Les modifications et résiliations passent par le portail du client déjà associé, sans accepter un identifiant Stripe envoyé par le navigateur.
- `POST /api/billing/refresh` relit l’état du client auprès de Stripe. La page de succès n’attribue aucun droit. Sans événement reçu, ce bouton permet une réconciliation ; une période expirée ne reste pas payante indéfiniment.
- `POST /api/billing/webhook` est la seule exception exacte au contrôle d’origine des écritures navigateur. Le corps original et la signature sont vérifiés par le SDK, tolérance de 300 secondes ; un autre mode ou un événement Connect est refusé.
- Chaque événement est verrouillé et traité dans une transaction PostgreSQL. Son acquittement et la mise à jour des droits sont atomiques. Une erreur annule la transaction pour permettre la retransmission Stripe.
- Les événements tardifs relisent **l’état courant via l’API**, et ne réappliquent pas un ancien objet de leur payload. Un `invoice.paid` ancien ne réactive donc pas un abonnement résilié.
- Le droit payant exige un paiement confirmé, un seul abonnement applicatif non terminal, un seul article reconnu de quantité 1, le bon mode et une période non expirée. Le dernier droit payé est conservé avec sa facture, son abonnement et sa date de fin : une hausse encore ouverte ne confère pas le nouveau niveau mais conserve l’ancien jusqu’à son échéance, y compris si cette facture de changement (`subscription_update`) place l’abonnement en `past_due`. Ce droit ne se transfère pas à un nouvel abonnement et n’est jamais prolongé au-delà de la période déjà payée. Hors ce cas précis de hausse, l’état actif est requis : impayé de renouvellement, paiement initial incomplet, essai non prévu, suspension, prix inconnu payé ou duplication rendent le compte gratuit sans effacer ses données. Il n’y a pas de délai de grâce implicite.
- Une résiliation à échéance conserve l’accès payé jusqu’à la fin UTC. Les paramètres du portail doivent programmer une baisse en fin de période et afficher les proratas d’une hausse avant confirmation. Une hausse non payée ne donne pas Premium.

Les factures et remboursements sont gérés chez Stripe ; ce code ne réalise pas de remboursement automatique. Les références et états, pas les cartes bancaires ni les documents, sont stockés dans Neon.

## Configuration à automatiser dès qu’un accès serveur existe

Variables **serveur** Netlify, séparées entre branche de test et production :

| Variable | Provenance |
| --- | --- |
| `STRIPE_SECRET_KEY` | Autorisation serveur du compte existant, mode test d’abord ; pas un lien public ni une clé publiable |
| `STRIPE_ACCOUNT_ID` | Lecture de l’identité du compte par API |
| `STRIPE_MODE` | `test`, puis `live` après validation ; jamais de mélange |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID` | Retrouver les prix des produits existants, vérifier 900/1900 centimes EUR récurrents mensuels |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Configuration dédiée aux deux prix, factures, moyens de paiement, changements et résiliation à échéance |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature renvoyé lors de la création de l’endpoint exact `/api/billing/webhook` |
| `STRIPE_CHECKOUT_ENABLED` | `1` seulement après validation de l’ensemble, sinon fermé |
| `LEGAL_PUBLIC_CONFIG` | JSON de coordonnées publiques et textes validés selon `server/legal.ts` ; jamais une clé secrète |

Les identifiants et secrets récupérables via une API autorisée ne doivent pas être recopiés manuellement. Une clé restreinte doit permettre lecture du compte/prix/clients/abonnements, création de clients et sessions Checkout/Portal ; le provisionnement des webhooks/portail exige les droits de configuration correspondants. Un connecteur de gestion ChatGPT ne délègue pas nécessairement cette autorisation aux fonctions Netlify. Ne pas enregistrer une valeur de substitution du proxy Codex comme si c’était une véritable clé serveur. Ne jamais transmettre un secret dans la conversation.

`npm run billing:configure` effectue par défaut un inventaire en lecture seule du compte, des deux liens et des prix existants dans le mode courant. Il refuse toute ambiguïté plutôt que de créer des produits. `npm run billing:configure -- --apply` configure le portail et le webhook de development puis enregistre directement les variables Netlify en conservant les autres contextes ; `--production` cible l’origine live exacte et `--enable` n’ouvre Checkout que si les informations juridiques sont valides. Ne pas lancer la configuration live avant la recette réelle de la sandbox. Le script ne crée jamais de souscription ou paiement et ne modifie pas les offres Stripe d’un autre produit. Sans clé, son refus explicite avec code 2 a été vérifié ; son provisionnement réel n’est pas présenté comme exécuté.

Stripe Tax et toute option payante supplémentaire ne sont pas activés. L’éditeur doit valider sa situation fiscale et les ventes transfrontalières ; des prix taxes incluses et une collecte d’adresse ne constituent pas à eux seuls une automatisation fiscale complète.

Réutiliser les produits existants et ne créer aucun nouveau compte/projet. Un secret de signature déjà créé ne peut pas être relu par l’API Stripe : préserver sa valeur serveur ou prévoir une rotation autorisée, pas un endpoint dupliqué silencieusement. Les tests de paiement réels nécessitent une sandbox/test Stripe ; aucune carte réelle ne doit être utilisée.

Avant toute activation, inventorier également les éventuels abonnements déjà achetés via les Payment Links et préparer leur rattachement à une identité vérifiée. Ne pas recréer aveuglément des clients/abonnements ni attribuer des droits sur la seule déclaration d’un email ou d’un navigateur. Cet inventaire exige l’API autorisée et n’a pas pu être réalisé depuis les seules pages publiques.

## Administration et propriétaire

`/admin` et les API `/api/admin/*` exigent le propriétaire calculé côté serveur. En mode Neon déployé, le profil et l’identité persistante doivent correspondre au sujet `OWNER_NEON_SUBJECT`. Aucun champ du profil public, email arbitraire ou retour Stripe ne promeut un compte. Le propriétaire conserve Premium à vie sans abonnement.

La consultation paginée expose seulement comptes, droits et références/statuts de facturation, pas les documents ni les mots de passe. La réconciliation administrative est journalisée dans `billing_admin_audit`. Aucun outil de promotion de rôle n’est exposé au navigateur.

## Informations humaines indispensables avant commercialisation

Les pages publiques `/legal/mentions`, `/legal/confidentialite`, `/legal/cgv` et `/legal/retractation` sont préparées et indiquent explicitement leur état non validé. `LEGAL_PUBLIC_CONFIG` exige identité/forme/adresse/immatriculation de l’éditeur, directeur de publication, contacts, situation fiscale, médiateur effectivement désigné et ses coordonnées, adresse de rétractation, coordonnées d’hébergement, localisation/transferts/garanties, durées de conservation, versions et validation des textes.

Ces informations ne sont ni déduites d’un pseudonyme Netlify ni inventées. Une vérification juridique demeure nécessaire, notamment garanties légales numériques, rétractation, fiscalité, résiliation et engagements de service. L’accès immédiat est demandé séparément ; il ne vaut pas renonciation automatique au droit de rétractation. L’acceptation conserve les versions, une copie des coordonnées légales et l’offre correspondante dans Neon.
