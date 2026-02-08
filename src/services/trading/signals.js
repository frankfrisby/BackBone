/**
 * SolidJS-inspired Signals for Fine-Grained Reactivity
 *
 * Instead of React's tree reconciliation, signals only update
 * the specific parts of the UI that changed.
 *
 * This provides:
 * - No unnecessary re-renders
 * - Batched updates
 * - Automatic dependency tracking
 */

// Global batch state
let batchDepth = 0;
let pendingEffects = new Set();

/**
 * Start a batch - effects won't run until batch ends
 */
export const batch = (fn) => {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      runPendingEffects();
    }
  }
};

/**
 * Run all pending effects
 */
const runPendingEffects = () => {
  const effects = Array.from(pendingEffects);
  pendingEffects.clear();
  effects.forEach(effect => effect());
};

/**
 * Create a signal (reactive value)
 */
export const createSignal = (initialValue) => {
  let value = initialValue;
  const subscribers = new Set();

  const read = () => {
    // Track dependency if we're inside an effect
    if (currentEffect) {
      subscribers.add(currentEffect);
    }
    return value;
  };

  const write = (newValue) => {
    if (newValue === value) return;
    value = typeof newValue === "function" ? newValue(value) : newValue;

    // Notify subscribers
    subscribers.forEach(effect => {
      if (batchDepth > 0) {
        pendingEffects.add(effect);
      } else {
        effect();
      }
    });
  };

  return [read, write];
};

// Current effect being tracked
let currentEffect = null;

/**
 * Create an effect (runs when dependencies change)
 */
export const createEffect = (fn) => {
  const effect = () => {
    currentEffect = effect;
    try {
      fn();
    } finally {
      currentEffect = null;
    }
  };

  // Run immediately to track dependencies
  effect();

  return effect;
};

/**
 * Create a memo (computed value)
 */
export const createMemo = (fn) => {
  const [value, setValue] = createSignal(undefined);

  createEffect(() => {
    setValue(fn());
  });

  return value;
};

/**
 * Create a store (object with reactive properties)
 */
export const createStore = (initialState) => {
  const signals = {};
  const state = {};

  for (const key of Object.keys(initialState)) {
    const [read, write] = createSignal(initialState[key]);
    signals[key] = { read, write };

    Object.defineProperty(state, key, {
      get: () => read(),
      set: (value) => write(value),
      enumerable: true
    });
  }

  const setState = (updates) => {
    batch(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (signals[key]) {
          signals[key].write(value);
        }
      }
    });
  };

  return [state, setState];
};

/**
 * Hook to use signals in React components
 * This bridges SolidJS-style signals with React
 */
export const useSignal = (initialValue) => {
  const [signal] = React.useState(() => createSignal(initialValue));
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => {
    return createEffect(() => {
      signal[0](); // Track dependency
      forceUpdate();
    });
  }, [signal]);

  return signal;
};

// For use without React import
let React;
try {
  React = await import("react");
} catch {
  React = { useState: () => [null], useReducer: () => [0, () => {}], useEffect: () => {} };
}

export default { createSignal, createEffect, createMemo, createStore, batch };
