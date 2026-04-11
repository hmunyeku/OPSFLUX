import React from 'react'
import {
  EuiAvatar,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <EuiHeader position="fixed" theme="default">
        <EuiHeaderSection grow={false}>
          <EuiHeaderSectionItem>
            <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiAvatar name="OpsFlux" size="m" initials="OF" color="#1a1c21" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>OpsFlux</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="primary">Portail externe</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiHeaderSectionItem>
        </EuiHeaderSection>

        <EuiHeaderSection side="right">
          <EuiHeaderSectionItem>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="success">Session sécurisée</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">Assistance dossier</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiHeaderSectionItem>
        </EuiHeaderSection>
      </EuiHeader>

      <div style={{ paddingTop: 64 }}>
        <div style={{ maxWidth: 1480, margin: '0 auto', width: '100%' }}>
          <EuiSpacer size="m" />
          {children}
          <EuiSpacer size="xl" />
        </div>
      </div>
    </div>
  )
}
