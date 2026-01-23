/**
 * Store Sync Hook - Bridges existing useState hooks with the app store
 *
 * This allows gradual migration: App.js keeps useState for now,
 * but syncs to store so child components can subscribe independently.
 *
 * Eventually, components can be fully migrated to use store directly.
 */

import { useEffect, useRef } from "react";
import { getAppStore, STATE_SLICES } from "../services/app-store.js";

/**
 * Sync multiple state values to the app store
 * Call this in App component to bridge useState → store
 *
 * @param {Object} stateMap - Map of slice names to state values
 */
export const useStoreSync = (stateMap) => {
  const store = getAppStore();
  const prevValuesRef = useRef({});

  useEffect(() => {
    // Only sync values that actually changed
    for (const [slice, values] of Object.entries(stateMap)) {
      if (!values) continue;

      const prevValues = prevValuesRef.current[slice];
      let hasChanges = false;

      // Check for changes (shallow comparison)
      if (!prevValues) {
        hasChanges = true;
      } else {
        for (const [key, value] of Object.entries(values)) {
          if (prevValues[key] !== value) {
            hasChanges = true;
            break;
          }
        }
      }

      if (hasChanges) {
        store.set(slice, values);
        prevValuesRef.current[slice] = { ...values };
      }
    }
  });
};

/**
 * Sync a single state value to a store slice
 */
export const useSyncToStore = (slice, values) => {
  const store = getAppStore();
  const prevValuesRef = useRef(null);

  useEffect(() => {
    // Skip if values are the same reference
    if (prevValuesRef.current === values) return;

    // Shallow compare
    const prev = prevValuesRef.current;
    if (prev) {
      let hasChanges = false;
      for (const key of Object.keys(values)) {
        if (prev[key] !== values[key]) {
          hasChanges = true;
          break;
        }
      }
      if (!hasChanges) return;
    }

    prevValuesRef.current = values;
    store.set(slice, values);
  }, [slice, values]);
};

// Re-export STATE_SLICES for convenience
export { STATE_SLICES };

export default useStoreSync;
