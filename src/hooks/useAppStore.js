/**
 * React hook for subscribing to app store slices
 *
 * Components use this to subscribe to only the state they need,
 * preventing unnecessary re-renders when other state changes.
 *
 * Example:
 *   const { viewMode, privateMode } = useAppStore(STATE_SLICES.UI);
 *   const chat = useAppStore(STATE_SLICES.CHAT);
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getAppStore, STATE_SLICES } from "../services/app-store.js";

/**
 * Subscribe to a single state slice
 * @param {string} slice - The slice to subscribe to (from STATE_SLICES)
 * @returns {Object} Current state for that slice
 */
export const useAppStore = (slice) => {
  const store = getAppStore();
  const [state, setState] = useState(() => store.get(slice));

  useEffect(() => {
    return store.subscribe(slice, setState);
  }, [slice]);

  return state;
};

/**
 * Subscribe to multiple state slices
 * @param {string[]} slices - Array of slices to subscribe to
 * @returns {Object} Object with slice names as keys
 */
export const useAppStoreMultiple = (slices) => {
  const store = getAppStore();
  const [state, setState] = useState(() => {
    const data = {};
    for (const slice of slices) {
      data[slice] = store.get(slice);
    }
    return data;
  });

  useEffect(() => {
    return store.subscribeMultiple(slices, setState);
  }, [slices.join(",")]); // Stringify to avoid reference issues

  return state;
};

/**
 * Get a setter function for a slice (doesn't subscribe to updates)
 * Useful for event handlers that don't need to read state
 * @param {string} slice - The slice to get setter for
 * @returns {Function} Setter function
 */
export const useAppStoreSetter = (slice) => {
  const store = getAppStore();
  return useCallback((updates) => store.set(slice, updates), [slice]);
};

/**
 * Subscribe to a slice and get both state and setter
 * @param {string} slice - The slice to subscribe to
 * @returns {[Object, Function]} [state, setter]
 */
export const useAppStoreState = (slice) => {
  const state = useAppStore(slice);
  const setter = useAppStoreSetter(slice);
  return [state, setter];
};

/**
 * Subscribe to a specific property within a slice
 * Only re-renders when that property changes
 * @param {string} slice - The slice
 * @param {string} property - The property within the slice
 * @returns {*} The property value
 */
export const useAppStoreProperty = (slice, property) => {
  const store = getAppStore();
  const [value, setValue] = useState(() => store.get(slice)?.[property]);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const handleUpdate = (sliceState) => {
      const newValue = sliceState?.[property];
      // Only update if actually changed (shallow comparison)
      if (newValue !== prevValueRef.current) {
        prevValueRef.current = newValue;
        setValue(newValue);
      }
    };

    return store.subscribe(slice, handleUpdate);
  }, [slice, property]);

  return value;
};

/**
 * Subscribe to computed/derived state
 * @param {string[]} slices - Slices to derive from
 * @param {Function} selector - Function that computes derived state
 * @returns {*} Derived value
 */
export const useAppStoreSelector = (slices, selector) => {
  const store = getAppStore();

  const computeValue = useCallback(() => {
    const data = {};
    for (const slice of slices) {
      data[slice] = store.get(slice);
    }
    return selector(data);
  }, [slices.join(","), selector]);

  const [value, setValue] = useState(computeValue);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const handleUpdate = () => {
      const newValue = computeValue();
      // Deep comparison could be added here if needed
      if (newValue !== prevValueRef.current) {
        prevValueRef.current = newValue;
        setValue(newValue);
      }
    };

    // Subscribe to all slices
    const unsubscribers = slices.map((slice) =>
      store.subscribe(slice, handleUpdate)
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [slices.join(","), computeValue]);

  return value;
};

// Re-export STATE_SLICES for convenience
export { STATE_SLICES };

export default useAppStore;
