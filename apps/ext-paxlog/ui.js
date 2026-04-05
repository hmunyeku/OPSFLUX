export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function formatDateTime(value, lang) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")
}

export function objectFromFormData(formData) {
  const payload = {}
  for (const [key, value] of formData.entries()) {
    const normalized = value.toString().trim()
    payload[key] = normalized === "" ? null : normalized
  }
  return payload
}

export function focusRequiredAction(button) {
  const contactId = button?.dataset?.contactId
  const actionKind = button?.dataset?.actionKind
  if (!contactId || !actionKind) return

  if (actionKind === "identity") {
    const form = document.querySelector(`.pax-update-form[data-contact-id="${contactId}"]`)
    if (!form) return
    form.scrollIntoView({ behavior: "smooth", block: "center" })
    const fieldName = button.dataset.field
    const targetField = fieldName ? form.querySelector(`[name="${fieldName}"]`) : form.querySelector("input, textarea, select")
    targetField?.focus()
    return
  }

  if (actionKind === "credential") {
    const form = document.querySelector(`.credential-form[data-contact-id="${contactId}"]`)
    if (!form) return
    form.scrollIntoView({ behavior: "smooth", block: "center" })
    const select = form.querySelector('select[name="credential_type_id"]')
    const code = button.dataset.credentialCode
    if (select && code) {
      const option = Array.from(select.options).find((item) => item.textContent?.includes(`(${code})`))
      if (option) select.value = option.value
    }
    select?.focus()
  }
}
