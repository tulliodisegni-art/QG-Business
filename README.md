# QG Business

Logiciel de gestion de tous mes projets et business : tableau de bord, univers et projets, feuille de route, finances, achats, clients, marketing, améliorations des apps et documents.

- Les données sont gardées sur l'appareil (IndexedDB) et, une fois la synchronisation activée (menu ⋯ → Synchronisation), recopiées dans une base Supabase dédiée : mêmes données sur le téléphone et l'ordinateur. Au premier lancement, l'app reprend les données de départ de `web/seed.json`.
- Supabase : coller une fois `supabase/qg_docs.sql` dans SQL Editor. Chaque compte ne voit que ses données (RLS).
- Projets → bouton du haut → Sauvegarde : exporter / restaurer toutes les données dans un fichier.
- « Préparer avec Claude » (onglet Apps) passe par la fonction IA partagée avec les autres apps.

## Installer
Ouvrir le site dans Safari (iPhone) → Partager → « Sur l'écran d'accueil ». Sur Android : Chrome → menu → « Installer l'application ».

## Développement
`src/qg-business.html` est l'appli ; `web/` contient le shim (`shim.js`), le service worker, le manifeste, les icônes et les données de départ.
`python scripts/build.py` construit `_site/`, publié par GitHub Pages à chaque push sur `main`.
