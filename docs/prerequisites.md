# Services et prérequis des missions restantes

État vérifié le 15 octobre 2026. Les données privées et les secrets ne sont pas reproduits ici.

## Services existants

- GitHub : le dépôt privé existant et le proxy HTTPS permettent de lire et publier le code.
- Netlify Free : le site existant est conservé. La branche `mission-2` utilise des variables distinctes et la branche Neon `development` ; `main` utilise `production`.
- Neon : Managed Better Auth est déjà actif sur les deux branches, avec un fournisseur email **shared** et Google OAuth **shared**. Ces intégrations suffisent au développement et aux premières validations sans serveur SMTP externe ni client Google Cloud propre.
- L’API Neon refuse les liens de vérification avec son fournisseur email partagé (`INVALID_EMAIL_VERIFICATION_METHOD`). Le parcours géré utilise donc les codes email, y compris pour la récupération. La vérification email est exigée avant tout accès aux documents.
- FSRS : `ts-fsrs` 5.4.2, licence MIT, moteur FSRS 6, fonctionne dans le backend Netlify existant. Aucun service ou abonnement supplémentaire.
- Les textes à trous utilisent les marques Tiptap/ProseMirror déjà prévues. Les révisions, cartes et séances restent dans les tables PostgreSQL `lab`, avec contrôle du propriétaire côté serveur.

## Stripe : installation et accès effectif

La capture de l’utilisateur montre Stripe installé dans son application Codex. L’inventaire des outils effectivement appelables dans cette conversation n’expose actuellement **aucune action Stripe**, aucun outil de recherche de connecteurs, ni variable d’authentification Stripe. L’installation dans l’interface ne permet pas d’inventer ces droits ou les identifiants des produits.

Lorsqu’un outil Stripe sera exposé, commencer par des lectures : identité du compte, distinction test/production, produits Pro et Premium existants, prix EUR récurrents mensuels 900 et 1900 centimes et état de commercialisation du compte. Ne pas recréer les produits et ne pas supposer qu’un identifiant de prix test existe en production.

Pour la mission 3, l’application serveur devra pouvoir créer des sessions Checkout et Portal et vérifier les événements signés. Un connecteur de gestion n’accorde pas automatiquement une authentification durable aux fonctions Netlify. Vérifier ses capacités de délégation ; à défaut, une autorisation serveur limitée à ce compte devra être fournie par le canal sécurisé pris en charge. Les secrets internes, dont la signature des webhooks, seront enregistrés directement côté serveur quand les API autorisées permettent de les obtenir. Aucun secret ne doit être transmis dans la conversation.

## Ce qui peut nécessiter une personne

1. La connexion Google et la lecture d’un email exigent l’accès personnel au compte ou à la boîte de l’utilisateur. La configuration technique partagée de Neon se fait par API ; une authentification personnelle ne doit pas être simulée. Les fixtures administratives de test sont signalées séparément et supprimées.
2. Une autorisation Stripe utilisable dans cette conversation et dans l’application est nécessaire si ces droits ne sont pas déjà exposés. La liste finale des opérations à autoriser dépendra de la capacité effective du connecteur.
3. Pour une commercialisation, les attestations d’identité/entreprise, les coordonnées de versement, le consentement aux conditions Stripe et les choix juridiques/fiscaux relèvent du titulaire. Les textes contractuels, la politique de confidentialité, les conditions d’abonnement et le traitement des taxes devront être validés avec ses informations réelles ; aucun numéro d’entreprise ou statut n’est inventé.

Ces prérequis n’empêchent pas la livraison de la mission 2. La facturation ne sera pas implémentée avant sa livraison et aucun paiement réel ne sera réalisé pendant les tests.
