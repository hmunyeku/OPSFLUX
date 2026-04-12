/**
 * Tests for the Toast store.
 */

import { useToast } from "../src/components/Toast";

describe("useToast", () => {
  beforeEach(() => {
    useToast.setState({ visible: false, message: "", type: "info", duration: 3000 });
  });

  it("starts hidden", () => {
    expect(useToast.getState().visible).toBe(false);
  });

  it("show() makes it visible with message", () => {
    useToast.getState().show("Hello world", "success");

    const state = useToast.getState();
    expect(state.visible).toBe(true);
    expect(state.message).toBe("Hello world");
    expect(state.type).toBe("success");
  });

  it("show() defaults to info type", () => {
    useToast.getState().show("Info message");
    expect(useToast.getState().type).toBe("info");
  });

  it("hide() makes it invisible", () => {
    useToast.getState().show("Test");
    useToast.getState().hide();
    expect(useToast.getState().visible).toBe(false);
  });

  it("supports custom duration", () => {
    useToast.getState().show("Quick", "warning", 1000);
    expect(useToast.getState().duration).toBe(1000);
  });
});
