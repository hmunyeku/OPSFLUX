/**
 * Tests for theme store — dark mode toggling.
 */

import { useThemeStore } from "../src/stores/theme";

// Mock Appearance
jest.mock("react-native/Libraries/Utilities/Appearance", () => ({
  getColorScheme: jest.fn(() => "light"),
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe("useThemeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: "system", isDark: false });
  });

  it("defaults to system mode", () => {
    expect(useThemeStore.getState().mode).toBe("system");
  });

  it("setMode to dark makes isDark true", () => {
    useThemeStore.getState().setMode("dark");

    expect(useThemeStore.getState().mode).toBe("dark");
    expect(useThemeStore.getState().isDark).toBe(true);
  });

  it("setMode to light makes isDark false", () => {
    useThemeStore.getState().setMode("light");

    expect(useThemeStore.getState().mode).toBe("light");
    expect(useThemeStore.getState().isDark).toBe(false);
  });

  it("setMode to system uses Appearance", () => {
    useThemeStore.getState().setMode("system");

    // Mocked Appearance returns "light"
    expect(useThemeStore.getState().isDark).toBe(false);
  });
});
