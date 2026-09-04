"use client";

import * as React from "react";

export type Density = "comfortable" | "compact";
export type Motion = "system" | "reduced";
export type NumberFormat = "tabular" | "default";

type AppearanceState = {
  density: Density;
  motion: Motion;
  numberFormat: NumberFormat;
};

type AppearanceContextValue = AppearanceState & {
  setDensity: (v: Density) => void;
  setMotion: (v: Motion) => void;
  setNumberFormat: (v: NumberFormat) => void;
};

const STORAGE_KEY = "monarch-appearance";

const defaultState: AppearanceState = {
  density: "comfortable",
  motion: "system",
  numberFormat: "tabular",
};

const AppearanceContext = React.createContext<AppearanceContextValue | null>(
  null,
);

function applyToDom(state: AppearanceState) {
  const root = document.documentElement;
  if (state.density === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }
  if (state.motion === "reduced") {
    root.setAttribute("data-motion", "reduced");
  } else {
    root.removeAttribute("data-motion");
  }
  if (state.numberFormat === "tabular") {
    root.setAttribute("data-numbers", "tabular");
  } else {
    root.removeAttribute("data-numbers");
  }
}

const listeners = new Set<() => void>();

// useSyncExternalStore requires getSnapshot to return a referentially
// stable value when the underlying data hasn't changed — cache against
// the raw string so we don't allocate (and "change") on every read.
let cachedRaw: string | null | undefined;
let cachedState: AppearanceState = defaultState;

function readSnapshot(): AppearanceState {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (raw === cachedRaw) return cachedState;

  cachedRaw = raw;
  try {
    cachedState = raw
      ? { ...defaultState, ...(JSON.parse(raw) as Partial<AppearanceState>) }
      : defaultState;
  } catch {
    cachedState = defaultState;
  }
  return cachedState;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function writeSnapshot(state: AppearanceState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write failures (private mode, quota)
  }
  listeners.forEach((notify) => notify());
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const state = React.useSyncExternalStore(
    subscribe,
    readSnapshot,
    () => defaultState,
  );

  React.useEffect(() => {
    applyToDom(state);
  }, [state]);

  const update = React.useCallback((partial: Partial<AppearanceState>) => {
    writeSnapshot({ ...readSnapshot(), ...partial });
  }, []);

  const value = React.useMemo<AppearanceContextValue>(
    () => ({
      ...state,
      setDensity: (density) => update({ density }),
      setMotion: (motion) => update({ motion }),
      setNumberFormat: (numberFormat) => update({ numberFormat }),
    }),
    [state, update],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = React.useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}

export const APPEARANCE_INIT_SCRIPT = `
(function() {
  try {
    var raw = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var state = raw ? JSON.parse(raw) : {};
    var root = document.documentElement;
    if (state.density === "compact") root.setAttribute("data-density", "compact");
    if (state.motion === "reduced") root.setAttribute("data-motion", "reduced");
    if (!state.numberFormat || state.numberFormat === "tabular") root.setAttribute("data-numbers", "tabular");
  } catch (e) {}
})();
`;
