import { useTranslation } from 'react-i18next'

export function RbacDelegationsTab() {
  const { t } = useTranslation()
  return <div className="p-4 text-slate-500">{t('rbac.delegations.coming_soon')}</div>
}
