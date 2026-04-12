/**
 * Tests for the form engine hook — validation, conditions, navigation.
 *
 * These tests validate the core form engine logic without rendering components.
 */

import { renderHook, act } from "@testing-library/react-native";
import { useFormEngine } from "../src/hooks/useFormEngine";
import type { FormDefinition } from "../src/types/forms";

// ── Test Form Definition ─────────────────────��────────────────────────

const testForm: FormDefinition = {
  id: "test_form",
  version: "abc123",
  title: "Test Form",
  description: "A form for testing",
  icon: "file",
  module: "test",
  permission: "test.create",
  submit: { endpoint: "/api/test", method: "post" },
  steps: [
    {
      id: "step1",
      title: "Step 1",
      description: "First step",
      fields: ["name", "email", "age"],
    },
    {
      id: "step2",
      title: "Step 2",
      description: "Second step",
      fields: ["category", "notes"],
    },
    {
      id: "step3",
      title: "Conditional Step",
      description: "Only if VIP",
      fields: ["vip_code"],
      visible_when: { field: "category", op: "eq", value: "vip" },
    },
  ],
  fields: {
    name: {
      type: "text",
      label: "Name",
      required: true,
      order: 0,
      validation: { min_length: 2, max_length: 100 },
    },
    email: {
      type: "email",
      label: "Email",
      required: true,
      order: 1,
      validation: { pattern: "^[^@]+@[^@]+\\.[^@]+$" },
    },
    age: {
      type: "integer",
      label: "Age",
      required: false,
      order: 2,
      validation: { min: 0, max: 150 },
    },
    category: {
      type: "select",
      label: "Category",
      required: true,
      order: 3,
      options: [
        { value: "standard", label: "Standard" },
        { value: "vip", label: "VIP" },
      ],
    },
    notes: {
      type: "textarea",
      label: "Notes",
      required: false,
      order: 4,
      visible_when: { field: "category", op: "is_not_empty" },
    },
    vip_code: {
      type: "text",
      label: "VIP Code",
      required: true,
      order: 5,
    },
  },
};

// ── Tests ──────────────────────────────���───────────────────────��──────

describe("useFormEngine", () => {
  it("initializes with default values and step 0", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    expect(result.current.currentStep).toBe(0);
    expect(result.current.totalSteps).toBe(2); // step3 hidden initially
    expect(result.current.values).toEqual({});
    expect(result.current.submitted).toBe(false);
  });

  it("sets and retrieves field values", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    act(() => {
      result.current.setValue("name", "John");
    });

    expect(result.current.values.name).toBe("John");
  });

  it("validates required fields", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    // Try to go next without filling required fields
    let moved = false;
    act(() => {
      moved = result.current.goNext();
    });

    expect(moved).toBe(false);
    expect(result.current.errors.name).toBeTruthy();
    expect(result.current.errors.email).toBeTruthy();
    expect(result.current.currentStep).toBe(0);
  });

  it("validates min_length", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    act(() => {
      result.current.setValue("name", "A"); // too short, min 2
      result.current.setValue("email", "test@test.com");
    });

    let moved = false;
    act(() => {
      moved = result.current.goNext();
    });

    expect(moved).toBe(false);
    expect(result.current.errors.name).toContain("2");
  });

  it("advances to next step when validation passes", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    act(() => {
      result.current.setValue("name", "John Doe");
      result.current.setValue("email", "john@example.com");
    });

    let moved = false;
    act(() => {
      moved = result.current.goNext();
    });

    expect(moved).toBe(true);
    expect(result.current.currentStep).toBe(1);
  });

  it("goes back to previous step", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    act(() => {
      result.current.setValue("name", "John Doe");
      result.current.setValue("email", "john@example.com");
    });
    act(() => {
      result.current.goNext();
    });
    act(() => {
      result.current.goPrev();
    });

    expect(result.current.currentStep).toBe(0);
  });

  it("evaluates is_not_empty condition", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    // notes field requires category to be non-empty
    expect(result.current.isFieldVisible("notes")).toBe(false);

    act(() => {
      result.current.setValue("category", "standard");
    });

    expect(result.current.isFieldVisible("notes")).toBe(true);
  });

  it("shows conditional step when condition is met", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    // Initially step3 (VIP) is hidden
    expect(result.current.totalSteps).toBe(2);

    act(() => {
      result.current.setValue("category", "vip");
    });

    // Now step3 should be visible
    expect(result.current.totalSteps).toBe(3);
  });

  it("evaluates eq condition correctly", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    const rule = { field: "category", op: "eq" as const, value: "vip" };

    expect(result.current.evaluateCondition(rule)).toBe(false);

    act(() => {
      result.current.setValue("category", "vip");
    });

    expect(result.current.evaluateCondition(rule)).toBe(true);
  });

  it("evaluates is_empty condition correctly", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    const rule = { field: "name", op: "is_empty" as const };

    expect(result.current.evaluateCondition(rule)).toBe(true);

    act(() => {
      result.current.setValue("name", "Test");
    });

    expect(result.current.evaluateCondition(rule)).toBe(false);
  });

  it("resets form to initial state", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    act(() => {
      result.current.setValue("name", "John");
      result.current.setValue("email", "john@test.com");
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.values.name).toBeUndefined();
    expect(result.current.currentStep).toBe(0);
    expect(result.current.submitted).toBe(false);
  });

  it("identifies last step correctly", () => {
    const { result } = renderHook(() => useFormEngine(testForm));

    expect(result.current.isLastStep).toBe(false);

    // Go to step 2 (last visible step)
    act(() => {
      result.current.setValue("name", "John");
      result.current.setValue("email", "john@test.com");
    });
    act(() => {
      result.current.goNext();
    });

    expect(result.current.isLastStep).toBe(true);
  });
});
