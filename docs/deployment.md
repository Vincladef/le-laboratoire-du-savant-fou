# Déploiement Netlify + Neon

## Accès

Inventorier d’abord les projets Neon et sites Netlify du compte ; réutiliser ceux adaptés au dépôt et ne jamais migrer une base inconnue. L’accès Git HTTPS n’accorde pas les droits de gestion de ces services.

Les accès ont été activés le 14 octobre 2026. L’inventaire a retrouvé et réutilisé les ressources existantes, sans création de projet ni changement d’offre :

- Site : `le-laboratoire-du-savant-fou`, identifiant `449cbaf7-eaaa-43ce-8b27-50460f3d036c`.
- URL : https://le-laboratoire-du-savant-fou.netlify.app.
- Projet Neon : `little-dust-51900608`, « Le Laboratoire du Savant Fou ».
- Branche : `production` (`br-soft-hall-baxp2gvr`), base `laboratoire`.

`DATABASE_URL` a été réutilisée, `AUTH_BASE_URL` déduite du site, et `BETTER_AUTH_SECRET` généré cryptographiquement puis enregistré directement via l’API Netlify. Aucun secret n’est conservé dans ce dépôt. L’identifiant du site est connu par API ; le renseigner à nouveau n’est pas nécessaire.

Renseigner les accès dans les **paramètres sécurisés, jamais dans la conversation**. L’API Neon utilise `console.neon.tech`, Netlify `api.netlify.com`. Les secrets de proxy HTTP ne sont pas des identifiants PostgreSQL utilisables par `pg` : `DATABASE_URL` doit être une vraie variable serveur du processus de migration et des fonctions Netlify.

## Site existant

Dépôt `Vincladef/le-laboratoire-du-savant-fou`, branche `main`, build `npm run build:netlify`, publication `dist`, fonctions `netlify/functions`, Node 24. `netlify.toml` fournit redirections et en-têtes. Netlify Blobs utilise le contexte du site et le magasin `laboratoire-assets`. Aucune infrastructure Vercel.

Variables serveur, contexte `production`. Netlify Free a refusé le périmètre « Functions » seul (HTTP 403, offre supérieure requise). Les variables utilisent donc les quatre périmètres standards : builds, functions, runtime, post_processing. Elles ne sont pas préfixées `VITE_` et ne sont pas incorporées au navigateur. Ne jamais afficher l’environnement dans les journaux de build.

| Variable | Usage |
| --- | --- |
| `DATABASE_URL` | PostgreSQL Neon avec TLS, endpoint poolé recommandé pour les fonctions |
| `BETTER_AUTH_SECRET` | Secret aléatoire d’au moins 32 caractères |
| `AUTH_BASE_URL` | Origine HTTPS exacte du site |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Serveur email et expéditeur autorisé |
| `SMTP_USER`, `SMTP_PASSWORD` | Authentification SMTP si nécessaire |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth Google, optionnel tant que cette connexion reste désactivée |

Ne jamais utiliser `VITE_` pour ces variables ni les inclure dans Git/logs. SMTP exige TLS (465 ou STARTTLS sur 587). Aucun fournisseur payant n’est commandé. Pour Google, autoriser le callback exact `https://VOTRE-DOMAINE/api/auth/callback/google`, configurer le consentement et tester avec un compte autorisé.

## Migrations et publication

Inspecter l’identité de la base, le schéma `lab` et le journal Drizzle avant migration. Si `lab` existe sans le journal attendu, examiner son contenu plutôt que le supprimer. Dans un terminal autorisé avec `DATABASE_URL` injectée :

```sh
npm ci
npm run db:migrate
```

Par défaut, les builds n’exécutent aucune migration distante. Pour une préparation explicitement autorisée depuis Netlify, quatre variables temporaires sont utilisables :

| Variable | Valeur / rôle |
| --- | --- |
| `LAB_DEPLOY_PREPARE` | `1` active la préparation, uniquement en build Netlify de production |
| `LAB_EXPECTED_DATABASE_HOST` | Hôte exact de la connexion Neon déjà inspectée |
| `LAB_EXPECTED_DATABASE_NAME` | `laboratoire` pour ce projet |
| `LAB_VERIFY_REMOTE` | `1` lance la recette sur l’URL de production déjà publiée |

`scripts/netlify-prepare.ts` vérifie l’identité, prend un verrou, inspecte le schéma et compare les empreintes du journal aux migrations locales. Il refuse un schéma `lab` inconnu ou un journal étranger. Les migrations utilisent une transaction et sont idempotentes. Ces quatre variables doivent être retirées après la préparation voulue ; ne pas les activer sur les previews.

La recette est effectuée contre le service **déjà publié**, pas contre un build encore non servi. Deux comptes de contrôle `@example.test`, vérifiés exclusivement comme fixtures administratives, utilisent des mots de passe aléatoires jamais affichés et le rôle gratuit. Le script teste de vraies requêtes HTTPS puis supprime précisément ces comptes et leurs données SQL. Il ne contourne pas la vérification email des inscriptions publiques.

Netlify interdit aux jetons de build la suppression dans les magasins Blobs partagés du site. Le script signale donc les clés exactes des images de test restantes dans son rapport ; leur nettoyage est effectué séparément via l’API Netlify autorisée, après vérification des cibles. Il ne faut ni élargir les droits du build ni supprimer un magasin entier pour ce nettoyage.

Le plugin local `netlify/plugins/deployment-report` rend les résultats sans secrets consultables dans le statut Netlify et son API. Une recette en échec fait échouer le build ; une recette non activée ne produit pas de faux résultat.

## Recette distante obligatoire

1. `/api/health` doit répondre `status=ok`, base `postgresql`. `email=missing` tant que SMTP n’est pas configuré.
2. Inscription, réception du mail, confirmation, connexion et récupération de compte.
3. Dossier, document, image, mise en forme et sauvegarde.
4. Déconnexion/reconnexion depuis un autre navigateur : texte, images et versions conservés.
5. Second compte incapable d’accéder aux documents du premier ; conflit explicite entre deux sauvegardes.
6. Google si configuré ; exports DOCX et PDF examinés avec les limites documentées.

Les résultats hébergés sont détaillés dans [validation.md](validation.md). La réception SMTP et Google nécessitent encore leurs propres vérifications. Les quotas gratuits de Neon/Netlify et l’accumulation des versions doivent être surveillés. Aucun achat ou changement d’offre n’est automatisé.

## Interventions externes restantes

- **Email** : autoriser un expéditeur auprès d’un fournisseur SMTP et fournir son accès via les paramètres sécurisés. Cette autorisation du compte/expéditeur ne peut pas être déduite des clés Neon ou Netlify. Les variables attendues figurent ci-dessus ; un hôte ne suffit pas à prouver la délivrabilité. L’inscription et la récupération publiques restent désactivées en attendant.
- **Google (facultatif)** : créer/configurer le client OAuth et l’écran de consentement dans le projet Google Cloud choisi, avec le callback `https://le-laboratoire-du-savant-fou.netlify.app/api/auth/callback/google`, puis fournir les deux identifiants via les paramètres sécurisés. Aucun accès Google Cloud n’est fourni ici.

Ces opérations n’empêchent pas la publication de l’application ni les tests contrôlés de connexion et de persistance. Aucune valeur fictive ni compte propriétaire par défaut n’est installé.
