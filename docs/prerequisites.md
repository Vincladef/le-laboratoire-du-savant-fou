# Services et prérequis des missions restantes

État vérifié le 15 octobre 2026. Les données privées et les secrets ne sont pas reproduits ici.

## Services existants

- GitHub : le dépôt privé existant et le proxy HTTPS permettent de lire et publier le code.
- Netlify Free : le site existant est conservé. La branche `mission-2` utilise des variables distinctes et la branche Neon `development` ; `main` utilise `production`.
- Neon : Managed Better Auth est déjà actif sur les deux branches, avec un fournisseur email **shared** et Google OAuth **shared**. Ces intégrations suffisent au développement et aux premières validations sans serveur SMTP externe ni client Google Cloud propre.
- L’API Neon refuse les liens de vérification avec son fournisseur email partagé (`INVALID_EMAIL_VERIFICATION_METHOD`). La confirmation emploie donc les codes email. La récupération utilise les liens de réinitialisation prévus par Neon, compatibles avec le fournisseur partagé. La vérification email est exigée avant tout accès aux documents.
- FSRS : `ts-fsrs` 5.4.2, licence MIT, moteur FSRS 6, fonctionne dans le backend Netlify existant. Aucun service ou abonnement supplémentaire.
- Les textes à trous utilisent les marques Tiptap/ProseMirror déjà prévues. Les révisions, cartes et séances restent dans les tables PostgreSQL `lab`, avec contrôle du propriétaire côté serveur.

## Limites des fournisseurs partagés

La [documentation Neon de production](https://neon.com/docs/auth/production-checklist), mise à jour le 9 octobre 2026, distingue le service Auth géré de ses fournisseurs partagés de développement. Les codes de vérification et la récupération fonctionnent avec l’email partagé, mais celui-ci est limité en débit. Les [identifiants Google partagés](https://neon.com/docs/auth/guides/setup-oauth) affichent l’application Neon sur le consentement et sont destinés aux essais. Avant une ouverture commerciale, Neon prévoit un fournisseur email propre et recommande des identifiants OAuth propres à l’application. Les API Neon ne peuvent pas créer un client privé dans Google Cloud à la place du titulaire.

Ces limites ne bloquent pas la mission 2 ni ses tests hébergés. Les futurs fournisseurs se configureront dans Managed Better Auth, sans revenir à un serveur d’authentification auto-hébergé. Les réglages techniques seront effectués par API dès qu’un accès autorisé au fournisseur existe ; le consentement personnel du titulaire et la validation éventuelle du domaine restent nécessaires.

Le [service Managed Better Auth](https://neon.com/docs/auth/about) annonce jusqu’à **60 000 utilisateurs actifs mensuels** dans Neon Free au moment de cette vérification. Cela ne supprime pas les quotas de stockage/calcul, d’envoi email ou de Netlify. Aucun changement d’offre n’est effectué.

## Stripe : installation et accès effectif

La capture de l’utilisateur montre Stripe installé dans son application Codex. L’inventaire des outils effectivement appelables dans cette conversation n’expose actuellement **aucune action Stripe**, aucun outil de recherche de connecteurs, ni variable d’authentification Stripe. L’installation dans l’interface ne permet pas d’inventer ces droits ou les identifiants des produits.

Lorsqu’un outil Stripe sera exposé, commencer par des lectures : identité du compte, distinction test/production, produits Pro et Premium existants, prix EUR récurrents mensuels 900 et 1900 centimes et état de commercialisation du compte. Ne pas recréer les produits et ne pas supposer qu’un identifiant de prix test existe en production.

Pour la mission 3, l’application serveur devra pouvoir créer des sessions Checkout et Portal et vérifier les événements signés. Un connecteur de gestion n’accorde pas automatiquement une authentification durable aux fonctions Netlify. Vérifier ses capacités de délégation ; à défaut, une autorisation serveur limitée à ce compte devra être fournie par le canal sécurisé pris en charge. Les secrets internes, dont la signature des webhooks, seront enregistrés directement côté serveur quand les API autorisées permettent de les obtenir. Aucun secret ne doit être transmis dans la conversation.

## Ce qui peut nécessiter une personne

1. La connexion Google et la lecture d’un email exigent l’accès personnel au compte ou à la boîte de l’utilisateur. La configuration technique partagée de Neon se fait par API ; une authentification personnelle ne doit pas être simulée. Les fixtures administratives de test sont signalées séparément et supprimées.
2. Une autorisation Stripe utilisable dans cette conversation et dans l’application est nécessaire si ces droits ne sont pas déjà exposés. La liste finale des opérations à autoriser dépendra de la capacité effective du connecteur.
3. Pour une commercialisation, les attestations d’identité/entreprise, les coordonnées de versement, le consentement aux conditions Stripe et les choix juridiques/fiscaux relèvent du titulaire. Les textes contractuels, la politique de confidentialité, les conditions d’abonnement et le traitement des taxes devront être validés avec ses informations réelles ; aucun numéro d’entreprise ou statut n’est inventé.
4. Avant ouverture commerciale, autoriser les fournisseurs email/OAuth propres à l’application si leurs accès ne sont pas exposés. Les réglages dans Neon seront automatisés ; les essais continuent avec les fournisseurs partagés.

Ces prérequis n’empêchent pas la livraison de la mission 2. La facturation ne sera pas implémentée avant sa livraison et aucun paiement réel ne sera réalisé pendant les tests.
