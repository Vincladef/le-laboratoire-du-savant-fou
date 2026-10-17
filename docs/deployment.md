# Déploiement Netlify et Neon Managed Better Auth

## Ressources réutilisées

- Site Netlify : `bouche-trou`, ID `449cbaf7-eaaa-43ce-8b27-50460f3d036c` (site renommé, non recréé).
- Production : https://bouche-trou.netlify.app, branche Git `main`.
- Site de test : https://mission-2--bouche-trou.netlify.app, branche Git `mission-2`.
- Projet Neon : `little-dust-51900608`, base `laboratoire`.
- Production : `br-soft-hall-baxp2gvr`, endpoint `ep-wispy-lake-ba7v96jl`.
- Development : `br-twilight-term-bax765a0`, endpoint `ep-holy-breeze-bap2004l`.

Aucun nouveau projet ni changement d’offre. Le dépôt privé est relié au site. Les pushes déclenchent `npm run build:netlify`, publication `dist`, fonctions `netlify/functions`, Node 24. Netlify Blobs utilise le contexte existant.

## Variables serveur

Les valeurs sont découvertes ou générées par API puis enregistrées directement dans Netlify, en préservant les autres contextes. Production et branche `mission-2` utilisent des connexions et origines distinctes. Aucun secret dans Git ou les rapports.

| Variable | Origine et usage |
| --- | --- |
| `DATABASE_URL` | Connexion production existante ; development récupérée par l’API Neon |
| `AUTH_BASE_URL` | Origine exacte déduite de Netlify |
| `BETTER_AUTH_SECRET` | Secret cryptographique des cookies du proxy, généré côté serveur |
| `NEON_AUTH_BASE_URL` | Endpoint Auth de la branche récupéré via Neon |
| `OWNER_NEON_SUBJECT` | Sujet réservé administrativement au propriétaire ; aucun email navigateur ne confère ce droit |

`NETLIFY_SITE_ID` est connu par API ; la liaison CLI peut utiliser `.netlify/state.json` ignoré. Aucune recopie manuelle n’est nécessaire.

La mission 3 conserve ces cinq variables du socle. Les variables Stripe facultatives, leur provisionnement automatisé et les informations légales sont décrits dans [billing.md](billing.md). Une configuration absente ferme les ventes côté serveur sans bloquer l’éditeur, Neon ou les révisions manuelles. Aucune valeur fictive ne doit être injectée pour faire apparaître un état « configuré ».

Netlify Free a refusé le périmètre « Functions » seul. Les variables utilisent les périmètres standards gratuits `builds`, `functions`, `runtime`, `post_processing`. Aucune variable secrète n’a de préfixe `VITE_`. Ne jamais afficher l’environnement.

## Authentification gérée

Les branches possèdent déjà Managed Better Auth, un fournisseur email partagé et Google partagé. Aucun SMTP externe pour les essais. Confirmation par code, récupération par lien, cookies du service géré.

URL Auth de production :

```text
https://ep-wispy-lake-ba7v96jl.neonauth.c-8.eu-central-1.aws.neon.tech/laboratoire/auth
```

Le retour utilisateur OAuth est `/api/auth/complete` sur l’application. Le callback à enregistrer pour un futur client Google propre est **l’URL Neon Auth suivie de `/callback/google`**, pas l’ancien callback auto-hébergé du site. Le toolkit officiel termine l’échange et gère les cookies.

Configurer par API l’origine de confiance exacte, la vérification email obligatoire, l’envoi du code à l’inscription et le nom de l’application. Désactiver `allow_localhost` en production. Préserver les autres domaines légitimes.

Chaque accès privé revalide la session auprès de Neon. La recette a montré que le service conservait les sessions après un changement de mot de passe. Le proxy résout donc le sujet par le jeton de récupération dans `neon_auth.verification`, laisse Neon consommer ce jeton et changer le mot de passe, puis révoque les sessions de ce seul sujet dans `neon_auth.session`. Aucun email ou sujet fourni par le navigateur ne décide de cette révocation. Le contrat est testé avec le service géré, dont la version Better Auth documentée était 1.7.6.

`auth_identities` préserve les propriétaires historiques des documents. Ne jamais supprimer les anciennes tables pour changer de fournisseur. Inventorier les anciens comptes avant bascule ; leurs mots de passe ne sont pas supposés automatiquement importés dans Neon.

## Migrations contrôlées

Les builds ordinaires n’exécutent pas de migration. Avant préparation, inspecter projet, hôte, base, schéma `lab` et journal Drizzle. Un journal inconnu ou une migration modifiée fait échouer l’opération ; aucun schéma existant n’est effacé.

Avec la connexion de la cible déjà injectée dans un terminal autorisé :

```sh
npm ci
npm run db:migrate
```

Pour une préparation Netlify ponctuelle :

| Variable temporaire | Rôle |
| --- | --- |
| `LAB_DEPLOY_PREPARE=1` | Active la préparation contrôlée |
| `LAB_EXPECTED_DATABASE_HOST` | Hôte exact déjà inventorié |
| `LAB_EXPECTED_DATABASE_NAME=laboratoire` | Identité attendue |
| `LAB_VERIFY_MANAGED_AUTH=1` | Recette Auth et mémorisation avec Neon réel |
| `LAB_VERIFY_PUBLISHED=1` | Requêtes contre le site HTTPS déjà publié ; sinon API en mémoire avec Neon réel |
| `LAB_VERIFY_BROWSER=1` | Chromium contre le site publié et contrôle SQL final |
| `LAB_VERIFY_BILLING=1` | Droits gratuits réels, plafonds d’offre, ventes non raccordées refusées et administration protégée |
| `LAB_ALLOW_PRODUCTION_CHECKS=1` | Autorisation supplémentaire des contrôles sur la production exacte |

La branche `mission-2` ne peut migrer que son hôte development reconnu. La production requiert sa cible exacte et ses gardes supplémentaires. Les migrations prennent un verrou et sont transactionnelles/idempotentes. La simplification des révisions n’initialise plus aucune carte ni séance ; la migration `0012` ajoute la difficulté et reprend seulement la dernière réponse explicite. Les archives historiques ne sont ni réécrites ni supprimées.

La migration personnalisée `0004_defer_review_cleanup.sql` rend différable la référence entre historique et élément de séance : la suppression d’un compte termine ses cascades avant vérification. Ne pas réécrire une migration appliquée.

## Recette et publication

1. Compiler et exécuter les tests locaux dans leurs bases temporaires isolées.
2. Migrer et vérifier development : identités, documents, annotations, difficulté, conflits, isolation et reprise.
3. Après publication de cette branche, vérifier son URL par API et avec Chromium. Un test prépublication ne valide pas un artefact encore non servi.
4. Inventorier production en lecture seule, puis configurer ses variables et Auth via API.
5. Publier le code validé sur `main`, migrer/vérifier Neon et contrôler le site publié.
6. Vérifier commit distant, déploiement `ready`, rapports et correspondance des artefacts.
7. Retirer les variables temporaires et connexions secondaires d’inventaire ; conserver les variables permanentes.

Les comptes gratuits `@example.test` sont des fixtures administratives, avec mots de passe aléatoires jamais affichés. Ils ne prouvent pas une réception email ni un consentement Google personnel. Leurs documents, cartes, historiques et séances sont supprimés précisément. Les inventaires et contrôles SQL attestent persistance puis nettoyage. Les tests Blobs de la mission 1 restent documentés ; cette recette n’a pas besoin d’images supplémentaires.

Le plugin `netlify/plugins/deployment-report` expose des résultats sans secrets dans le statut Netlify. Vérifier aussi l’état du déploiement : un plugin ayant rapporté un échec ne signifie pas que le build a réussi.

Les contrôles historiques auto-hébergés `LAB_VERIFY_REMOTE` restent pour référence ; ne pas les activer avec Auth géré. Le nettoyage exceptionnel des deux essais development interrompus est borné à leurs dates et identités synthétiques, puis désactivé.

L’inspection optionnelle `LAB_INSPECT_STRIPE_LINKS=1` est exclusivement réservée à la branche de test et à la lecture des pages publiques fournies. Elle ne soumet aucun paiement. La connexion secondaire `LAB_PRODUCTION_DATABASE_URL` n’est utilisée qu’en transaction READ ONLY pour l’inventaire, puis retirée. Supprimer ces paramètres et tous les autres drapeaux temporaires après recette.

## Ouverture commerciale

Les exigences email/OAuth propres, Stripe et juridiques sont regroupées dans [prerequisites.md](prerequisites.md). Aucune configuration SMTP/Google Cloud n’est demandée pour terminer les essais de la mission 2. Aucun service payant n’est acheté ni paiement réel exécuté.
