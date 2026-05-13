import { useTranslation } from 'react-i18next'

export function RbacSettingsTab() {
  const { t } = useTranslation()
  return <div className="p-4 text-slate-500">{t('rbac.settings.coming_soon')}</div>
}
