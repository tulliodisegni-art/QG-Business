# QG Business

Logiciel de gestion de tous mes projets et business : tableau de bord, univers et projets, feuille de route, finances, achats, clients, marketing, améliorations des apps et documents.

- Les données restent sur l'appareil (IndexedDB). Au premier lancement, l'app reprend les données de départ de `web/seed.json`.
- Projets → bouton du haut → Sauvegarde : exporter / restaurer toutes les données dans un fichier.
- « Préparer avec Claude » (onglet Apps) passe par la fonction IA partagée avec les autres apps.

## Installer
Ouvrir le site dans Safari (iPhone) → Partager → « Sur l'écran d'accueil ». Sur Android : Chrome → menu → « Installer l'application ».

## Développement
`src/qg-business.html` est l'appli ; `web/` contient le shim (`shim.js`), le service worker, le manifeste, les icônes et les données de départ.
`python scripts/build.py` construit `_site/`, publié par GitHub Pages à chaque push sur `main`.
