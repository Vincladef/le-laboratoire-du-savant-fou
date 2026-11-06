# Palette et partage épuré — 6 novembre 2026

L’en-tête ne présente plus le badge « Espace privé » ni l’avatar ouvrant le compte. L’accès à celui-ci reste dans Réglages, y compris sur téléphone.

Dans le document partagé, le bloc « Mes réglages », son explication technique et le bandeau priorité/difficulté sont supprimés. Les filtres et l’icône de redémarrage restent. Après révélation, deux petits menus près de la réponse permettent de régler difficulté et priorité personnelles. Ces réglages restent locaux au visiteur, sans modifier l’auteur. Les menus sont positionnés dans le viewport et suivent le défilement pour éviter les débordements. Le contenu reste non modifiable et les copies après connexion/inscription restent disponibles.

Deux palettes remplacent les anciens sélecteurs natifs seuls : texte et surlignage. Chacune présente 80 teintes prédéfinies, la remise à zéro et une couleur personnalisée. L’ouverture utilise un popover natif au-dessus des conteneurs défilants de la barre d’outils ; la sélection est conservée et le choix s’applique via les commandes Tiptap existantes. Les styles enregistrés et les mécanismes d’annulation restent inchangés.

Vérifications : compilation et TypeScript réussis ; sept parcours IA/partage/révision passent, puis trois parcours ciblés mobile/compte/accessibilité passent, puis trois contrôles supplémentaires après ajustement des menus partagés (partage mobile, palette et accessibilité). Les tests vérifient l’application des couleurs et du surlignage à la sélection, les limites de la palette sur écran 390 px, les menus personnels dans le viewport, leur persistance, les filtres, l’absence de modification des évaluations de l’auteur et la copie après inscription/connexion. Aucune migration ni changement des permissions serveur.
