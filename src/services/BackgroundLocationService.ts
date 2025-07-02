import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import { storageUtils } from "../utils/storage"
import type { LocationPoint } from "../types"

const BACKGROUND_LOCATION_TASK = "background-location-task"

// Background location task with comprehensive error handling
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error)
    return
  }

  if (data) {
    try {
      const { locations } = data as any
      console.log("Background location received:", locations?.length || 0, "locations")

      if (!locations || locations.length === 0) {
        console.log("No locations received in background task")
        return
      }

      // Get current tracking info from storage
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      if (!currentTrackInfo || !currentTrackInfo.isTracking) {
        console.log("No active tracking session, stopping background location")
        await stopBackgroundLocationTracking()
        return
      }

      // Process each location with error handling
      for (const location of locations) {
        try {
          if (!location?.coords) {
            console.warn("Invalid location data:", location)
            continue
          }

          const locationPoint: LocationPoint = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: Date.now(),
            accuracy: location.coords.accuracy || undefined,
            speed: location.coords.speed || undefined,
            heading: location.coords.heading || undefined,
            altitude: location.coords.altitude || undefined,
          }

          // Validate location data
          if (isNaN(locationPoint.latitude) || isNaN(locationPoint.longitude)) {
            console.warn("Invalid coordinates:", locationPoint)
            continue
          }

          // Save location to current track
          await storageUtils.addLocationToCurrentTrack(locationPoint)
        } catch (locationError) {
          console.error("Error processing individual location:", locationError)
        }
      }

      console.log("Background location processed successfully")
    } catch (error) {
      console.error("Error processing background location:", error)
    }
  }
})

export const BackgroundLocationService = {
  // Start background location tracking with comprehensive error handling
  async startBackgroundLocationTracking(trackId: string, trackName: string): Promise<boolean> {
    try {
      console.log("Starting background location tracking for:", trackName)

      if (!trackId || !trackName) {
        console.error("Invalid track ID or name")
        return false
      }

      // Check if already running
      const isAlreadyRunning = await this.isBackgroundLocationRunning()
      if (isAlreadyRunning) {
        console.log("Background location already running")
        return true
      }

      // Request background location permission
      try {
        const { status } = await Location.requestBackgroundPermissionsAsync()
        if (status !== "granted") {
          console.error("Background location permission denied")
          return false
        }
      } catch (permissionError) {
        console.error("Error requesting background permission:", permissionError)
        return false
      }

      // Save current tracking info
      try {
        await storageUtils.setCurrentTrackInfo({
          trackId,
          trackName,
          isTracking: true,
          startTime: Date.now(),
        })
      } catch (storageError) {
        console.error("Error saving track info:", storageError)
        return false
      }

      // Start background location updates with conservative settings for better compatibility
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced, // Use Balanced instead of BestForNavigation for better compatibility
          timeInterval: 10000, // 10 seconds - more conservative for battery and compatibility
          distanceInterval: 10, // 10 meters
          deferredUpdatesInterval: 30000, // 30 seconds
          showsBackgroundLocationIndicator: true, // Show system indicator
          pausesUpdatesAutomatically: false, // Don't pause automatically
          // Remove foregroundService option to let Expo handle it automatically
        })
      } catch (locationError) {
        console.error("Error starting location updates:", locationError)

        // Try with even more conservative settings if first attempt fails
        try {
          console.log("Retrying with more conservative settings...")
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Low, // Use Low accuracy as fallback
            timeInterval: 30000, // 30 seconds
            distanceInterval: 50, // 50 meters
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          })
        } catch (fallbackError) {
          console.error("Fallback location settings also failed:", fallbackError)
          return false
        }
      }

      console.log("Background location tracking started successfully")
      return true
    } catch (error) {
      console.error("Error starting background location tracking:", error)
      return false
    }
  },

  // Stop background location tracking with comprehensive cleanup
  async stopBackgroundLocationTracking(): Promise<void> {
    try {
      console.log("Stopping background location tracking")

      // Stop location updates
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)
        if (isRegistered) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
          console.log("Location updates stopped")
        }
      } catch (stopError) {
        console.error("Error stopping location updates:", stopError)
      }

      // Clear current tracking info
      try {
        await storageUtils.clearCurrentTrackInfo()
        console.log("Tracking info cleared")
      } catch (clearError) {
        console.error("Error clearing tracking info:", clearError)
      }

      console.log("Background location tracking stopped")
    } catch (error) {
      console.error("Error stopping background location tracking:", error)
    }
  },

  // Check if background location is running with error handling
  async isBackgroundLocationRunning(): Promise<boolean> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      const isRunning = isRegistered && currentTrackInfo?.isTracking === true
      console.log("Background location running:", isRunning)
      return isRunning
    } catch (error) {
      console.error("Error checking background location status:", error)
      return false
    }
  },

  // Get current tracking info with error handling
  async getCurrentTrackingInfo() {
    try {
      const info = await storageUtils.getCurrentTrackInfo()
      return info
    } catch (error) {
      console.error("Error getting current tracking info:", error)
      return null
    }
  },

  // Health check for background service
  async healthCheck(): Promise<boolean> {
    try {
      const isRunning = await this.isBackgroundLocationRunning()
      const trackInfo = await this.getCurrentTrackingInfo()

      console.log("Background service health check:", {
        isRunning,
        hasTrackInfo: !!trackInfo,
        trackId: trackInfo?.trackId,
      })

      return isRunning && !!trackInfo
    } catch (error) {
      console.error("Background service health check failed:", error)
      return false
    }
  },
}

// Stop background location tracking (exported function)
export async function stopBackgroundLocationTracking(): Promise<void> {
  return BackgroundLocationService.stopBackgroundLocationTracking()
}
