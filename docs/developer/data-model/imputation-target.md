# 13 Imputation Module Target

Date: 2026-04-03

## 1. Décision

L'imputation est un vrai module.

La couche `cost_imputations` existante reste utile, mais elle ne représente que l'affectation d'imputation sur les objets métier.

Le module `Imputations` doit devenir la couche amont de:

- référentiel
- règles de proposition
- règles comptables fortes

## 2. Deux couches à distinguer

### Couche référentiel

Elle définit:

- les imputations
- leurs types
- leurs OTP
- leurs modèles OTP
- leurs associations
- leur validité temporelle

### Couche affectation

Elle définit:

- l'imputation retenue sur un objet métier
- la répartition éventuelle
- l'override manuel
- l'historique de décision

## 3. Modèle cible

Une imputation doit au minimum exposer:

- `code`
- `nom`
- `type`
- `entity_id`
- `active`
- `effective_from`
- `effective_to`
- `otp_template_id` ou structure OTP équivalente

## 4. OTP

Le module doit permettre:

- import des rubriques OTP
- création de modèles OTP
- réutilisation d'un modèle OTP à la création d'une imputation

## 5. Résolution

Ordre de résolution validé:

1. projet
2. utilisateur explicite
3. groupe
4. BU
5. fallback entité

## 6. Utilisateur et BU

Règle validée:

- un utilisateur appartient à une BU

Cette BU peut fournir une imputation par défaut.

## 7. AdS

Règles validées:

- si l'utilisateur interne demandeur saisit une imputation, elle fait foi
- l'utilisateur externe ne peut jamais la modifier
- chaque valideur peut encore la modifier avant validation

## 8. Règles comptables fortes

Le module doit savoir bloquer des affectations incompatibles.

Exemple:

- pas d'`AdS` sur un `OTP matériel`

## 9. Impact sur la plateforme

Les modules consommateurs ne doivent plus construire eux-mêmes leur logique d'imputation par défaut.

Ils doivent appeler un resolver partagé fourni par le module `Imputations`.

## 10. Étapes suivantes

1. modèle de données des imputations
2. modèle des rubriques OTP
3. modèle des templates OTP
4. règles de compatibilité objet métier / type / OTP
5. UI du module
6. intégration PaxLog
