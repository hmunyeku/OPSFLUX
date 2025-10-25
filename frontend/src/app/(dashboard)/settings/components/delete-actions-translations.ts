/**
 * i18n translations for Delete Actions
 */

export const translations = {
  // Section header
  dangerZone: "Zone dangereuse",
  dangerZoneDescription: "Ces actions sont irréversibles. Assurez-vous de comprendre les conséquences avant de continuer.",

  // Buttons
  deactivateAccount: "Désactiver le compte",
  deleteAccount: "Supprimer le compte",

  // Dialog titles
  deactivateTitle: "Désactiver le compte",
  deleteTitle: "Supprimer le compte",

  // Dialog descriptions
  deactivateConfirm: "Êtes-vous sûr de vouloir désactiver votre compte ?",
  deleteConfirm: "Êtes-vous sûr de vouloir supprimer définitivement votre compte ?",

  deactivateDetails: "Votre compte sera désactivé mais vos données seront conservées. Vous pourrez le réactiver ultérieurement en contactant un administrateur.",
  deleteDetails: "Cette action supprimera définitivement votre compte et toutes les données associées. Cette opération est irréversible.",

  // Form
  emailConfirmLabel: "Confirmez en saisissant votre email :",
  emailPlaceholder: "votre.email@example.com",

  // Alert
  warningTitle: "Attention !",
  warningDescription: "Cette opération ne peut pas être annulée. Assurez-vous de bien comprendre les conséquences.",

  // Action buttons
  deactivateButton: "Désactiver",
  deleteButton: "Supprimer",
  cancel: "Annuler",

  // Toast messages
  accountDeactivated: "Compte désactivé",
  accountDeleted: "Compte supprimé",
  deactivatedDescription: "Votre compte a été désactivé. Vous pouvez le réactiver à tout moment.",
  deletedDescription: "Votre compte a été définitivement supprimé.",
};

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey): string {
  return translations[key] || key;
}
