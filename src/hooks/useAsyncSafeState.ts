"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Hook to prevent state updates on unmounted components
export function useAsyncSafeState<T>(initialState: T): [T, (newState: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialState)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const setSafeState = useCallback((newState: T | ((prev: T) => T)) => {
    if (isMountedRef.current) {
      setState(newState)
    }
  }, [])

  return [state, setSafeState]
}

// Hook for safe async operations
export function useAsyncOperation() {
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const executeAsync = useCallback(async (operation: () => Promise<any>): Promise<any | null> => {
    try {
      const result = await operation()
      return isMountedRef.current ? result : null
    } catch (error) {
      if (isMountedRef.current) {
        console.error("Async operation error:", error)
        throw error
      }
      return null
    }
  }, [])

  return { executeAsync, isMounted: () => isMountedRef.current }
}
