import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportPdfMenu } from '@/components/shared/ExportPdfMenu'

// Mock react-i18next so t() returns the key as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock the Toast hook — the real one requires a ToastProvider ancestor.
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Mock downloadPdf — the test in question doesn't exercise it,
// and the real one tries to fetch with auth headers.
vi.mock('@/lib/downloadPdf', () => ({
  downloadPdf: vi.fn(),
}))

describe('ExportPdfMenu', () => {
  const baseItem = {
    key: 'matrix',
    label: 'Matrix Roles × Permissions',
    description: 'Full matrix of roles and permissions',
    buildUrl: ({ lang, includeDisabledModules }: any) =>
      `/api/v1/rbac/exports/matrix/role-permissions.pdf?lang=${lang}&include_disabled_modules=${includeDisabledModules}`,
  }

  it('renders the export button when hasPermission is true (default)', () => {
    render(<ExportPdfMenu items={[baseItem]} context="roles" />)
    expect(screen.getByRole('button', { name: /rbac\.export\.button/i })).toBeInTheDocument()
  })

  it('hides itself when hasPermission is false', () => {
    const { container } = render(<ExportPdfMenu items={[baseItem]} context="roles" hasPermission={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens dropdown on click and lists items', () => {
    render(<ExportPdfMenu items={[baseItem]} context="roles" />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    expect(screen.getByText('Matrix Roles × Permissions')).toBeInTheDocument()
  })

  it('disables items that require selection when nothing is selected', () => {
    const item = { ...baseItem, requiresSelection: true }
    render(<ExportPdfMenu items={[item]} context="roles" selectedIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    const itemBtn = screen.getByText('Matrix Roles × Permissions').closest('button')
    expect(itemBtn).toBeDisabled()
  })

  it('builds the URL with current lang and includeDisabledModules state', () => {
    // We can verify buildUrl is called with right args by spying
    const spy = vi.fn(() => '/dummy.pdf')
    const item = { ...baseItem, buildUrl: spy }

    // We can't trigger window.location.href in JSDOM cleanly, so mock it
    const mockLocation = { ...window.location, href: '' }
    vi.stubGlobal('location', mockLocation)

    render(<ExportPdfMenu items={[item]} context="roles" defaultLang="en" defaultIncludeDisabledModules={true} />)
    fireEvent.click(screen.getByRole('button', { name: /rbac\.export\.button/i }))
    fireEvent.click(screen.getByText('Matrix Roles × Permissions'))

    expect(spy).toHaveBeenCalledWith({ lang: 'en', includeDisabledModules: true, selectedIds: [] })

    vi.unstubAllGlobals()
  })
})
