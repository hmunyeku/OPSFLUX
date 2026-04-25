/**
 * Tests for useDebounce hook.
 */

import { renderHook, act } from "@testing-library/react-native";
import { useDebounce } from "../src/hooks/useDebounce";

jest.useFakeTimers();

describe("useDebounce", () => {
  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update before delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    jest.advanceTimersByTime(100);
    expect(result.current).toBe("a"); // not yet
  });

  it("updates after delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    act(() => {
      jest.advanceTimersByTime(350);
    });
    expect(result.current).toBe("ab");
  });

  it("resets timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    jest.advanceTimersByTime(200);
    rerender({ value: "abc" }); // reset timer
    jest.advanceTimersByTime(200);
    expect(result.current).toBe("a"); // still not "abc" yet

    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current).toBe("abc"); // now it fires
  });
});
