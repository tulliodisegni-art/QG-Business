# {{NOM}}

{{ACCROCHE}}

Appli créée depuis **QG Business** (OFFICINA Disegni). En ligne : {{URL}}

## Règles pour Claude (à respecter à chaque modification)

- Appli web installable (PWA), tout dans le dossier `site/` : `index.html` (HTML, CSS et JS dans le fichier, sans étape de construction), `manifest.webmanifest`, `sw.js`, `icons/`. Pas de framework à compiler.
- En français, pensée d'abord pour iPhone (390 px de large), puis ordinateur.
- Design : clair, chaleureux et coloré, jamais noir ni sombre par défaut. Cartes arrondies, belle typographie, barre d'onglets flottante en bas de l'écran. Couleur principale : {{COULEUR}}.
- Données : enregistrées sur le téléphone (IndexedDB ou localStorage), avec export et import d'une sauvegarde (fichier JSON). Pas de service payant, pas de clé secrète dans le code.
- À chaque version : augmenter le nom du cache dans `site/sw.js`.

## Cahier des charges

{{BRIEF}}
