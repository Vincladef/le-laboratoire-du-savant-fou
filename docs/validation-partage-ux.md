# Validation — simplification, partage et typographie

Livraison du 6 novembre 2026. Code fonctionnel final : `5552fe2e52aa430da6ffbb6a69a90dbe6845e342`.

- 106 tests unitaires/intégration validés (suite de 105 tests, puis ajout et validation du parcours d’images publiques et copiées). TypeScript, build Vite et paquet Netlify réussis. Les tests DOCX vérifient le défaut 11 pt et les espacements 0/0, tout en conservant une taille explicite de 18 pt.
- 20 parcours Chromium locaux réussis : édition, sauvegarde, conflits, révision, import/export, accessibilité, ordinateur et téléphone. Les trois parcours IA/partage ont ensuite été rejoués avec succès, notamment rédaction libre et continuation contextuelle.
- Le partage est testé côté API : permissions, lecture sans session, version figée et version à jour, absence d’accès privé, révocation, copie idempotente et nouvelles identités de passages. Les images autorisées sont accessibles par le lien ; leurs copies restent indépendantes après révocation.
- Migration `0013_foamy_sleeper.sql` : deux nouvelles tables, aucune réécriture des documents existants. Développement : déploiement `6aedbb604f7f8aad3f0149d8`, migration appliquée ; déploiement `6aedbc1d32c04c5ab4db5cf9`, 15 contrôles Neon et 11 parcours navigateur hébergés réussis, dont le partage public mobile. Inventaire stable après nettoyage.
- Production : déploiement `6aedbc6fd8d76db96524987a`, migration additive appliquée, données préservées. Déploiement final `6aedbe8071cfc95a73d269af`, état ready : 15 contrôles Neon et 13 parcours navigateur sur le site HTTPS réussis. Les essais incluent de vrais appels Luna, l’acceptation et la persistance des trous, le texte généré avec trous sur mobile, puis lecture anonyme, révision, copie après connexion et révocation du partage.

Aucune erreur JavaScript dans les contrôles hébergés. Inventaires et empreinte des documents, versions, passages et archives inchangés avant/après les essais de production. Les comptes, documents et partages de recette sont nettoyés. Les paramètres temporaires de vérification sont retirés ; les builds ordinaires ne déclenchent pas d’appels IA payants.

Les tests mobiles utilisent Chromium en 390 × 844 ; ils ne constituent pas une recette sur un appareil iOS physique. L’envoi d’une confirmation email est vérifié côté service, sans attester la réception dans une boîte personnelle. Le retour vers une copie est vérifié après connexion ; il utilise le même chemin après confirmation d’inscription et conserve l’intention lors du retour OAuth.

Production : https://bouche-trou.netlify.app
