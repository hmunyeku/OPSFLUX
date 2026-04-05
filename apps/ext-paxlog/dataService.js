export async function loadExternalLinkInfo(api, token) {
  if (!token) return null
  return api(`/api/v1/pax/external/${token}`)
}

export async function loadExternalDossier(api, token) {
  if (!token) return null
  return api(`/api/v1/pax/external/${token}/dossier`)
}

export async function loadExternalCredentialTypes(api, token, sessionToken) {
  if (!token || !sessionToken) return []
  return api(`/api/v1/pax/external/${token}/credential-types`)
}
