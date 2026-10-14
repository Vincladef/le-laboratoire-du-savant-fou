# Déploiement Netlify + Neon

## Accès

Inventorier d’abord les projets Neon et sites Netlify du compte ; réutiliser ceux adaptés au dépôt et ne jamais migrer une base inconnue. L’accès Git HTTPS n’accorde pas les droits de gestion de ces services.

Au démarrage de la mission, ni `NEON_API_KEY`, ni `NETLIFY_AUTH_TOKEN`, ni `DATABASE_URL`, ni site Netlify lié, ni endpoint Neon Auth n’étaient disponibles. L’inventaire distant et le déploiement ne peuvent pas être attestés sans ces accès.

Renseigner les accès dans les **paramètres sécurisés, jamais dans la conversation**. L’API Neon utilise `console.neon.tech`, Netlify `api.netlify.com`. Les secrets de proxy HTTP ne sont pas des identifiants PostgreSQL utilisables par `pg` : `DATABASE_URL` doit être une vraie variable serveur du processus de migration et des fonctions Netlify.

## Site existant

Dépôt `Vincladef/le-laboratoire-du-savant-fou`, branche `main`, build `npm run build`, publication `dist`, fonctions `netlify/functions`, Node 24. `netlify.toml` fournit redirections et en-têtes. Netlify Blobs utilise le contexte du site et le magasin `laboratoire-assets`. Aucune infrastructure Vercel.

Variables serveur, scope Functions :

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

Les migrations ne s’exécutent pas automatiquement au build. Le journal empêche leur réapplication. Publier ensuite le site configuré depuis Netlify ou la CLI authentifiée, sans changer d’abonnement.

## Recette distante obligatoire

1. `/api/health` doit répondre `status=ok`, base `postgresql`, email `configured`.
2. Inscription, réception du mail, confirmation, connexion et récupération de compte.
3. Dossier, document, image, mise en forme et sauvegarde.
4. Déconnexion/reconnexion depuis un autre navigateur : texte, images et versions conservés.
5. Second compte incapable d’accéder aux documents du premier ; conflit explicite entre deux sauvegardes.
6. Google si configuré ; exports DOCX et PDF examinés avec les limites documentées.

Les tests locaux ne prouvent ni la réception SMTP externe, ni Google, ni Neon/Blobs en production. Les quotas gratuits de Neon/Netlify et l’accumulation des versions doivent être surveillés. Aucun achat ou changement d’offre n’est automatisé.
