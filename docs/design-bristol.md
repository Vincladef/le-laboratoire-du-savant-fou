# Bouche-trou — refonte Bristol

Référence : `Bouche-trou-papier-bristol-retouche.html`, fournie par le titulaire. Nom « Bouche-trou » confirmé explicitement. La texture PNG finale est extraite à l’identique dans `src/assets/desk-paper.png`, sans charger les scripts de démonstration, les données factices ou le stockage local du prototype.

## Choix d’interface

- Bureau crème/papier froissé, encre bleu-gris, jaune doux, bleu pâle et touches pêche ; cartes et outils en papier lisse. Typographie système pour les commandes, Georgia pour le carnet. Contrastes légèrement renforcés sur les petits libellés.
- Navigation commune : rail repliable persistant sur ordinateur ; tiroir modal avec focus et Échap sur téléphone. Bibliothèque, révisions, récents, corbeille, abonnement et réglages restent reliés aux véritables fonctions.
- Bibliothèque : note d’introduction, recherche et création voisines, tri, vue grille/liste, dossiers hiérarchiques en fiches, extraits et nombres réels de trous fournis par le serveur. Aucun document d’exemple ajouté aux utilisateurs.
- Éditeur : titre et état réel de synchronisation, outils courants compacts, fonctions avancées sous « Outils », actions documentaires sous « … », choix de révision sous « Réviser ». Le plan garde sa place dans le dock ; sur petit écran il se déplie au-dessus de la feuille. Mode concentration avec sortie explicite/Échap.
- Onglets et sous-onglets réellement enregistrés, renommage, duplication et suppression récupérable par l’historique ; reprise de l’onglet et du curseur côté serveur. Voir [le contrat documentaire](document-contract.md).
- Révision sur le document entier, trous jaunes et réponses révélées vertes, indices disponibles sans panneau permanent, quatre notes FSRS dans une zone séparée. Le mode libre ne modifie pas le calendrier.

Les documents existants conservent leur typographie de base historique et leurs mises en forme explicites. Les nouveaux carnets utilisent Georgia 13 pt ; les styles enrichis restent libres. Les réglures, le ruban et les perforations sont décoratifs et ne sont pas exportés dans Word/PDF. La mise en page d’impression conserve les formats et marges existants.

## Vérifications locales

À ce stade : TypeScript, 82 tests Vitest (9 fichiers), compilation Vite et empaquetage Functions v2 réussis ; 13 parcours Playwright/Chromium réussis. Recette : inscription/confirmation locale, connexion, bibliothèque, édition riche, tableaux, images, mathématiques, DOCX, PDF, historique, récupération, conflits, annotations, FSRS, reprise mobile, onglets et export complet. Vérifications axe-core WCAG A/AA sur les écrans sélectionnés sans violation dans cette campagne ; ce n’est pas une certification complète d’accessibilité.

Les premiers essais ont révélé des règles CSS historiques concurrentes, un contraste insuffisant et un nettoyage de raccourci visant une ancienne vue Tiptap. Corrigés et rejoués. Les sélecteurs des tests ont été adaptés aux menus réels ; les assertions de persistance, d’isolation, de contenu et de droits restent actives.

Le scénario d’onglets a été étendu : suppression d’un parent avec son sous-onglet, restauration complète de la version précédente, couper-coller conservant l’identité entre onglets, second collage renouvelant l’identité, et mode concentration. La migration `0011` ajoute uniquement l’index documentaire utilisé pour le comptage des trous.

Publication development puis production et contrôle de persistance Neon : à compléter après les déploiements vérifiés. Aucun achat Stripe ni changement d’abonnement n’est déclenché par cette refonte. Le raccordement du paiement automatique et les autres limites historiques décrites dans [la recette mission 4](validation-mission-4.md) ne deviennent pas opérationnels par un changement graphique.
