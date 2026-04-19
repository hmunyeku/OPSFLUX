/**
 * PrivacyPage -- Politique de confidentialite OpsFlux / Perenco.
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
  const dpoName = String(s['gdpr.dpo_name'] ?? 'Le Delegue a la Protection des Donnees (DPO)')
  const dpoEmail = String(s['gdpr.dpo_email'] ?? 'dpo@entreprise.com')
  const entityName = String(s['core.entity_name'] ?? 'Perenco Cameroun')

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={Shield} title={t('legal.politique_de_confidentialite')} subtitle="Protection des donnees personnelles" />

      <PanelContent className="bg-background">
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">

          {/* ── 1. Introduction ──────────────────────────────────── */}
          <Section id="introduction" title="1. Introduction">
            <Paragraph>
              La presente politique de confidentialite decrit la maniere dont OpsFlux, plateforme ERP
              industrielle deployee par {entityName}, collecte, utilise, conserve et protege les donnees
              personnelles de ses utilisateurs dans le cadre de la gestion des operations petrolieres
              et gazieres au Cameroun.
            </Paragraph>
            <Paragraph>
              Le responsable du traitement des donnees est {entityName}, representee par sa Direction
              Generale. Le traitement est effectue conformement a la reglementation applicable en matiere
              de protection des donnees personnelles, notamment la loi camerounaise n. 2024/012 du
              19 juillet 2024 relative a la protection des donnees a caractere personnel.
            </Paragraph>
          </Section>

          {/* ── 2. Donnees collectees ────────────────────────────── */}
          <Section id="donnees-collectees" title="2. Donnees collectees">
            <Paragraph>
              Dans le cadre de son fonctionnement, OpsFlux collecte et traite les categories de donnees
              personnelles suivantes :
            </Paragraph>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Donnees d'identite</h3>
                <BulletList items={[
                  'Nom, prenom(s), date et lieu de naissance, nationalite',
                  'Numero de passeport, carte d\'identite, permis de travail',
                  'Photographie d\'identite',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_rh_et_contractuelles')}</h3>
                <BulletList items={[
                  'Poste, departement, site d\'affectation, matricule',
                  'Dates de contrat, type de contrat, employeur (direct ou sous-traitant)',
                  'Coordonnees professionnelles (email, telephone)',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_de_deplacement_paxlog_travelwiz')}</h3>
                <BulletList items={[
                  'Manifestes passagers (helicoptere, bateau, vehicule)',
                  'Reservations de vol, itineraires, dates de rotation',
                  'Points d\'embarquement et de debarquement',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_de_sante_et_securite')}</h3>
                <BulletList items={[
                  'Aptitude medicale (date de validite, sans detail medical)',
                  'Certificats de formation securite (BOSIET, H2S, etc.)',
                  'Resultats d\'audits de conformite individuelle',
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('legal.donnees_professionnelles_et_d_activite')}</h3>
                <BulletList items={[
                  'Imputations de temps, feuilles de pointage',
                  'Affectation aux projets, taches et jalons',
                  'Documents uploades (rapports, PV, fiches techniques)',
                  'Journaux d\'audit (actions effectuees dans l\'application)',
                ]} />
              </div>
            </div>
          </Section>

          {/* ── 3. Finalites du traitement ───────────────────────── */}
          <Section id="finalites" title={t('legal.3_finalites_du_traitement')}>
            <Paragraph>{t('legal.les_donnees_personnelles_sont_traitees_a')}</Paragraph>
            <BulletList items={[
              'Gestion des operations : planification des rotations, suivi logistique, gestion de projet, imputations',
              'Conformite reglementaire : verification des habilitations, aptitudes medicales, permis de travail et certifications obligatoires',
              'Securite industrielle : controle d\'acces aux sites, tracabilite des deplacements offshore et onshore',
              'Administration du personnel : gestion des contrats, affectations, et suivi des effectifs',
              'Amelioration continue : tableaux de bord, statistiques anonymisees, indicateurs de performance operationnelle',
              'Securite du systeme d\'information : detection des anomalies, journalisation des acces, prevention des intrusions',
            ]} />
          </Section>

          {/* ── 4. Base legale ───────────────────────────────────── */}
          <Section id="base-legale" title={t('legal.4_base_legale_du_traitement')}>
            <Paragraph>{t('legal.le_traitement_des_donnees_repose_sur_les')}</Paragraph>
            <BulletList items={[
              'Execution du contrat de travail : les donnees sont necessaires a la gestion de la relation de travail entre le salarie et l\'employeur',
              'Interet legitime de l\'entreprise : securite des personnes et des installations petrolieres, continuite des operations, conformite aux exigences du secteur extractif',
              'Obligation legale : respect des reglementations camerounaises en matiere de droit du travail, de securite industrielle et de transport aerien',
              'Consentement : pour les traitements non couverts par les bases precedentes, le consentement explicite de la personne concernee est recueilli prealablement',
            ]} />
          </Section>

          {/* ── 5. Duree de conservation ─────────────────────────── */}
          <Section id="conservation" title={t('legal.5_duree_de_conservation')}>
            <Paragraph>
              Les donnees personnelles sont conservees pendant la duree strictement necessaire aux
              finalites pour lesquelles elles ont ete collectees :
            </Paragraph>
            <BulletList items={[
              'Donnees contractuelles : duree du contrat, puis archivage legal selon le droit camerounais du travail (5 ans apres la fin du contrat)',
              'Donnees de deplacement : 3 ans apres le dernier mouvement enregistre, sauf obligation reglementaire contraire',
              'Certificats et habilitations : jusqu\'a expiration, puis 1 an d\'archivage',
              'Journaux d\'audit : duree configurable par l\'administrateur systeme (par defaut 2 ans)',
              'Comptes utilisateurs inactifs : desactivation automatique selon la politique de securite definie par l\'administrateur',
            ]} />
            <Paragraph>
              L'administrateur de l'entite peut configurer certaines durees de conservation depuis
              les parametres du systeme, dans le respect des minimums legaux applicables.
            </Paragraph>
          </Section>

          {/* ── 6. Droits des personnes ──────────────────────────── */}
          <Section id="droits" title={t('legal.6_droits_des_personnes')}>
            <Paragraph>
              Conformement a la reglementation applicable, toute personne dont les donnees sont
              traitees dispose des droits suivants :
            </Paragraph>
            <BulletList items={[
              'Droit d\'acces : obtenir la confirmation du traitement de ses donnees et en recevoir une copie',
              'Droit de rectification : demander la correction de donnees inexactes ou incompletes',
              'Droit a l\'effacement : demander la suppression de ses donnees, sous reserve des obligations legales de conservation',
              'Droit a la portabilite : recevoir ses donnees dans un format structure, couramment utilise et lisible par machine',
              'Droit d\'opposition : s\'opposer au traitement de ses donnees pour des motifs legitimes',
              'Droit a la limitation du traitement : demander la suspension du traitement dans les cas prevus par la loi',
            ]} />
            <Paragraph>
              Pour exercer ces droits, veuillez contacter le Delegue a la Protection des Donnees
              aux coordonnees indiquees dans la section "Contact DPO" ci-dessous. Une reponse sera
              apportee dans un delai maximum de 30 jours a compter de la reception de la demande.
            </Paragraph>
          </Section>

          {/* ── 7. Securite des donnees ──────────────────────────── */}
          <Section id="securite" title={t('legal.7_securite_des_donnees')}>
            <Paragraph>
              OpsFlux met en oeuvre des mesures techniques et organisationnelles appropriees pour
              garantir la securite et la confidentialite des donnees personnelles :
            </Paragraph>
            <BulletList items={[
              'Chiffrement des donnees en transit (TLS 1.2+) et au repos (AES-256)',
              'Controle d\'acces base sur les roles (RBAC) avec principe du moindre privilege',
              'Authentification multi-facteurs (MFA) obligatoire pour les acces administrateurs',
              'Journalisation complete des actions (audit trail) avec horodatage et identification de l\'auteur',
              'Politique de mots de passe robuste configurable par l\'administrateur (longueur, complexite, expiration)',
              'Sessions securisees avec expiration automatique et detection des connexions suspectes',
              'Sauvegardes chiffrees regulieres avec plan de reprise d\'activite',
              'Hebergement sur infrastructure securisee avec acces restreint',
            ]} />
          </Section>

          {/* ── 8. Contact DPO ───────────────────────────────────── */}
          <Section id="contact-dpo" title={t('legal.8_contact_du_delegue_a_la_protection_des')}>
            <Paragraph>
              Pour toute question relative a la presente politique ou pour exercer vos droits,
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
              En cas de difficulte dans l'exercice de vos droits, vous pouvez egalement adresser
              une reclamation aupres de l'autorite competente en matiere de protection des donnees
              personnelles au Cameroun.
            </Paragraph>
          </Section>

          {/* ── 9. Mise a jour de la politique ───────────────────── */}
          <Section id="mise-a-jour" title={t('legal.9_mise_a_jour_de_la_politique')}>
            <Paragraph>
              La presente politique de confidentialite peut etre modifiee a tout moment pour refleter
              les evolutions legislatives, reglementaires ou les changements dans les pratiques de
              traitement des donnees. Les utilisateurs seront informes de toute modification
              substantielle par notification dans l'application.
            </Paragraph>
            <Paragraph>
              La date de derniere mise a jour est indiquee ci-dessous. Il est recommande de consulter
              regulierement cette page.
            </Paragraph>
            <p className="text-xs text-muted-foreground/70 pt-2">
              Derniere mise a jour : avril 2026
            </p>
          </Section>

        </div>
      </PanelContent>
    </div>
  )
}
