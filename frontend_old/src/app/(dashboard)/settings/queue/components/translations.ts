/**
 * i18n translations for Scheduled Tasks
 */

export const translations = {
  // Dialog/Drawer titles
  createTask: "Créer une tâche planifiée",
  editTask: "Modifier la tâche planifiée",
  createTaskDescription: "Créez une nouvelle tâche planifiée avec scheduling cron ou interval",
  editTaskDescription: "Modifiez la configuration de la tâche planifiée",

  // Form labels
  taskName: "Nom de la tâche",
  taskNamePlaceholder: "ma-tache-planifiee",
  taskNameHelper: "Identifiant unique pour cette tâche",

  celeryTask: "Tâche Celery",
  celeryTaskPlaceholder: "app.tasks.my_task",
  celeryTaskHelper: "Chemin Python de la tâche",

  description: "Description",
  descriptionPlaceholder: "Que fait cette tâche ?",

  queue: "Queue",
  queueDefault: "Par défaut (celery)",
  queueHigh: "Haute priorité",
  queueLow: "Basse priorité",
  queueEmails: "Emails",
  queueReports: "Rapports",

  active: "Active (activée)",

  scheduleType: "Type de planification",
  cronExpression: "Expression Cron",
  interval: "Intervalle",

  // Cron editor
  preset: "Modèle prédéfini",
  everyMinute: "Chaque minute",
  hourly: "Toutes les heures",
  daily: "Quotidien",
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
  custom: "Personnalisé",

  minute: "Minute (0-59)",
  hour: "Heure (0-23)",
  dayOfMonth: "Jour du mois (1-31)",
  month: "Mois (1-12)",
  dayOfWeek: "Jour de la semaine (0-6)",

  cronLabel: "Cron:",
  runsLabel: "Exécution:",
  cronTip: "Astuce: Utilisez * pour \"tous\", des plages comme 1-5, des listes comme 1,3,5, ou */5 pour \"tous les 5\"",

  // Interval
  intervalValue: "Valeur de l'intervalle",
  intervalUnit: "Unité",
  seconds: "Secondes",
  minutes: "Minutes",
  hours: "Heures",
  days: "Jours",
  intervalHelper: "La tâche sera exécutée tous les",

  // Arguments
  args: "Arguments (tableau JSON)",
  argsPlaceholder: '["arg1", "arg2"]',
  kwargs: "Arguments nommés (objet JSON)",
  kwargsPlaceholder: '{"key": "value"}',

  // Buttons
  cancel: "Annuler",
  createButton: "Créer la tâche",
  updateButton: "Mettre à jour la tâche",
  saving: "Sauvegarde...",

  // Actions
  edit: "Éditer",
  pause: "Mettre en pause",
  resume: "Reprendre",
  runNow: "Exécuter maintenant",
  delete: "Supprimer",

  // Status
  statusActive: "Actif",
  statusPaused: "En pause",
  statusInactive: "Inactif",

  // Messages
  taskCreated: "Tâche créée avec succès",
  taskUpdated: "Tâche mise à jour avec succès",
  taskDeleted: "La tâche a été supprimée",
  taskPaused: "est en pause",
  taskResumed: "est active",
  taskLaunched: "a été lancée avec l'ID",

  invalidJsonArgs: "JSON invalide dans le champ Args",
  invalidJsonKwargs: "JSON invalide dans le champ Kwargs",
  failedToSave: "Impossible de sauvegarder la tâche",
  failedToDelete: "Impossible de supprimer la tâche",
  failedToPause: "Impossible de mettre en pause la tâche",
  failedToResume: "Impossible de reprendre la tâche",
  failedToRun: "Impossible de lancer la tâche",

  error: "Erreur",
  success: "Succès",

  // Delete dialog
  deleteTitle: "Supprimer la tâche planifiée",
  deleteDescription: "Êtes-vous sûr de vouloir supprimer la tâche",
  deleteWarning: "? Cette action est irréversible et la tâche ne sera plus exécutée.",

  // List
  noTasks: "Aucune tâche planifiée",
  noTasksDescription: "Créez votre première tâche planifiée pour automatiser des processus récurrents.",
  createFirst: "Créer une tâche",
  loadingTasks: "Chargement des tâches...",

  neverExecuted: "Jamais exécuté",
  executions: "exécution",
  executionsPlural: "exécutions",

  // Headers
  scheduledTasks: "Tâches Planifiées (Beat)",
  scheduledTasksDescription: "Tâches exécutées automatiquement selon un calendrier",
  create: "Créer",
};

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey): string {
  return translations[key] || key;
}
