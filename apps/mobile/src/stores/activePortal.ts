/**
 * Active portal store — shared between TopBar and PortalHome screen
 * so the portal switcher in the header changes the body content.
 */

import { create } from "zustand";

interface ActivePortalState {
  activePortalId: string | null;
  setActivePortalId: (id: string | null) => void;
}

export const useActivePortal = create<ActivePortalState>((set) => ({
  activePortalId: null,
  setActivePortalId: (id) => set({ activePortalId: id }),
}));
