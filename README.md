# Maison3D Studio

Application web de conception d'espaces, pensée pour être publiée sur GitHub Pages. Elle fonctionne dans le navigateur et comprend :

- Modèles de départ : maison, appartement, terrain, bâtiment.
- Dimensions paramétrables du terrain et du volume bâti.
- Plan 2D SVG interactif : ajout de pièces, sélection, déplacement, dimensions, duplication et suppression.
- Catalogue de mobilier et d'éléments extérieurs.
- Assistant texte local pour les demandes courantes (« ajoute un salon, deux chambres et une piscine »).
- Aperçu 3D en direct avec Three.js, navigation orbitale, styles, toit optionnel et terrain.
- Export du projet en JSON, du plan en SVG et du rendu 3D en PNG.
- Enregistrement local automatique/restauration du dernier projet.

## Démarrage rapide

1. Créez un dépôt GitHub, par exemple `maison3d-studio`.
2. Importez `index.html`, `styles.css`, `app.js` et ce `README.md` à la racine du dépôt.
3. Dans GitHub, ouvrez **Settings → Pages**.
4. Sous **Build and deployment**, choisissez **Deploy from a branch**, sélectionnez `main` et `/(root)`, puis **Save**.
5. Attendez le déploiement et ouvrez l'adresse GitHub Pages affichée.

Le projet utilise les modules Three.js depuis jsDelivr : une connexion Internet est nécessaire pour charger la bibliothèque 3D. Aucun build ni clé API n'est nécessaire.

## Utilisation

- Réglez les dimensions puis cliquez sur **Appliquer les dimensions**.
- Dans **Structure**, ajoutez des pièces.
- Dans **Aménagement**, choisissez un objet, puis cliquez à l'endroit souhaité dans le plan 2D.
- Sélectionnez une pièce/un meuble pour éditer ses dimensions et sa position dans le panneau de droite.
- Passez en **Vue 3D** pour orbiter avec la souris/le doigt et zoomer avec la molette/le geste de pincement.
- **Enregistrer** garde le dernier projet dans le stockage local du navigateur. **Exporter le projet** crée un JSON que vous pouvez sauvegarder ou réimporter en le sélectionnant dans votre navigateur (le mécanisme d'import est préparé dans le code, voir note ci-dessous).

## Limites importantes

Cette version est une application fonctionnelle de conception et de visualisation, pas un logiciel BIM/CAO professionnel. Les rendus 3D sont calculés localement ; l'assistant texte interprète une liste de commandes courantes et ne repose pas sur un grand modèle d'IA. Les murs, portes, fenêtres et pièces sont des volumes conceptuels. Les plans ne remplacent pas les documents d'un architecte, les calculs structurels, les règles d'urbanisme, les métrés certifiés ni les plans d'exécution.

Pour une véritable IA conversationnelle, il faudra ajouter un serveur sécurisé qui appelle un fournisseur de modèle d'IA. **Ne placez jamais une clé API secrète dans `app.js` ou dans un dépôt GitHub public.**

## Sécurité et données

Les projets sont enregistrés dans le stockage local du navigateur de l'appareil. Exportez régulièrement le JSON pour disposer d'une copie. Les bibliothèques externes sont chargées depuis jsDelivr.
