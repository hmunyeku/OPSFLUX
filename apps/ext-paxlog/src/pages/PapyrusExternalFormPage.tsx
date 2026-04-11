import React, { useEffect, useMemo, useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiCheckbox,
  EuiDatePicker,
  EuiDescribedFormGroup,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPageSection,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui'
import moment from 'moment'
import Layout from '../components/Layout'
import { apiRequest, getPapyrusFormIdFromUrl, getTokenFromUrl } from '../lib/api'
import { t } from '../lib/i18n'

type PrimitiveFieldType =
  | 'section'
  | 'input_text'
  | 'textarea'
  | 'input_number'
  | 'input_date'
  | 'input_file'
  | 'input_select'
  | 'input_multiselect'
  | 'input_table'

interface FieldOption {
  label: string
  value: string
}

interface TableColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: FieldOption[]
}

interface FormField {
  id: string
  type: PrimitiveFieldType
  label: string
  required?: boolean
  placeholder?: string
  options?: FieldOption[]
  columns?: TableColumn[]
}

interface ConsumedFormPayload {
  form: {
    id: string
    name: string
    description?: string | null
    schema_json?: Record<string, unknown>
  }
  link: {
    expires_at?: string | null
    max_submissions?: number | null
    submission_count?: number
  }
  prefill?: Record<string, unknown>
  require_identity?: boolean
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''))
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function normalizeFields(schema: Record<string, unknown> | undefined): FormField[] {
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : []
  return rawFields
    .filter((field): field is Record<string, unknown> => !!field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      id: typeof field.id === 'string' ? field.id : `field_${Math.random().toString(36).slice(2, 10)}`,
      type: typeof field.type === 'string' ? field.type as PrimitiveFieldType : 'input_text',
      label: typeof field.label === 'string' ? field.label : 'Field',
      required: Boolean(field.required),
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
      options: Array.isArray(field.options)
        ? field.options.map((option) =>
            typeof option === 'object' && option
              ? {
                  label: String((option as { label?: string }).label ?? (option as { value?: string }).value ?? ''),
                  value: String((option as { value?: string }).value ?? (option as { label?: string }).label ?? ''),
                }
              : { label: String(option), value: String(option) },
          )
        : undefined,
      columns: Array.isArray(field.columns)
        ? field.columns
            .filter((column): column is Record<string, unknown> => !!column && typeof column === 'object' && !Array.isArray(column))
            .map((column) => ({
              key: typeof column.key === 'string' ? column.key : `col_${Math.random().toString(36).slice(2, 8)}`,
              label: typeof column.label === 'string' ? column.label : 'Column',
              type: typeof column.type === 'string' ? column.type as TableColumn['type'] : 'text',
              options: Array.isArray(column.options)
                ? column.options.map((option) =>
                    typeof option === 'object' && option
                      ? {
                          label: String((option as { label?: string }).label ?? (option as { value?: string }).value ?? ''),
                          value: String((option as { value?: string }).value ?? (option as { label?: string }).label ?? ''),
                        }
                      : { label: String(option), value: String(option) },
                  )
                : undefined,
            }))
        : undefined,
    }))
}

function normalizePrefill(prefill: Record<string, unknown> | undefined): Record<string, unknown> {
  return prefill && typeof prefill === 'object' && !Array.isArray(prefill) ? { ...prefill } : {}
}

export default function PapyrusExternalFormPage() {
  const token = useMemo(() => getTokenFromUrl(), [])
  const formId = useMemo(() => getPapyrusFormIdFromUrl(), [])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ConsumedFormPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [respondent, setRespondent] = useState<Record<string, string>>({
    name: '',
    email: '',
    phone: '',
  })

  const fields = useMemo(
    () => normalizeFields(payload?.form?.schema_json as Record<string, unknown> | undefined),
    [payload?.form?.schema_json],
  )

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setErrorMessage(t('papyrus_missing_token'))
      return
    }
    if (!formId) {
      setLoading(false)
      setErrorMessage(t('papyrus_missing_form'))
      return
    }

    ;(async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const data = await apiRequest(
          null,
          `/api/v1/documents/papyrus/ext/forms/${formId}?token=${encodeURIComponent(token)}`,
        ) as ConsumedFormPayload
        setPayload(data)
        setAnswers(normalizePrefill(data.prefill))
      } catch (error) {
        setErrorMessage((error as Error)?.message || t('generic_error'))
      } finally {
        setLoading(false)
      }
    })()
  }, [formId, token])

  const remainingUses = useMemo(() => {
    if (!payload?.link) return '--'
    if (payload.link.max_submissions == null) return t('papyrus_unlimited')
    const used = payload.link.submission_count ?? 0
    return String(Math.max(payload.link.max_submissions - used, 0))
  }, [payload?.link])

  const setFieldValue = (fieldId: string, nextValue: unknown) => {
    setAnswers((current) => ({ ...current, [fieldId]: nextValue }))
  }

  const handleSubmit = async () => {
    if (!token || !formId) return
    setSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      await apiRequest(
        null,
        `/api/v1/documents/papyrus/ext/forms/${formId}/submit?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            respondent: payload?.require_identity ? respondent : null,
            answers,
          }),
        },
      )
      setSubmitted(true)
      setSuccessMessage(t('papyrus_submitted'))
    } catch (error) {
      setErrorMessage((error as Error)?.message || t('generic_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <EuiPageSection
        paddingSize="l"
        style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}
      >
        <EuiFlexGroup direction="column" gutterSize="l">
          <EuiFlexItem grow={false}>
            <EuiPanel hasBorder hasShadow paddingSize="l">
              <EuiFlexGroup gutterSize="xl" responsive>
                <EuiFlexItem grow={2}>
                  <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="document" size="l" color="primary" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="primary">{t('papyrus_title')}</EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="m" />
                  <EuiTitle size="l">
                    <h1>{payload?.form?.name || t('papyrus_title')}</h1>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiText color="subdued">
                    <p>{payload?.form?.description || t('papyrus_intro')}</p>
                  </EuiText>
                  {errorMessage ? (
                    <>
                      <EuiSpacer size="m" />
                      <EuiCallOut title={errorMessage} color="danger" iconType="alert" />
                    </>
                  ) : null}
                  {successMessage ? (
                    <>
                      <EuiSpacer size="m" />
                      <EuiCallOut title={successMessage} color="success" iconType="check" />
                    </>
                  ) : null}
                </EuiFlexItem>

                <EuiFlexItem grow={1}>
                  <EuiPanel color="subdued" paddingSize="m" hasBorder>
                    <EuiTitle size="xxs">
                      <h3>{t('papyrus_section_metadata')}</h3>
                    </EuiTitle>
                    <EuiSpacer size="m" />
                    <EuiText size="s">
                      <p><strong>{t('papyrus_expires_at')}:</strong> {formatDate(payload?.link?.expires_at)}</p>
                      <p><strong>{t('papyrus_remaining_uses')}:</strong> {remainingUses}</p>
                      {submitted ? <p><strong>{t('papyrus_submission_status')}:</strong> {t('papyrus_submitted')}</p> : null}
                    </EuiText>
                    {payload?.prefill && Object.keys(payload.prefill).length > 0 ? (
                      <>
                        <EuiHorizontalRule margin="m" />
                        <EuiTitle size="xxs">
                          <h3>{t('papyrus_prefill')}</h3>
                        </EuiTitle>
                        <EuiSpacer size="s" />
                        <EuiFlexGroup direction="column" gutterSize="s">
                          {Object.entries(payload.prefill).map(([key, value]) => (
                            <EuiFlexItem key={key} grow={false}>
                              <EuiPanel hasBorder paddingSize="s">
                                <EuiText size="xs" color="subdued">
                                  <p>{key}</p>
                                </EuiText>
                                <EuiSpacer size="xs" />
                                <EuiText size="s">
                                  <p><strong>{String(value ?? '--')}</strong></p>
                                </EuiText>
                              </EuiPanel>
                            </EuiFlexItem>
                          ))}
                        </EuiFlexGroup>
                      </>
                    ) : null}
                  </EuiPanel>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiPanel hasBorder hasShadow paddingSize="l">
              {loading ? (
                <EuiFlexGroup alignItems="center" justifyContent="center" gutterSize="m" style={{ minHeight: 240 }}>
                  <EuiFlexItem grow={false}>
                    <EuiLoadingSpinner size="m" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      <p>{t('papyrus_loading')}</p>
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              ) : submitted ? (
                <EuiFlexGroup direction="column" alignItems="center" gutterSize="m" style={{ minHeight: 240, justifyContent: 'center' }}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="checkInCircleFilled" size="xxl" color="success" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiTitle size="s">
                      <h2>{t('papyrus_submitted')}</h2>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued" textAlign="center">
                      <p>{t('papyrus_submitted_hint')}</p>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty onClick={() => { setSubmitted(false); setSuccessMessage(null) }}>
                      {t('papyrus_submit_again')}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              ) : (
                <EuiForm component="form">
                  {payload?.require_identity ? (
                    <>
                      <EuiDescribedFormGroup
                        title={<h3>{t('papyrus_require_identity')}</h3>}
                        description={<p>{t('papyrus_intro')}</p>}
                      >
                        <EuiFlexGroup>
                          <EuiFlexItem>
                            <EuiFormRow label={t('papyrus_respondent_name')}>
                              <EuiFieldText
                                value={respondent.name}
                                onChange={(event) => setRespondent((current) => ({ ...current, name: event.target.value }))}
                              />
                            </EuiFormRow>
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiFormRow label={t('papyrus_respondent_email')}>
                              <EuiFieldText
                                type="email"
                                value={respondent.email}
                                onChange={(event) => setRespondent((current) => ({ ...current, email: event.target.value }))}
                              />
                            </EuiFormRow>
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiFormRow label={t('papyrus_respondent_phone')}>
                              <EuiFieldText
                                value={respondent.phone}
                                onChange={(event) => setRespondent((current) => ({ ...current, phone: event.target.value }))}
                              />
                            </EuiFormRow>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiDescribedFormGroup>
                      <EuiSpacer size="l" />
                    </>
                  ) : null}

                  <EuiTitle size="s">
                    <h2>{t('papyrus_section_answers')}</h2>
                  </EuiTitle>
                  <EuiSpacer size="m" />

                  {fields.length === 0 ? (
                    <EuiCallOut title={t('papyrus_no_fields')} color="warning" iconType="help" />
                  ) : null}

                  {fields.map((field) => {
                    if (field.type === 'section') {
                      return (
                        <React.Fragment key={field.id}>
                          <EuiHorizontalRule margin="l" />
                          <EuiTitle size="xs">
                            <h3>{field.label}</h3>
                          </EuiTitle>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'textarea' || field.type === 'input_file') {
                      return (
                        <React.Fragment key={field.id}>
                          <EuiFormRow
                            label={field.label}
                            helpText={field.type === 'input_file' ? t('papyrus_field_help_file') : undefined}
                            isInvalid={false}
                          >
                            <EuiTextArea
                              value={String(answers[field.id] ?? '')}
                              placeholder={field.placeholder}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              rows={field.type === 'input_file' ? 3 : 5}
                            />
                          </EuiFormRow>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'input_select') {
                      return (
                        <React.Fragment key={field.id}>
                          <EuiFormRow label={field.label}>
                            <EuiSelect
                              value={String(answers[field.id] ?? '')}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                              options={[
                                { value: '', text: '--' },
                                ...((field.options ?? []).map((option) => ({
                                  value: option.value,
                                  text: option.label,
                                }))),
                              ]}
                            />
                          </EuiFormRow>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'input_multiselect') {
                      const current = Array.isArray(answers[field.id]) ? answers[field.id] as string[] : []
                      return (
                        <React.Fragment key={field.id}>
                          <EuiFormRow label={field.label}>
                            <EuiFlexGroup direction="column" gutterSize="s">
                              {(field.options ?? []).map((option) => (
                                <EuiFlexItem key={option.value} grow={false}>
                                  <EuiCheckbox
                                    id={`${field.id}_${option.value}`}
                                    label={option.label}
                                    checked={current.includes(option.value)}
                                    onChange={(event) => {
                                      const next = event.target.checked
                                        ? [...current, option.value]
                                        : current.filter((item) => item !== option.value)
                                      setFieldValue(field.id, next)
                                    }}
                                  />
                                </EuiFlexItem>
                              ))}
                            </EuiFlexGroup>
                          </EuiFormRow>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'input_table') {
                      const rows = Array.isArray(answers[field.id]) ? answers[field.id] as Array<Record<string, unknown>> : []
                      return (
                        <React.Fragment key={field.id}>
                          <EuiPanel hasBorder color="subdued" paddingSize="m">
                            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
                              <EuiFlexItem grow={false}>
                                <EuiTitle size="xs">
                                  <h3>{field.label}</h3>
                                </EuiTitle>
                              </EuiFlexItem>
                              <EuiFlexItem grow={false}>
                                <EuiButton size="s" onClick={() => {
                                  const emptyRow = Object.fromEntries((field.columns ?? []).map((column) => [column.key, '']))
                                  setFieldValue(field.id, [...rows, emptyRow])
                                }}>
                                  {t('papyrus_add_row')}
                                </EuiButton>
                              </EuiFlexItem>
                            </EuiFlexGroup>
                            <EuiSpacer size="m" />
                            <EuiFlexGroup direction="column" gutterSize="m">
                              {rows.map((row, rowIndex) => (
                                <EuiFlexItem key={`${field.id}_${rowIndex}`} grow={false}>
                                  <EuiPanel hasBorder paddingSize="m">
                                    <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
                                      <EuiFlexItem grow={false}>
                                        <EuiText size="s">
                                          <strong>{interpolate(t('papyrus_row'), { index: rowIndex + 1 })}</strong>
                                        </EuiText>
                                      </EuiFlexItem>
                                      <EuiFlexItem grow={false}>
                                        <EuiButtonIcon
                                          aria-label={t('papyrus_delete_row')}
                                          iconType="trash"
                                          color="danger"
                                          onClick={() => setFieldValue(field.id, rows.filter((_, index) => index !== rowIndex))}
                                        />
                                      </EuiFlexItem>
                                    </EuiFlexGroup>
                                    <EuiSpacer size="m" />
                                    <EuiFlexGroup wrap>
                                      {(field.columns ?? []).map((column) => {
                                        const cellValue = row?.[column.key]
                                        if (column.type === 'select') {
                                          return (
                                            <EuiFlexItem key={column.key} style={{ minWidth: 220 }}>
                                              <EuiFormRow label={column.label}>
                                                <EuiSelect
                                                  value={String(cellValue ?? '')}
                                                  onChange={(event) => {
                                                    const nextRows = [...rows]
                                                    nextRows[rowIndex] = { ...nextRows[rowIndex], [column.key]: event.target.value }
                                                    setFieldValue(field.id, nextRows)
                                                  }}
                                                  options={[
                                                    { value: '', text: '--' },
                                                    ...((column.options ?? []).map((option) => ({
                                                      value: option.value,
                                                      text: option.label,
                                                    }))),
                                                  ]}
                                                />
                                              </EuiFormRow>
                                            </EuiFlexItem>
                                          )
                                        }
                                        if (column.type === 'date') {
                                          return (
                                            <EuiFlexItem key={column.key} style={{ minWidth: 220 }}>
                                              <EuiFormRow label={column.label}>
                                                <EuiDatePicker
                                                  selected={cellValue ? moment(String(cellValue)) : null}
                                                  onChange={(nextMoment) => {
                                                    const nextRows = [...rows]
                                                    nextRows[rowIndex] = {
                                                      ...nextRows[rowIndex],
                                                      [column.key]: nextMoment ? nextMoment.format('YYYY-MM-DD') : '',
                                                    }
                                                    setFieldValue(field.id, nextRows)
                                                  }}
                                                  dateFormat="YYYY-MM-DD"
                                                />
                                              </EuiFormRow>
                                            </EuiFlexItem>
                                          )
                                        }
                                        if (column.type === 'number') {
                                          return (
                                            <EuiFlexItem key={column.key} style={{ minWidth: 220 }}>
                                              <EuiFormRow label={column.label}>
                                                <EuiFieldNumber
                                                  value={cellValue == null ? '' : String(cellValue)}
                                                  onChange={(event) => {
                                                    const nextRows = [...rows]
                                                    nextRows[rowIndex] = { ...nextRows[rowIndex], [column.key]: event.target.value }
                                                    setFieldValue(field.id, nextRows)
                                                  }}
                                                />
                                              </EuiFormRow>
                                            </EuiFlexItem>
                                          )
                                        }
                                        return (
                                          <EuiFlexItem key={column.key} style={{ minWidth: 220 }}>
                                            <EuiFormRow label={column.label}>
                                              <EuiFieldText
                                                value={String(cellValue ?? '')}
                                                onChange={(event) => {
                                                  const nextRows = [...rows]
                                                  nextRows[rowIndex] = { ...nextRows[rowIndex], [column.key]: event.target.value }
                                                  setFieldValue(field.id, nextRows)
                                                }}
                                              />
                                            </EuiFormRow>
                                          </EuiFlexItem>
                                        )
                                      })}
                                    </EuiFlexGroup>
                                  </EuiPanel>
                                </EuiFlexItem>
                              ))}
                            </EuiFlexGroup>
                          </EuiPanel>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'input_date') {
                      return (
                        <React.Fragment key={field.id}>
                          <EuiFormRow label={field.label}>
                            <EuiDatePicker
                              selected={answers[field.id] ? moment(String(answers[field.id])) : null}
                              onChange={(nextMoment) => setFieldValue(field.id, nextMoment ? nextMoment.format('YYYY-MM-DD') : '')}
                              dateFormat="YYYY-MM-DD"
                            />
                          </EuiFormRow>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    if (field.type === 'input_number') {
                      return (
                        <React.Fragment key={field.id}>
                          <EuiFormRow label={field.label}>
                            <EuiFieldNumber
                              value={answers[field.id] == null ? '' : String(answers[field.id])}
                              placeholder={field.placeholder}
                              onChange={(event) => setFieldValue(field.id, event.target.value)}
                            />
                          </EuiFormRow>
                          <EuiSpacer size="m" />
                        </React.Fragment>
                      )
                    }

                    return (
                      <React.Fragment key={field.id}>
                        <EuiFormRow label={field.label}>
                          <EuiFieldText
                            value={String(answers[field.id] ?? '')}
                            placeholder={field.placeholder}
                            onChange={(event) => setFieldValue(field.id, event.target.value)}
                          />
                        </EuiFormRow>
                        <EuiSpacer size="m" />
                      </React.Fragment>
                    )
                  })}

                  <EuiSpacer size="l" />
                  <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiButton fill isLoading={submitting} onClick={handleSubmit}>
                        {submitting ? t('papyrus_submitting') : t('papyrus_submit')}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiForm>
              )}
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageSection>
    </Layout>
  )
}
