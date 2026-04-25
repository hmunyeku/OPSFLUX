/**
 * PrivacyPage -- Politique de confidentialité OpsFlux.
 *
 * Static legal page rendered in French. DPO contact info is read
 * from entity settings when available, with a sensible fallback.
 */
import { Shield, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { useScopedSettingsMap } from '@/hooks/useSettings'

// ── Helpers ─────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function Paragraph({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-sm leading-relaxed text-muted-foreground', className)}>{children}</p>
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm leading-relaxed text-muted-foreground">{item}</li>
      ))}
    </ul>
  )
}

// ── Main component ──────────────────────────────────────────────

export default function PrivacyPage() {
  const { t } = useTranslation()
  const { data: settingsMap } = useScopedSettingsMap('entity')

  const s = settingsMap ?? {}
  const dpoName = String(s['gdpr.dpo_name'] ?? 'Le Délégué à la Protection des Données (DPO)')
  const dpoEmail = String(s['gdpr.dpo_email'] ?? 'dpo@entreprise.com')
  const entityName = String(s['core.entity_name'] ?? 'ACME Energy')

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={Shield} title={t('legal.politique_de_confidentialite')} subtitle="Protection des donnees personnelles" />

      <PanelContent className="bg-background">
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">

          {/* ── 1. Introduction ──────────────────────────────────── */}
          <Section id="introduction" title="1. Introduction">
            <Paragraph>
              La présente politique de confidentialité décrit la manière dont OpsFlux, plateforme ERP
              industrielle déployée par {entityName}, collecte, utilise, conserve et protège les données
              personnelles de ses utilisateurs dans le cadre de la gestion des opérations pétrolières
              et gazières au Cameroun.
            </Paragraph>
            <Paragraph>
              Le responsable du traitement des données est {entityName}, représentée par sa Direction
              Générale. Le traitement est effectué conformément à la réglementation applicable en matière
              de protection des données personnelles, notamment la loi camerounaise n. 2024/012 du
              19 juillet 2024 relative à la protection des données à caractère personnel.
            </Paragraph>
          </Section>

          {/* ── 2. Données collectées ────────────────────────────── */}
          <Section id="donnees-collectees" title="2. Données collectées">
            <Paragraph>
              Dans le cadre de son fonctionnement, OpsFlux collecte et traite les catégories de données
              personnelles suivantes :
            </Paragraph>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Données d'identité</h3>
                <BulletList items={[
                  'Nom, prénom(s), date et lieu de naissance, nationalité',
                  'Numéro de passeport, carte d\'identité, permis de travail',
                  'Photographie d\'identité',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_rh_et_contractuelles')}</h3>
                <BulletList items={[
                  'Poste, département, site d\'affectation, matricule',
                  'Dates de contrat, type de contrat, employeur (direct ou sous-traitant)',
                  'Coordonnées professionnelles (email, téléphone)',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_de_deplacement_paxlog_travelwiz')}</h3>
                <BulletList items={[
                  'Manifestes passagers (hélicoptère, bateau, véhicule)',
                  'Réservations de vol, itinéraires, dates de rotation',
                  'Points d\'embarquement et de débarquement',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_de_sante_et_securite')}</h3>
                <BulletList items={[
                  'Aptitude médicale (date de validité, sans détail médical)',
                  'Certificats de formation sécurité (BOSIET, H2S, etc.)',
                  'Résultats d\'audits de conformité individuelle',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_professionnelles_et_d_activite')}</h3>
                <BulletList items={[
                  'Imputations de temps, feuilles de pointage',
                  'Affectation aux projets, tâches et jalons',
                  'Documents uploadés (rapports, PV, fiches techniques)',
                  'Journaux d\'audit (actions effectuées dans l\'application)',
                ]} />
              </div>
            </div>
          </Section>

          {/* ── 3. Finalites du traitement ───────────────────────── */}
          <Section id="finalites" title={t('legal.3_finalites_du_traitement')}>
            <Paragraph>{t('legal.les_donnees_personnelles_sont_traitees_a')}</Paragraph>
            <BulletList items={[
              'Gestion des opérations : planification des rotations, suivi logistique, gestion de projet, imputations',
              'Conformité réglementaire : vérification des habilitations, aptitudes médicales, permis de travail et certifications obligatoires',
              'Sécurité industrielle : contrôle d\'accès aux sites, traçabilité des déplacements offshore et onshore',
              'Administration du personnel : gestion des contrats, affectations, et suivi des effectifs',
              'Amélioration continue : tableaux de bord, statistiques anonymisées, indicateurs de performance opérationnelle',
              'Sécurité du système d\'information : détection des anomalies, journalisation des accès, prévention des intrusions',
            ]} />
          </Section>

          {/* ── 4. Base legale ───────────────────────────────────── */}
          <Section id="base-legale" title={t('legal.4_base_legale_du_traitement')}>
            <Paragraph>{t('legal.le_traitement_des_donnees_repose_sur_les')}</Paragraph>
            <BulletList items={[
              'Exécution du contrat de travail : les données sont nécessaires à la gestion de la relation de travail entre le salarié et l\'employeur',
              'Intérêt légitime de l\'entreprise : sécurité des personnes et des installations pétrolières, continuité des opérations, conformité aux exigences du secteur extractif',
              'Obligation légale : respect des réglementations camerounaises en matière de droit du travail, de sécurité industrielle et de transport aérien',
              'Consentement : pour les traitements non couverts par les bases précédentes, le consentement explicite de la personne concernée est recueilli préalablement',
            ]} />
          </Section>

          {/* ── 5. Duree de conservation ─────────────────────────── */}
          <Section id="conservation" title={t('legal.5_duree_de_conservation')}>
            <Paragraph>
              Les données personnelles sont conservées pendant la durée strictement nécessaire aux
              finalités pour lesquelles elles ont été collectées :
            </Paragraph>
            <BulletList items={[
              'Données contractuelles : durée du contrat, puis archivage légal selon le droit camerounais du travail (5 ans après la fin du contrat)',
              'Données de déplacement : 3 ans après le dernier mouvement enregistré, sauf obligation réglementaire contraire',
              'Certificats et habilitations : jusqu\'à expiration, puis 1 an d\'archivage',
              'Journaux d\'audit : durée configurable par l\'administrateur système (par défaut 2 ans)',
              'Comptes utilisateurs inactifs : désactivation automatique selon la politique de sécurité définie par l\'administrateur',
            ]} />
            <Paragraph>
              L'administrateur de l'entité peut configurer certaines durées de conservation depuis
              les paramètres du système, dans le respect des minimums légaux applicables.
            </Paragraph>
          </Section>

          {/* ── 6. Droits des personnes ──────────────────────────── */}
          <Section id="droits" title={t('legal.6_droits_des_personnes')}>
            <Paragraph>
              Conformément à la réglementation applicable, toute personne dont les données sont
              traitées dispose des droits suivants :
            </Paragraph>
            <BulletList items={[
              'Droit d\'accès : obtenir la confirmation du traitement de ses données et en recevoir une copie',
              'Droit de rectification : demander la correction de données inexactes ou incomplètes',
              'Droit à l\'effacement : demander la suppression de ses données, sous réserve des obligations légales de conservation',
              'Droit à la portabilité : recevoir ses données dans un format structuré, couramment utilisé et lisible par machine',
              'Droit d\'opposition : s\'opposer au traitement de ses données pour des motifs légitimes',
              'Droit à la limitation du traitement : demander la suspension du traitement dans les cas prévus par la loi',
            ]} />
            <Paragraph>
              Pour exercer ces droits, veuillez contacter le Délégué à la Protection des Données
              aux coordonnées indiquées dans la section "Contact DPO" ci-dessous. Une réponse sera
              apportée dans un délai maximum de 30 jours à compter de la réception de la demande.
            </Paragraph>
          </Section>

          {/* ── 7. Securite des donnees ──────────────────────────── */}
          <Section id="securite" title={t('legal.7_securite_des_donnees')}>
            <Paragraph>
              OpsFlux met en œuvre des mesures techniques et organisationnelles appropriées pour
              garantir la sécurité et la confidentialité des données personnelles :
            </Paragraph>
            <BulletList items={[
              'Chiffrement des données en transit (TLS 1.2+) et au repos (AES-256)',
              'Contrôle d\'accès basé sur les rôles (RBAC) avec principe du moindre privilège',
              'Authentification multi-facteurs (MFA) obligatoire pour les accès administrateurs',
              'Journalisation complète des actions (audit trail) avec horodatage et identification de l\'auteur',
              'Politique de mots de passe robuste configurable par l\'administrateur (longueur, complexité, expiration)',
              'Sessions sécurisées avec expiration automatique et détection des connexions suspectes',
              'Sauvegardes chiffrées régulières avec plan de reprise d\'activité',
              'Hébergement sur infrastructure sécurisée avec accès restreint',
            ]} />
          </Section>

          {/* ── 8. Contact DPO ───────────────────────────────────── */}
          <Section id="contact-dpo" title={t('legal.8_contact_du_delegue_a_la_protection_des')}>
            <Paragraph>
              Pour toute question relative à la présente politique ou pour exercer vos droits,
              vous pouvez contacter :
            </Paragraph>
            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">{dpoName}</p>
              <p className="text-sm text-muted-foreground">{entityName}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail size={14} className="shrink-0" />
                <a href={`mailto:${dpoEmail}`} className="text-primary hover:underline">{dpoEmail}</a>
              </div>
            </div>
            <Paragraph>
              En cas de difficulté dans l'exercice de vos droits, vous pouvez également adresser
              une réclamation auprès de l'autorité compétente en matière de protection des données
              personnelles au Cameroun.
            </Paragraph>
          </Section>

          {/* ── 9. Mise a jour de la politique ───────────────────── */}
          <Section id="mise-a-jour" title={t('legal.9_mise_a_jour_de_la_politique')}>
            <Paragraph>
              La présente politique de confidentialité peut être modifiée à tout moment pour refléter
              les évolutions législatives, réglementaires ou les changements dans les pratiques de
              traitement des données. Les utilisateurs seront informés de toute modification
              substantielle par notification dans l'application.
            </Paragraph>
            <Paragraph>
              La date de dernière mise à jour est indiquée ci-dessous. Il est recommandé de consulter
              régulièrement cette page.
            </Paragraph>
            <p className="text-xs text-muted-foreground/70 pt-2">
              Dernière mise à jour : avril 2026
            </p>
          </Section>

        </div>
      </PanelContent>
    </div>
  )
}
