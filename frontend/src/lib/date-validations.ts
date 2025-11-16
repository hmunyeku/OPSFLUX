/**
 * Date Validation Utilities
 * Utilitaires pour valider les dates dans les formulaires POBVue
 */

/**
 * Vérifie si une date de fin est postérieure à une date de début
 */
export function isEndDateAfterStartDate(
  startDate: Date | undefined,
  endDate: Date | undefined
): boolean {
  if (!startDate || !endDate) return true; // Pas d'erreur si l'une des dates manque
  return endDate > startDate;
}

/**
 * Vérifie si une date de validité est expirée
 */
export function isDateExpired(validityDate: Date | undefined): boolean {
  if (!validityDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normaliser à minuit
  return validityDate < today;
}

/**
 * Vérifie si une date de validité expire bientôt (dans les 30 jours)
 */
export function isDateExpiringSoon(validityDate: Date | undefined, daysThreshold: number = 30): boolean {
  if (!validityDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thresholdDate = new Date(today);
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  return validityDate >= today && validityDate <= thresholdDate;
}

/**
 * Obtient la classe CSS pour une date de validité
 */
export function getValidityDateClassName(validityDate: Date | undefined): string {
  if (isDateExpired(validityDate)) {
    return "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100";
  }
  if (isDateExpiringSoon(validityDate)) {
    return "border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-100";
  }
  return "";
}

/**
 * Obtient un message d'erreur pour une date expirée
 */
export function getExpiredDateMessage(validityDate: Date | undefined): string | null {
  if (!validityDate) return null;

  if (isDateExpired(validityDate)) {
    const daysSinceExpiry = Math.floor((new Date().getTime() - validityDate.getTime()) / (1000 * 60 * 60 * 24));
    return `Expiré depuis ${daysSinceExpiry} jour${daysSinceExpiry > 1 ? 's' : ''}`;
  }

  if (isDateExpiringSoon(validityDate)) {
    const daysUntilExpiry = Math.floor((validityDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return `Expire dans ${daysUntilExpiry} jour${daysUntilExpiry > 1 ? 's' : ''}`;
  }

  return null;
}

/**
 * Formate une date pour l'affichage
 */
export function formatDate(date: Date | undefined | string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR");
}

/**
 * Formate une date pour l'input HTML
 */
export function formatDateForInput(date: Date | undefined): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse une date depuis un input HTML
 */
export function parseDateFromInput(dateString: string): Date | undefined {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Définit la date minimum pour un input de date de fin
 */
export function getMinEndDate(startDate: Date | undefined): string {
  if (!startDate) return "";
  const minDate = new Date(startDate);
  minDate.setDate(minDate.getDate() + 1); // La date de fin doit être au moins le jour suivant
  return formatDateForInput(minDate);
}
