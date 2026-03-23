/**
 * VerifyEmailPage — Public page for email verification links.
 *
 * URL: /verify-email?token=xxx&id=yyy
 * Calls GET /api/v1/contact-emails/verify-callback?token=xxx&id=yyy (no auth required)
 */
import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle, AlertTriangle, Mail } from 'lucide-react'
import axios from 'axios'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const id = params.get('id')

  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('Lien de vérification invalide — paramètres manquants.')
      return
    }

    const verify = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || ''
        // Two systems: contact-emails (with id) and user emails (token only)
        const url = id
          ? `${apiBase}/api/v1/contact-emails/verify-callback`
          : `${apiBase}/api/v1/emails/verify-callback`
        const params = id ? { token, id } : { token }
        const res = await axios.get(url, { params })
        if (res.data?.verified && res.data?.message?.includes('already')) {
          setStatus('already')
        } else {
          setStatus('success')
        }
      } catch (err: any) {
        setStatus('error')
        const detail = err?.response?.data?.detail
        if (typeof detail === 'string') {
          if (detail.includes('expired')) {
            setErrorMsg('Le lien de vérification a expiré. Veuillez demander un nouveau lien depuis votre profil.')
          } else if (detail.includes('Invalid')) {
            setErrorMsg('Le lien de vérification est invalide ou a déjà été utilisé.')
          } else if (detail.includes('not found')) {
            setErrorMsg('Adresse email introuvable.')
          } else {
            setErrorMsg(detail)
          }
        } else {
          setErrorMsg('Une erreur est survenue lors de la vérification.')
        }
      }
    }

    verify()
  }, [token, id])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm text-center">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail size={28} className="text-primary" />
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-2">Vérification d'email</h1>

        {status === 'loading' && (
          <div className="py-8">
            <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Vérification en cours...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8">
            <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-emerald-700 dark:text-emerald-400 mb-2">
              Email vérifié avec succès !
            </p>
            <p className="text-sm text-muted-foreground">
              Votre adresse email a été confirmée. Vous pouvez fermer cette page.
            </p>
          </div>
        )}

        {status === 'already' && (
          <div className="py-8">
            <CheckCircle size={48} className="text-blue-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-blue-700 dark:text-blue-400 mb-2">
              Email déjà vérifié
            </p>
            <p className="text-sm text-muted-foreground">
              Cette adresse email a déjà été vérifiée précédemment.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="py-8">
            <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
              Échec de la vérification
            </p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t">
          <Link to="/login" className="text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  )
}
