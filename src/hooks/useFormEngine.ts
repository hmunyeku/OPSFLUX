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
import type {
  ConditionRule,
  FieldDefinition,
  FormDefinition,
  StepDefinition,
} from "../types/forms";
import { mutateWithOfflineQueue } from "../services/offline";
import { api } from "../services/api";

interface FormEngineState {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  currentStep: number;
  submitting: boolean;
  submitted: boolean;
  submitError: string | null;
  queuedOffline: boolean;
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

  // ── Value Setters ────────────────────────────────────────────────

  const setValue = useCallback((fieldName: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [fieldName]: value },
      errors: { ...prev.errors, [fieldName]: "" },
    }));
  }, []);

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

    // Build payload — only visible, non-null fields
    const payload: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(state.values)) {
      if (!isFieldVisible(name)) continue;
      if (value === null || value === undefined || value === "") continue;
      payload[name] = value;
    }

    setState((prev) => ({ ...prev, submitting: true, submitError: null }));

    try {
      const result = await mutateWithOfflineQueue(
        form.submit.method,
        form.submit.endpoint,
        payload
      );

      setState((prev) => ({
        ...prev,
        submitting: false,
        submitted: true,
        queuedOffline: !result.sent,
      }));
      return true;
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || "Erreur lors de la soumission.";
      setState((prev) => ({
        ...prev,
        submitting: false,
        submitError: detail,
      }));
      return false;
    }
  }, [state.values, form.submit, isFieldVisible, validateCurrentStep]);

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
