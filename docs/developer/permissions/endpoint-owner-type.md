# 25 Owner Type Endpoint Permission Matrix

Date: 2026-04-03

## 1. Objet

Cette matrice lie:

- `owner_type`
- endpoints polymorphes
- permissions minimales attendues

## 2. Principe

Les endpoints polymorphes ne décident jamais seuls.
Ils héritent du parent.

## 3. Matrice cible

### `ads`

- attachments:
  - lire: `paxlog.ads.read`
  - écrire: `paxlog.ads.update`
- notes:
  - lire: `paxlog.ads.read`
  - écrire: `paxlog.ads.update`
- tags:
  - lire: `paxlog.ads.read`
  - écrire: `paxlog.ads.update`
- imputations:
  - lire: `paxlog.ads.read`
  - écrire: `paxlog.ads.update`

### `avm`

- attachments:
  - lire: `paxlog.avm.read`
  - écrire: `paxlog.avm.update`
- notes:
  - lire: `paxlog.avm.read`
  - écrire: `paxlog.avm.update`
- tags:
  - lire: `paxlog.avm.read`
  - écrire: `paxlog.avm.update`

### `voyage`

- attachments:
  - lire: `travelwiz.voyage.read`
  - écrire: `travelwiz.voyage.update`
- notes:
  - lire: `travelwiz.voyage.read`
  - écrire: `travelwiz.voyage.update`
- tags:
  - lire: `travelwiz.voyage.read`
  - écrire: `travelwiz.voyage.update`
- imputations:
  - lire: `travelwiz.voyage.read`
  - écrire: `travelwiz.voyage.update`

### `cargo_item`

- attachments:
  - lire: `travelwiz.cargo.read`
  - écrire: `travelwiz.cargo.update`
- notes:
  - lire: `travelwiz.cargo.read`
  - écrire: `travelwiz.cargo.update`
- imputations:
  - lire: `travelwiz.cargo.read`
  - écrire: `travelwiz.cargo.update`

### `project`

- attachments:
  - lire: `project.read`
  - écrire: `project.update`
- notes:
  - lire: `project.read`
  - écrire: `project.update`
- tags:
  - lire: `project.read`
  - écrire: `project.update`

### `document`

- attachments:
  - lire: `document.read`
  - écrire: `document.update`
- notes:
  - lire: `document.read`
  - écrire: `document.update`
- tags:
  - lire: `document.read`
  - écrire: `document.update`

### `tier` / `tier_contact`

- attachments:
  - lire: `tier.read`
  - écrire: `tier.update`
- notes:
  - lire: `tier.read`
  - écrire: `tier.update`
- tags:
  - lire: `tier.read`
  - écrire: `tier.update`

### `user`

- attachments:
  - lire: `user.read` ou self-scope
  - écrire: `user.update` ou self-scope
- notes:
  - lire: `user.read`
  - écrire: `user.update`

## 4. Règle de mise en oeuvre

Il faut une résolution centralisée:

- `resolve_parent_read_permission(owner_type)`
- `resolve_parent_write_permission(owner_type)`

Pas de mapping redéfini route par route.
