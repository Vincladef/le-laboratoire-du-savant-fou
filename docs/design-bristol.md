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

À ce stade : TypeScript, 89 tests Vitest (11 fichiers), compilation Vite et empaquetage Functions v2 réussis ; 13 parcours Playwright/Chromium réussis. Recette : inscription/confirmation locale, connexion, bibliothèque, édition riche, tableaux, images, mathématiques, DOCX, PDF, historique, récupération, conflits, annotations, FSRS, reprise mobile, onglets et export complet. Vérifications axe-core WCAG A/AA sur les écrans sélectionnés sans violation dans cette campagne ; ce n’est pas une certification complète d’accessibilité.

Les premiers essais ont révélé des règles CSS historiques concurrentes, un contraste insuffisant et un nettoyage de raccourci visant une ancienne vue Tiptap. Corrigés et rejoués. Les sélecteurs des tests ont été adaptés aux menus réels ; les assertions de persistance, d’isolation, de contenu et de droits restent actives.

Le scénario d’onglets a été étendu : suppression d’un parent avec son sous-onglet, restauration complète de la version précédente, couper-coller conservant l’identité entre onglets, second collage renouvelant l’identité, et mode concentration. La migration `0011` ajoute uniquement l’index documentaire utilisé pour le comptage des trous.

Le premier build development (`6ad24a601e95678f67cb390b`) a atteint une limite de connexion Neon lors des contrôles synthétiques et n’a pas été publié. La recette attend désormais `Retry-After` avant un nouvel essai, avec un maximum de deux attentes et sans modification des limites, faux changement d’adresse IP ou suppression des compteurs. La production n’a pas été modifiée par cet essai.

## Publication development

Le commit applicatif `082e7ee177b8ae56f6f128526ffeaeeb9701ed1b`, puis le complément de recette `72ecbb4462b1d0720b114bccb699d7e86fadbae7`, ont été poussés et relus sur GitHub. Le déploiement development **`6ad24bef9f64a53846847ac1`** est `ready` : **16 contrôles Auth/Neon réussis**, **12 migrations reconnues**, **19 tables**. Les deux migrations additives ont été appliquées avant la limite de connexion du premier essai, puis reconnues sans réapplication à la relance.

L’inventaire de développement avant/après est identique : 4 identités Neon Auth conservées, aucun utilisateur applicatif ni document de recette restant. Lecture SQL directe de la persistance FSRS, des contenus d’onglets et de leur position de reprise. Les accès anonymes/étrangers, la révocation de session et les conflits restent contrôlés. La réception d’un email dans une boîte personnelle et le consentement Google personnel ne sont pas attestés par ces fixtures.

La recette HTTPS `6ad24c51e7106d7050bcf207` a révélé un défaut du lecteur d’en-têtes du harnais de tests : `allHeaders()` de Playwright regroupe plusieurs `Set-Cookie` avec des sauts de ligne, ce qui ne peut pas être passé à un nouveau `Headers`. La recette lit désormais uniquement `Retry-After`, sans copier les cookies. Les diagnostics de transport sont filtrés pour ne jamais publier les en-têtes de session. Cette correction ne modifie ni les cookies de l’application ni ses contrôles d’authentification. La recette HTTPS est relancée ; la production attend sa validation.

Aucun achat Stripe ni changement d’abonnement n’est déclenché par cette refonte. Le raccordement du paiement automatique et les autres limites historiques décrites dans [la recette mission 4](validation-mission-4.md) ne deviennent pas opérationnels par un changement graphique.

La sauvegarde refuse aussi qu’un ancien client dépourvu de support des onglets remplace silencieusement un document à onglets par un document plat. La nouvelle interface annonce sa version documentaire côté requête ; elle peut restaurer volontairement une version historique plate, sans contourner les contrôles de propriétaire et de révision. Un test vérifie le refus ancien client, la préservation du contenu, l’isolation et la restauration explicite.
