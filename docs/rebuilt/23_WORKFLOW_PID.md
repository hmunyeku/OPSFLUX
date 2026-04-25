# 23 Workflow PID

Date: 2026-04-03

## 1. Objet

Cette fiche décrit le workflow `PID/PFD`.

## 2. Nature

- workflow technique
- déjà assez explicitement branché sur le moteur FSM

## 3. États typiques

- `draft`
- `in_review`
- `ifd`
- `afc`
- `as_built`
- `obsolete`

## 4. Transitions principales

### `draft -> in_review`

- soumission revue

### `in_review -> ifd`

- validation intermédiaire

### `ifd -> afc`

- passage à émission / construction

### `afc -> as_built`

- mise à jour finale conforme terrain

### `* -> obsolete`

- remplacement / abandon

## 5. Side effects

- validations techniques
- snapshots de révision
- événements métier

## 6. Valeur de référence

Le module PID peut servir de référence technique de ce que doit être un objet bien piloté par workflow FSM.
