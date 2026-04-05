export async function wrapExternalAction({ clearMessage, setLoading, render, setMessage, successMessage }, fn, onError = null) {
  clearMessage()
  setLoading(true)
  render()
  try {
    await fn()
    setMessage(successMessage, "success")
  } catch (error) {
    if (typeof onError === "function") {
      await onError(error)
    }
    setMessage(error.message || successMessage, "error")
  } finally {
    setLoading(false)
    render()
  }
}

export function parseApiErrorDetail(error) {
  if (!error?.message) return null
  try {
    return JSON.parse(error.message)
  } catch {
    return null
  }
}

export async function sendOtpAction(api, token) {
  return api(`/api/v1/pax/external/${token}/otp/send`, { method: "POST" })
}

export async function verifyOtpAction(api, token, code) {
  return api(`/api/v1/pax/external/${token}/otp/verify`, {
    method: "POST",
    body: JSON.stringify({ code }),
  })
}

export async function createPaxAction(api, token, payload) {
  return api(`/api/v1/pax/external/${token}/pax`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updatePaxAction(api, token, contactId, payload) {
  return api(`/api/v1/pax/external/${token}/pax/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function attachExistingPaxAction(api, token, contactId, payload) {
  return api(`/api/v1/pax/external/${token}/pax/${contactId}/attach-existing`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function addCredentialAction(api, token, contactId, payload) {
  return api(`/api/v1/pax/external/${token}/pax/${contactId}/credentials`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function submitExternalAction(api, token) {
  return api(`/api/v1/pax/external/${token}/submit`, { method: "POST" })
}

export async function resubmitExternalAction(api, token, reason) {
  return api(`/api/v1/pax/external/${token}/resubmit`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}

export async function updateTransportPreferencesAction(api, token, payload) {
  return api(`/api/v1/pax/external/${token}/transport-preferences`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function downloadExternalAdsPdfAction(apiDownload, token) {
  return apiDownload(`/api/v1/pax/external/${token}/pdf`)
}
