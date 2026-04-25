import React from 'react'
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui'

interface SpinnerProps {
  label?: string
  size?: 's' | 'm' | 'l' | 'xl' | 'xxl'
  paddingBlock?: number
}

export default function Spinner({ label, size = 'l', paddingBlock = 0 }: SpinnerProps) {
  return (
    <div style={{ paddingBlock }}>
      <EuiFlexGroup alignItems="center" justifyContent="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size={size} />
        </EuiFlexItem>
        {label ? (
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              <p>{label}</p>
            </EuiText>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
    </div>
  )
}
