/**
 * Form engine hook — manages state for a dynamic form.
 *
 * Handles:
 *  - Current step tracking (wizard navigation)
 *  - Field values + validation
 *  - Conditional visibility evaluation
 *  - Submission (online or offline queue)
 */

import { useCallback, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import { api } from "../services/api";
import { uploadAttachments } from "../services/attachments";
import type {
  ConditionRule,
  FieldDefinition,
  FormDefinition,
  StepDefinition,
} from "../types/forms";
import { mutateWithOfflineQueue } from "../services/offline";

interface FormEngineState {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  currentStep: number;
  submitting: boolean;
  submitted: boolean;
  submitError: string | null;
  queuedOffline: boolean;
  /** Upload progress for attached photos/signatures after submit. */
  uploadProgress: { completed: number; total: number } | null;
  uploadErrors: string[];
}

export function useFormEngine(form: FormDefinition) {
  const [state, setState] = useState<FormEngineState>(() => {
    // Initialize with default values from field definitions
    const values: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(form.fields)) {
      if (field.default !== undefined) {
        values[name] = field.default;
      } else if (field.type === "toggle") {
        values[name] = false;
      } else if (field.type === "tags" || field.type === "multi_lookup" || field.type === "repeater") {
        values[name] = [];
      }
    }
    return {
      values,
      errors: {},
      currentStep: 0,
      submitting: false,
      submitted: false,
      submitError: null,
      queuedOffline: false,
      uploadProgress: null,
      uploadErrors: [],
    };
  });

  // ── Conditional Logic ─────────────────────────────────────────────

  const evaluateCondition = useCallback(
    (rule: ConditionRule | undefined): boolean => {
      if (!rule) return true;
      const fieldValue = state.values[rule.field];

      switch (rule.op) {
        case "eq":
          return fieldValue === rule.value;
        case "neq":
          return fieldValue !== rule.value;
        case "gt":
          return typeof fieldValue === "number" && fieldValue > (rule.value as number);
        case "lt":
          return typeof fieldValue === "number" && fieldValue < (rule.value as number);
        case "gte":
          return typeof fieldValue === "number" && fieldValue >= (rule.value as number);
        case "lte":
          return typeof fieldValue === "number" && fieldValue <= (rule.value as number);
        case "in":
          return Array.isArray(rule.value) && rule.value.includes(fieldValue);
        case "not_in":
          return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
        case "is_empty":
          return (
            fieldValue === null ||
            fieldValue === undefined ||
            fieldValue === "" ||
            (Array.isArray(fieldValue) && fieldValue.length === 0)
          );
        case "is_not_empty":
          return (
            fieldValue !== null &&
            fieldValue !== undefined &&
            fieldValue !== "" &&
            !(Array.isArray(fieldValue) && fieldValue.length === 0)
          );
        case "contains":
          return typeof fieldValue === "string" && fieldValue.includes(rule.value as string);
        default:
          return true;
      }
    },
    [state.values]
  );

  const isFieldVisible = useCallback(
    (fieldName: string): boolean => {
      const field = form.fields[fieldName];
      if (!field) return false;
      return evaluateCondition(field.visible_when);
    },
    [form.fields, evaluateCondition]
  );

  const isFieldRequired = useCallback(
    (fieldName: string): boolean => {
      const field = form.fields[fieldName];
      if (!field) return false;
      if (field.required) return true;
      if (field.required_when) return evaluateCondition(field.required_when);
      return false;
    },
    [form.fields, evaluateCondition]
  );

  // ── Visible Steps ────────────────────────────────────────────────

  const visibleSteps = useMemo(() => {
    return form.steps.filter((step) => evaluateCondition(step.visible_when));
  }, [form.steps, evaluateCondition]);

  const currentStepDef = visibleSteps[state.currentStep] as StepDefinition | undefined;

  const visibleFieldsInStep = useMemo(() => {
    if (!currentStepDef) return [];
    return currentStepDef.fields.filter((fn) => isFieldVisible(fn));
  }, [currentStepDef, isFieldVisible]);

  // ── Computed Fields ──────────────────────────────────────────────

  /**
   * Simple expression evaluator for computed fields.
   * Supports: field references, ternary (a > b ? "X" : "Y"), comparison ops.
   * Falls back to raw formula display on parse error.
   */
  const evaluateComputed = useCallback(
    (formula: string, values: Record<string, unknown>): unknown => {
      try {
        // Replace field references with actual values
        let expr = formula;
        for (const [key, val] of Object.entries(values)) {
          const replacement =
            typeof val === "string" ? `"${val}"` :
            val === null || val === undefined ? "null" :
            String(val);
          expr = expr.replace(new RegExp(`\\b${key}\\b`, "g"), replacement);
        }
        // Safe eval using Function constructor (no access to globals)
        const fn = new Function(`"use strict"; return (${expr});`);
        return fn();
      } catch {
        return formula; // show raw formula on error
      }
    },
    []
  );

  // ── Value Setters ────────────────────────────────────────────────

  const setValue = useCallback((fieldName: string, value: unknown) => {
    setState((prev) => {
      const newValues = { ...prev.values, [fieldName]: value };

      // ── ADS-specific cross-field rules ─────────────────────────────
      //
      // The ADS form has `start_date`, `end_date`, and
      // `is_round_trip_no_overnight` (A/R sans nuitée). Enforce:
      //   - end_date >= start_date (if end < start, snap to start)
      //   - checking A/R sets end_date = start_date
      //   - setting start_date = end_date auto-checks A/R
      // We apply the rules only when the target fields exist in this
      // form definition, so other forms are unaffected.
      const hasStart = "start_date" in form.fields;
      const hasEnd = "end_date" in form.fields;
      const hasRound = "is_round_trip_no_overnight" in form.fields;
      if (hasStart && hasEnd) {
        const start = newValues["start_date"] as string | undefined;
        const end = newValues["end_date"] as string | undefined;
        if (fieldName === "start_date" && end && start && end < start) {
          // Start moved after existing end — snap end to start.
          newValues["end_date"] = start;
        }
        if (fieldName === "end_date" && start && end && end < start) {
          // User picked an end before start — ignore the invalid pick.
          newValues["end_date"] = start;
        }
        if (hasRound && fieldName === "is_round_trip_no_overnight" && value) {
          // Checked A/R → force end = start.
          if (start) newValues["end_date"] = start;
        }
        if (hasRound && (fieldName === "start_date" || fieldName === "end_date")) {
          const s = newValues["start_date"];
          const e = newValues["end_date"];
          if (s && e && s === e) {
            newValues["is_round_trip_no_overnight"] = true;
          } else if (s && e && s !== e) {
            newValues["is_round_trip_no_overnight"] = false;
          }
        }
      }

      // Recompute all computed fields whenever any value changes
      for (const [fn, fd] of Object.entries(form.fields)) {
        if (fd.type === "computed" && fd.formula) {
          newValues[fn] = evaluateComputed(fd.formula, newValues);
        }
      }

      // Auto-populate fields that depend on this one
      for (const [fn, fd] of Object.entries(form.fields)) {
        if (fd.auto_populate_from === fieldName && value) {
          newValues[fn] = value;
        }
      }

      return {
        ...prev,
        values: newValues,
        errors: { ...prev.errors, [fieldName]: "" },
      };
    });
  }, [form.fields, evaluateComputed]);

  // ── Validation ───────────────────────────────────────────────────

  const validateField = useCallback(
    (fieldName: string): string | null => {
      const field = form.fields[fieldName];
      if (!field || !isFieldVisible(fieldName)) return null;

      const value = state.values[fieldName];
      const required = isFieldRequired(fieldName);

      // Required check
      if (required) {
        if (
          value === null ||
          value === undefined ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
        ) {
          return `${field.label} est obligatoire`;
        }
      }

      // Skip further validation if empty and not required
      if (value === null || value === undefined || value === "") return null;

      const v = field.validation;
      if (!v) return null;

      if (typeof value === "string") {
        if (v.min_length && value.length < v.min_length)
          return `Minimum ${v.min_length} caractères`;
        if (v.max_length && value.length > v.max_length)
          return `Maximum ${v.max_length} caractères`;
        if (v.pattern) {
          try {
            if (!new RegExp(v.pattern).test(value))
              return `Format invalide`;
          } catch {
            // ignore bad regex
          }
        }
      }

      if (typeof value === "number") {
        if (v.min !== undefined && value < v.min)
          return `Minimum ${v.min}`;
        if (v.max !== undefined && value > v.max)
          return `Maximum ${v.max}`;
      }

      return null;
    },
    [form.fields, state.values, isFieldVisible, isFieldRequired]
  );

  const validateCurrentStep = useCallback((): boolean => {
    if (!currentStepDef) return true;
    const errors: Record<string, string> = {};
    let valid = true;

    for (const fieldName of currentStepDef.fields) {
      if (!isFieldVisible(fieldName)) continue;
      const error = validateField(fieldName);
      if (error) {
        errors[fieldName] = error;
        valid = false;
      }
    }

    setState((prev) => ({ ...prev, errors: { ...prev.errors, ...errors } }));
    return valid;
  }, [currentStepDef, isFieldVisible, validateField]);

  // ── Step Navigation ──────────────────────────────────────────────

  const canGoNext = state.currentStep < visibleSteps.length - 1;
  const canGoPrev = state.currentStep > 0;
  const isLastStep = state.currentStep === visibleSteps.length - 1;

  const goNext = useCallback(() => {
    if (!validateCurrentStep()) return false;
    if (canGoNext) {
      setState((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }));
      return true;
    }
    return false;
  }, [validateCurrentStep, canGoNext]);

  const goPrev = useCallback(() => {
    if (canGoPrev) {
      setState((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  }, [canGoPrev]);

  // ── Submit ───────────────────────────────────────────────────────

  const submit = useCallback(async (): Promise<boolean> => {
    if (!validateCurrentStep()) return false;

    // Collect attachment fields (photo/signature with attachment_owner_type)
    const attachmentFields: Array<{
      name: string;
      ownerType: string;
      uris: string[];
    }> = [];

    // Build payload — only visible, non-null fields
    // Strip attachment URIs from the payload; they will be uploaded separately
    // via POST /attachments after we have the created resource ID.
    const payload: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(state.values)) {
      if (!isFieldVisible(name)) continue;
      if (value === null || value === undefined || value === "") continue;

      const field = form.fields[name];
      if (
        field &&
        (field.type === "photo" || field.type === "signature") &&
        field.attachment_owner_type
      ) {
        // Collect attachment URIs for post-submit upload
        const uris = Array.isArray(value) ? (value as string[]) : [String(value)];
        attachmentFields.push({
          name,
          ownerType: field.attachment_owner_type,
          uris: uris.filter(Boolean),
        });
        // Send only the count to the server in the main payload
        payload[`${name}_count`] = uris.length;
        continue;
      }

      payload[name] = value;
    }

    setState((prev) => ({
      ...prev,
      submitting: true,
      submitError: null,
      uploadProgress: null,
      uploadErrors: [],
    }));

    let createdResourceId: string | null = null;
    let wasSent = true;

    try {
      // Step 1 — submit the main form.
      //
      // Offline detection: read the store AND also do a live NetInfo
      // fetch so a user who cut internet a split-second before
      // pressing "Submit" doesn't have to wait for a 15s axios
      // timeout. If either signal says offline, we queue immediately.
      const offlineMod = await import("../services/offline");
      const storeOnline = offlineMod.useOfflineStore.getState().isOnline;
      let liveOnline = storeOnline;
      try {
        const NetInfo = (await import("@react-native-community/netinfo"))
          .default;
        const state = await NetInfo.fetch();
        if (state.isConnected === false) liveOnline = false;
        else if (
          state.isConnected === true &&
          state.isInternetReachable === false
        )
          liveOnline = false;
      } catch {
        /* defer to store */
      }
      const isOnline = storeOnline && liveOnline;

      if (isOnline) {
        try {
          // Short-circuit a hung axios request: if we hit 8s with no
          // response on this submission we flip to the offline queue
          // rather than make the user wait 15s before they see any
          // feedback.
          const response = await api.request({
            method: form.submit.method,
            url: form.submit.endpoint,
            data: payload,
            timeout: 8_000,
          });
          createdResourceId = response.data?.id ?? null;
        } catch (httpErr: any) {
          // 4xx = client error, do not queue
          const status = httpErr?.response?.status;
          if (status && status >= 400 && status < 500) throw httpErr;
          // Network/5xx/timeout → fall back to queue. Flip the store
          // offline flag so subsequent reads also short-circuit.
          offlineMod.useOfflineStore.getState().setOnline(false);
          await mutateWithOfflineQueue(
            form.submit.method,
            form.submit.endpoint,
            payload
          );
          wasSent = false;
        }
      } else {
        // Offline: queue the mutation. Photos require the resource ID
        // which we don't have yet — they'll be lost on this path, so
        // the UI warns the user below via \`queuedOffline\`.
        await mutateWithOfflineQueue(
          form.submit.method,
          form.submit.endpoint,
          payload
        );
        wasSent = false;
      }

      // Step 2 — upload attachments if we have an ID
      const totalFiles = attachmentFields.reduce((s, f) => s + f.uris.length, 0);
      const uploadErrors: string[] = [];

      if (createdResourceId && totalFiles > 0) {
        let completed = 0;
        setState((prev) => ({
          ...prev,
          uploadProgress: { completed: 0, total: totalFiles },
        }));

        for (const field of attachmentFields) {
          const results = await uploadAttachments(
            field.uris,
            field.ownerType,
            createdResourceId,
            (done) => {
              setState((prev) => ({
                ...prev,
                uploadProgress: {
                  completed: completed + done,
                  total: totalFiles,
                },
              }));
            }
          );
          completed += field.uris.length;
          for (const r of results) {
            if (!r.success) {
              uploadErrors.push(`${field.name}: ${r.error}`);
            }
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState((prev) => ({
        ...prev,
        submitting: false,
        submitted: true,
        queuedOffline: !wasSent,
        uploadProgress: null,
        uploadErrors,
      }));
      return true;
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const detail =
        err?.response?.data?.detail || "Erreur lors de la soumission.";
      setState((prev) => ({
        ...prev,
        submitting: false,
        submitError: detail,
        uploadProgress: null,
      }));
      return false;
    }
  }, [state.values, form.submit, form.fields, isFieldVisible, validateCurrentStep]);

  // ── Reset ────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(form.fields)) {
      if (field.default !== undefined) values[name] = field.default;
      else if (field.type === "toggle") values[name] = false;
      else if (field.type === "tags" || field.type === "multi_lookup" || field.type === "repeater") values[name] = [];
    }
    setState({
      values,
      errors: {},
      currentStep: 0,
      submitting: false,
      submitted: false,
      submitError: null,
      queuedOffline: false,
      uploadProgress: null,
      uploadErrors: [],
    });
  }, [form.fields]);

  return {
    // State
    values: state.values,
    errors: state.errors,
    currentStep: state.currentStep,
    submitting: state.submitting,
    submitted: state.submitted,
    submitError: state.submitError,
    queuedOffline: state.queuedOffline,
    uploadProgress: state.uploadProgress,
    uploadErrors: state.uploadErrors,

    // Step info
    visibleSteps,
    currentStepDef,
    visibleFieldsInStep,
    canGoNext,
    canGoPrev,
    isLastStep,
    totalSteps: visibleSteps.length,

    // Actions
    setValue,
    goNext,
    goPrev,
    submit,
    reset,

    // Helpers
    isFieldVisible,
    isFieldRequired,
    evaluateCondition,
  };
}
