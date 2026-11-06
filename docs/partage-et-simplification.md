# Partage, assistant et typographie

Le bouton Partager propose une version figée (par défaut) ou toujours à jour. Chaque lien est une capacité aléatoire de 256 bits, accessible sans compte. Le propriétaire peut copier le lien ou le révoquer. Révoquer supprime immédiatement son accès API ; la page ouverte revalide son accès toutes les quinze secondes. Un contenu déjà consulté ne peut évidemment pas être effacé de l’appareil du lecteur.

Les pages partagées rendent tous les onglets avec le moteur documentaire existant. Révéler les passages et consulter les indices reste local ; aucune évaluation ni modification du document source n’est autorisée. Les images passent par une route qui vérifie le lien, la présence de l’image dans cette version et son propriétaire. La page de partage est exclue de l’indexation et n’envoie pas son URL en référent.

La copie nécessite une session et respecte les quotas documents, passages et fichiers. Les passages reçoivent de nouveaux UUID, et les fichiers sont dupliqués dans l’espace du destinataire. Une reprise de la même demande retrouve la copie déjà créée. L’intention de copie est conservée pendant la connexion et la confirmation email ; elle ouvre ensuite l’éditeur. La migration 0013 ajoute deux tables sans réécrire les documents, versions ou annotations.

L’assistant affiche trois actions. Il choisit la quantité de trous ; un plafond technique de 200 propositions et un budget maximal de 10 000 tokens protègent le service. L’interface ne demande plus de quantité, priorité ou difficulté avant génération. La rédaction peut démarrer d’une simple consigne ; la continuation utilise le contexte lorsque l’utilisateur l’active. Les réglages des propositions restent disponibles après génération.

Les nouveaux documents commencent à 11 pt. Les tailles explicites déjà enregistrées restent inchangées. Les paragraphes ordinaires ont un espacement nul avant et après dans l’éditeur, la révision, les pages partagées et le DOCX. Les styles des titres et listes conservent leurs espacements propres. Les paragraphes vides insérés volontairement restent présents.
