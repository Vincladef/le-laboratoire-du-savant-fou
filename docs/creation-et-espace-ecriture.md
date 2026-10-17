# Création des trous et espace d’écriture — 17 octobre 2026

Le formulaire de création propose indice facultatif, priorité (Moyenne par défaut) et difficulté (Non évaluée par défaut). La difficulté initiale est validée côté serveur et enregistrée dans la transaction documentaire ; les évaluations ultérieures ne sont pas écrasées par les sauvegardes. Aucun changement de schéma ni migration supplémentaire.

La croix du plan est supprimée. Le bouton « Plan » reste l’unique commande de repli. Le panneau mesure 224 px sur ordinateur et le mode « Largeur de page » occupe l’espace disponible au lieu de plafonner à 900 px. Les zooms fixes, l’export et les indices de révision avec point d’interrogation sont conservés.

## Vérifications

- TypeScript, compilation Vite et **96 tests unitaires/intégration réussis**. Vérification des quatre difficultés initiales, refus des valeurs invalides et conservation d’une évaluation après sauvegarde.
- **14 parcours Playwright réussis** après correction d’un sélecteur de test trop strict sur le nouveau formulaire. Création, contexte riche, filtres, reconnexion, erreurs réseau, plan sans croix, page dépassant 1 000 px sur ordinateur, tablette et téléphone, navigation longue sans débordement.
- Développement : commit `587672729e637f933c300e2eaabda94bcc572914`, déploiement `6ad37698acc0fdc2332c4894` **ready**. **17 contrôles HTTPS/Neon et 9 parcours Chromium hébergés**, aucune erreur JavaScript. Création avec priorité Moyenne et difficulté Difficile relue par API après sauvegarde ; inventaire et empreintes des données inchangés après nettoyage des fixtures. Les 13 migrations existantes sont reconnues, aucune appliquée.

La validation de développement ne vaut pas attestation d’un déploiement production : celui-ci doit être contrôlé séparément.
