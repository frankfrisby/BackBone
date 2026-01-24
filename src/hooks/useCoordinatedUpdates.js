/**
 * React hook for coordinated updates
 *
 * This hook allows components to receive batched updates from the
 * global update coordinator, preventing multiple re-renders per frame.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getUpdateCoordinator } from "../services/update-coordinator.js";

/**
 * Hook to subscribe to coordinated updates
 *
 * @param {string} key - Unique key for this subscription
 * @param {Function} fetchData - Function that returns new data (called on each tick)
 * @param {Object} options - Configuration options
 * @returns {Object} Current data and control methods
 */
export const useCoordinatedUpdates = (key, fetchData, options = {}) => {
  const {
    initialData = null,
    enabled = true,
    onUpdate = null
  } = options;

  const [data, setData] = useState(initialData);
  const fetchDataRef = useRef(fetchData);
  const onUpdateRef = useRef(onUpdate);

  // Keep refs updated
  useEffect(() => {
    fetchDataRef.current = fetchData;
    onUpdateRef.current = onUpdate;
  }, [fetchData, onUpdate]);

  useEffect(() => {
    if (!enabled) return;

    const coordinator = getUpdateCoordinator();

    // Register our data fetcher
    coordinator.register(key, (delta, tickCount) => {
      try {
        return fetchDataRef.current(delta, tickCount);
      } catch {
        return null;
      }
    });

    // Subscribe to updates - only update state if data actually changed
    // This prevents unnecessary re-renders when data is identical
    let lastDataJson = JSON.stringify(initialData);

    const handleUpdate = (updates, tickCount) => {
      if (updates[key] !== undefined) {
        const newDataJson = JSON.stringify(updates[key]);
        // Only update if data actually changed (deep comparison)
        if (newDataJson !== lastDataJson) {
          lastDataJson = newDataJson;
          setData(updates[key]);
        }
        if (onUpdateRef.current) {
          onUpdateRef.current(updates[key], tickCount);
        }
      }
    };

    coordinator.on("update", handleUpdate);

    // Start coordinator if not running
    if (!coordinator.isRunning) {
      coordinator.start();
    }

    return () => {
      coordinator.off("update", handleUpdate);
      coordinator.unregister(key);
    };
  }, [key, enabled]);

  return data;
};

/**
 * Hook to subscribe to tick events without registering a data source
 * Useful for components that just need periodic re-renders
 */
export const useCoordinatedTick = (callback, enabled = true) => {
  const [tickCount, setTickCount] = useState(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const coordinator = getUpdateCoordinator();

    const handleTick = (count, delta) => {
      setTickCount(count);
      if (callbackRef.current) {
        callbackRef.current(count, delta);
      }
    };

    coordinator.on("tick", handleTick);

    if (!coordinator.isRunning) {
      coordinator.start();
    }

    return () => {
      coordinator.off("tick", handleTick);
    };
  }, [enabled]);

  return tickCount;
};

/**
 * Hook for batched state updates
 * Queues updates to be applied on the next coordinator tick
 */
export const useBatchedState = (key, initialValue) => {
  const [value, setValue] = useState(initialValue);
  const coordinator = getUpdateCoordinator();

  const setBatchedValue = useCallback((newValue) => {
    coordinator.queueUpdate(key, newValue);
  }, [key]);

  useEffect(() => {
    const handleUpdate = (updates) => {
      if (updates[key] !== undefined) {
        setValue(updates[key]);
      }
    };

    coordinator.on("update", handleUpdate);
    return () => coordinator.off("update", handleUpdate);
  }, [key]);

  return [value, setBatchedValue, setValue];
};

export default useCoordinatedUpdates;
