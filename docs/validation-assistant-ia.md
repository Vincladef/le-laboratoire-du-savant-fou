# Validation — création rapide et assistant IA

Validation réalisée le 6 novembre 2026 sur le code `b7c078cbfcf520180a2762d1b79de7bbd0d78e53`.

## Fonctionnement livré

- Création immédiate par bouton, action de sélection et Ctrl/Cmd + Maj + M. Le focus reste dans l’éditeur et la frappe suivante n’étend pas le trou.
- Fiche contextuelle d’indice, priorité et difficulté ; conservation de la réponse et de ses styles.
- Assistant OpenAI `gpt-6-luna` : annotation d’une sélection, d’un onglet ou de tous les onglets, rédaction, continuation et génération de texte à trous.
- Propositions modifiables et sélection des trous avant application ; rejet sans modification du document ; refus d’application lorsque le document a changé.
- Identités stables après sauvegarde, changement d’onglet, rechargement et reconnexion. Paragraphes générés insérés sans interpréter de HTML. Quotas persistants et atomiques, conservés pendant la maintenance des limites d’authentification.

## Vérifications locales

TypeScript, compilation Vite et empaquetage de la fonction Netlify réussis. **104 tests unitaires/intégration et 19 parcours Playwright réussis.** Les scénarios couvrent styles, liens, tableaux, Unicode, citations répétées, annotations existantes, aperçus modifiables, rejet, les quatre modes IA, les trois périmètres, insertion, sauvegarde, reconnexion, erreurs réseau, conflits, imports/exports et interface responsive. Les réponses IA locales sont déterministes et les contrôles serveur utilisent un fournisseur injecté.

Après renforcement du compteur partagé avec l’authentification, les 22 tests API/fournisseur concernés ont été rejoués avec succès, dont la résistance du plafond IA au nettoyage des anciennes limites de connexion.

Captures et traces locales dans `test-results/`. Les vues ordinateur et mobile sont vérifiées sous Chromium, notamment en 1440 × 1000 et 390 × 844 ; ces essais ne constituent pas une recette sur un appareil iOS physique.

## Vérifications déployées

Développement : déploiement `6aedb0e2efaaf6e7b22720b2`, état `ready`, **15 contrôles Neon Auth et 10 parcours Chromium hébergés**, aucune erreur JavaScript, inventaire stable et archives conservées. Les 13 migrations existantes ont été reconnues ; aucune migration supplémentaire.

Production : le déploiement `6aedb1af300a4cbdd91d5a2e` a vérifié l’accès effectif à `gpt-6-luna` et les quatre modes avec de vrais appels OpenAI avant publication. Les sources de cette recette étaient synthétiques et aucun document n’a été modifié par ce contrôle fournisseur.

Le déploiement final `6aedb248e5831fb0614777d1`, état `ready`, a ensuite validé le site HTTPS publié : **15 contrôles Neon Auth et 12 parcours navigateur hébergés**, sans erreur JavaScript. Les deux parcours supplémentaires utilisent réellement OpenAI : aperçu et acceptation d’une annotation, réouverture avec le même identifiant dans Neon, puis rédaction d’un texte à trous sur mobile avec conservation du passage antérieur.

Le compte et les documents synthétiques ont été nettoyés. Les inventaires, les versions, les annotations et l’empreinte du contenu des documents avant et après les essais de production sont identiques. Aucun schéma n’a été supprimé, aucune migration nouvelle n’a été appliquée. Les paramètres temporaires de recette ont été retirés ; la clé secrète de production est conservée dans Netlify. Les builds ordinaires ne lancent pas de génération IA payante.

Site publié : https://bouche-trou.netlify.app
