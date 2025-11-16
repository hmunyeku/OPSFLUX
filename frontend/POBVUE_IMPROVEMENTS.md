# Améliorations POBVue - Avis de Séjour

## Problèmes identifiés

1. **❌ La sauvegarde ne fonctionne pas** - Le bouton "Créer la demande" (ligne ~1150) fait uniquement `console.log` et ne sauvegarde pas via l'API
2. **❌ Pas de validation des dates** - Date de fin peut être antérieure à la date de début
3. **❌ Pas de validation formations obligatoires** - Les champs peuvent être vides
4. **❌ Pas d'indicateurs visuels** - Les dates expirées ne sont pas en rouge
5. **❌ Pas d'autocomplétion** - Nom, prénom, entreprise sont des inputs basiques
6. **❌ Pas d'auto-remplissage** - Les dernières informations ne sont pas récupérées
7. **❌ Point de ramassage basique** - Pas de carte ni géolocalisation

## Solutions implémentées

### 1. Composants créés

#### `/src/components/pobvue/contact-autocomplete.tsx`
- Autocomplete pour rechercher des contacts depuis la base Tiers
- Affiche nom, prénom, entreprise, fonction
- Affiche la dernière visite
- Auto-remplit les champs avec les dernières informations connues

#### `/src/components/pobvue/location-picker.tsx`
- Sélecteur de point de ramassage avec :
  - Points prédéfinis (Aéroport, Héliport, Quai, Hôtel)
  - Géolocalisation (position actuelle)
  - Saisie d'adresse personnalisée
  - Recherche dans les points

#### `/src/lib/date-validations.ts`
Utilitaires de validation de dates :
- `isEndDateAfterStartDate()` - Vérifie que fin > début
- `isDateExpired()` - Vérifie si une date est expirée
- `isDateExpiringSoon()` - Vérifie si expire dans 30 jours
- `getValidityDateClassName()` - Retourne classe CSS (rouge si expiré, orange si proche)
- `getExpiredDateMessage()` - Message d'erreur personnalisé
- `getMinEndDate()` - Date minimum pour input de fin

## Modifications à appliquer dans stay-requests-content.tsx

### Import des nouveaux composants

```typescript
import { ContactAutocomplete, type Contact } from "@/components/pobvue/contact-autocomplete"
import { LocationPicker, type Location } from "@/components/pobvue/location-picker"
import {
  isEndDateAfterStartDate,
  isDateExpired,
  getValidityDateClassName,
  getExpiredDateMessage,
  formatDateForInput,
  parseDateFromInput,
  getMinEndDate,
} from "@/lib/date-validations"
```

### Modifier le state formData

```typescript
const [formData, setFormData] = useState({
  contact: null as Contact | null, // Remplace lastName, firstName, company
  function: "",
  contactFound: false,
  destinations: [] as string[],
  accommodation: "",
  project: "",
  costCenter: "",
  isFirstStay: false,
  pickupLocation: null as Location | null, // Nouveau champ
})

const [validationErrors, setValidationErrors] = useState({
  dates: "",
  trainings: [] as string[],
  contact: "",
})
```

### Remplacer les champs Nom/Prénom/Entreprise

**Ligne ~772-812 - Remplacer par :**

```typescript
<div className="space-y-4">
  <div className="space-y-2">
    <label className="text-sm font-medium">Contact *</label>
    <ContactAutocomplete
      value={formData.contact}
      onChange={(contact) => {
        setFormData({
          ...formData,
          contact,
          // Auto-fill avec les dernières informations
          ...(contact?.lastProject && { project: contact.lastProject }),
          ...(contact?.lastSite && { destinations: [contact.lastSite] }),
          ...(contact?.lastAccommodation && { accommodation: contact.lastAccommodation }),
        })
        setValidationErrors({ ...validationErrors, contact: "" })
      }}
      placeholder="Rechercher un contact par nom, prénom ou entreprise"
    />
    {validationErrors.contact && (
      <p className="text-xs text-red-600">{validationErrors.contact}</p>
    )}
  </div>

  {formData.contact && (
    <Card className="p-3 bg-muted/50">
      <div className="text-xs space-y-1">
        <div><strong>Nom complet :</strong> {formData.contact.firstName} {formData.contact.lastName}</div>
        <div><strong>Entreprise :</strong> {formData.contact.company}</div>
        {formData.contact.function && <div><strong>Fonction :</strong> {formData.contact.function}</div>}
        {formData.contact.lastVisitDate && (
          <div className="text-muted-foreground mt-2">
            Dernier séjour : {new Date(formData.contact.lastVisitDate).toLocaleDateString("fr-FR")}
          </div>
        )}
      </div>
    </Card>
  )}

  <div className="space-y-2">
    <label className="text-sm font-medium">Fonction *</label>
    <input
      type="text"
      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      value={formData.function}
      onChange={(e) => setFormData({ ...formData, function: e.target.value })}
      placeholder="Fonction / Poste"
    />
  </div>
</div>
```

### Ajouter le sélecteur de point de ramassage

**Après le champ "Hébergement" (~ligne 860), ajouter :**

```typescript
<div className="space-y-2">
  <LocationPicker
    value={formData.pickupLocation}
    onChange={(location) => setFormData({ ...formData, pickupLocation: location })}
    label="Point de ramassage *"
    placeholder="Sélectionner un point de ramassage"
  />
</div>
```

### Ajouter validation des périodes

**Ligne ~900 - Périodes de séjour, modifier les inputs de dates :**

```typescript
{datePeriods.map((period, index) => (
  <div key={period.id} className="space-y-3 p-4 border rounded-lg">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Date de début *</label>
        <input
          type="date"
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={period.startDate ? formatDateForInput(period.startDate) : ""}
          onChange={(e) => {
            const newPeriods = [...datePeriods]
            newPeriods[index].startDate = parseDateFromInput(e.target.value)
            setDatePeriods(newPeriods)
            // Clear error if dates become valid
            if (newPeriods[index].endDate && isEndDateAfterStartDate(newPeriods[index].startDate, newPeriods[index].endDate)) {
              setValidationErrors({ ...validationErrors, dates: "" })
            }
          }}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Date de fin *</label>
        <input
          type="date"
          className={`w-full px-3 py-2 border rounded-md text-sm ${
            !isEndDateAfterStartDate(period.startDate, period.endDate)
              ? "border-red-500 bg-red-50"
              : ""
          }`}
          min={getMinEndDate(period.startDate)}
          value={period.endDate ? formatDateForInput(period.endDate) : ""}
          onChange={(e) => {
            const newPeriods = [...datePeriods]
            newPeriods[index].endDate = parseDateFromInput(e.target.value)
            setDatePeriods(newPeriods)
            // Validate
            if (!isEndDateAfterStartDate(newPeriods[index].startDate, newPeriods[index].endDate)) {
              setValidationErrors({
                ...validationErrors,
                dates: "La date de fin doit être postérieure à la date de début"
              })
            } else {
              setValidationErrors({ ...validationErrors, dates: "" })
            }
          }}
        />
        {!isEndDateAfterStartDate(period.startDate, period.endDate) && (
          <p className="text-xs text-red-600">
            La date de fin doit être après la date de début
          </p>
        )}
      </div>
    </div>
  </div>
))}

{validationErrors.dates && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>{validationErrors.dates}</AlertDescription>
  </Alert>
)}
```

### Ajouter indicateurs visuels pour formations

**Ligne ~1000 - Formations, modifier les inputs de validité :**

```typescript
{trainingDates.map((training, index) => (
  <div key={training.id} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {training.type} {training.mandatory && <span className="text-red-500">*</span>}
      </label>
    </div>
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Date</label>
      <input
        type="date"
        className="w-full px-3 py-2 border rounded-md text-sm"
        value={training.date ? formatDateForInput(training.date) : ""}
        onChange={(e) => {
          const newTrainings = [...trainingDates]
          newTrainings[index].date = parseDateFromInput(e.target.value)
          setTrainingDates(newTrainings)
        }}
      />
    </div>
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Validité</label>
      <input
        type="date"
        className={`w-full px-3 py-2 border rounded-md text-sm ${
          getValidityDateClassName(training.validity)
        }`}
        value={training.validity ? formatDateForInput(training.validity) : ""}
        onChange={(e) => {
          const newTrainings = [...trainingDates]
          newTrainings[index].validity = parseDateFromInput(e.target.value)
          setTrainingDates(newTrainings)
        }}
      />
      {training.validity && (
        <p className={`text-xs ${
          isDateExpired(training.validity) ? "text-red-600 font-medium" : "text-orange-600"
        }`}>
          {getExpiredDateMessage(training.validity)}
        </p>
      )}
    </div>
  </div>
))}
```

### Fonction de validation du formulaire

**Ajouter avant le bouton "Créer la demande" (~ligne 1140) :**

```typescript
const validateForm = (): boolean => {
  const errors = {
    dates: "",
    trainings: [] as string[],
    contact: "",
  }

  // Valider contact
  if (!formData.contact) {
    errors.contact = "Le contact est obligatoire"
  }

  // Valider les périodes
  const invalidPeriods = datePeriods.filter(
    p => !isEndDateAfterStartDate(p.startDate, p.endDate)
  )
  if (invalidPeriods.length > 0) {
    errors.dates = "Toutes les périodes doivent avoir une date de fin postérieure à la date de début"
  }

  // Valider formations obligatoires
  const missingTrainings = trainingDates
    .filter(t => t.mandatory && (!t.date || !t.validity))
    .map(t => t.type)

  if (missingTrainings.length > 0) {
    errors.trainings = missingTrainings.map(
      type => `${type} : date et validité obligatoires`
    )
  }

  // Vérifier dates expirées
  const expiredTrainings = trainingDates
    .filter(t => t.mandatory && t.validity && isDateExpired(t.validity))
    .map(t => t.type)

  if (expiredTrainings.length > 0) {
    errors.trainings.push(
      ...expiredTrainings.map(type => `${type} : validité expirée`)
    )
  }

  setValidationErrors(errors)

  return !errors.contact && !errors.dates && errors.trainings.length === 0
}
```

### Remplacer le onClick du bouton "Créer la demande"

**Ligne ~1150-1158, remplacer par :**

```typescript
<Button
  className="flex-1"
  onClick={async () => {
    // Valider le formulaire
    if (!validateForm()) {
      alert("Veuillez corriger les erreurs avant de continuer")
      return
    }

    try {
      // Préparer les données pour l'API
      const requestData = {
        person_name: `${formData.contact?.firstName} ${formData.contact?.lastName}`,
        company: formData.contact?.company || "",
        function: formData.function,
        site: formData.destinations[0] || "",
        accommodation: formData.accommodation,
        project: formData.project,
        cost_center: formData.costCenter,
        is_first_stay: formData.isFirstStay,
        pickup_location: formData.pickupLocation?.name || "",
        pickup_address: formData.pickupLocation?.address || "",
        start_date: datePeriods[0]?.startDate?.toISOString() || "",
        end_date: datePeriods[0]?.endDate?.toISOString() || "",
        additional_periods: datePeriods.slice(1).map(p => ({
          start_date: p.startDate?.toISOString(),
          end_date: p.endDate?.toISOString(),
        })),
        trainings: trainingDates.map(t => ({
          type: t.type,
          training_date: t.date?.toISOString(),
          validity_date: t.validity?.toISOString(),
          mandatory: t.mandatory,
        })),
        certifications: certifications.map(c => ({
          type: c.type,
          certification_date: c.date?.toISOString(),
          validity_date: c.validity?.toISOString(),
        })),
      }

      console.log("Creating stay request:", requestData)

      // Appeler l'API
      const response = await StayRequestsApi.createStayRequest(requestData)

      console.log("Stay request created:", response)

      // Recharger la liste
      await loadRequests()

      // Fermer le drawer
      setShowNewRequestForm(false)

      // Reset form
      setFormData({
        contact: null,
        function: "",
        contactFound: false,
        destinations: [],
        accommodation: "",
        project: "",
        costCenter: "",
        isFirstStay: false,
        pickupLocation: null,
      })
      setDatePeriods([{ id: "1", startDate: undefined, endDate: undefined }])

      alert("Avis de séjour créé avec succès !")
    } catch (error) {
      console.error("Error creating stay request:", error)
      alert("Erreur lors de la création de l'avis de séjour. Vérifiez les données.")
    }
  }}
>
  Créer la demande
</Button>
```

## Résumé des améliorations

✅ **Autocomplétion contact** - Recherche depuis Tiers avec dernières infos
✅ **Auto-remplissage** - Projet, site, hébergement pré-remplis
✅ **Validation dates** - Date fin > date début avec min attribute
✅ **Indicateurs visuels** - Dates expirées en rouge, proches en orange
✅ **Validations formations** - Vérification formations obligatoires
✅ **Point de ramassage** - Carte avec géolocalisation et points prédéfinis
✅ **Sauvegarde API** - Appel réel à `StayRequestsApi.createStayRequest()`
✅ **Rafraîchissement liste** - Rechargement après création

## Prochaines étapes

1. Vérifier que l'endpoint API backend existe : `POST /api/v1/stay-requests`
2. Ajouter l'endpoint Tiers pour l'autocomplete : `GET /api/v1/tiers/contacts/search?q={query}`
3. Tester les validations
4. Améliorer l'UX avec des toast notifications au lieu d'alert()
