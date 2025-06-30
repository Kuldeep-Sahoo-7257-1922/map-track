import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import * as Notifications from "expo-notifications"
import { storageUtils } from "../utils/storage"
import type { LocationPoint } from "../types"

const BACKGROUND_LOCATION_TASK = "background-location-task"

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

// Background location task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error)
    return
  }

  if (data) {
    try {
      const { locations } = data as any
      console.log("Background location received:", locations.length, "locations")

      // Get current tracking info from storage
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      if (!currentTrackInfo || !currentTrackInfo.isTracking) {
        console.log("No active tracking session, stopping background location")
        await stopBackgroundLocationTracking()
        return
      }

      // Process each location
      for (const location of locations) {
        const locationPoint: LocationPoint = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: Date.now(),
          accuracy: location.coords.accuracy || undefined,
          speed: location.coords.speed || undefined,
          heading: location.coords.heading || undefined,
          altitude: location.coords.altitude || undefined,
        }

        // Save location to current track
        await storageUtils.addLocationToCurrentTrack(locationPoint)
      }

      // Get updated track with latest stats for real-time notification
      const track = await storageUtils.getTrack(currentTrackInfo.trackId)
      if (track) {
        // Update notification with real-time data
        await updateTrackingNotification(
          track.locations.length,
          track.totalDistance,
          currentTrackInfo.trackName,
          currentTrackInfo.startTime,
        )
      }
    } catch (error) {
      console.error("Error processing background location:", error)
    }
  }
})

export const BackgroundLocationService = {
  // Start background location tracking
  async startBackgroundLocationTracking(trackId: string, trackName: string): Promise<boolean> {
    try {
      console.log("Starting background location tracking for:", trackName)

      // Request background location permission
      const { status } = await Location.requestBackgroundPermissionsAsync()
      if (status !== "granted") {
        console.error("Background location permission denied")
        return false
      }

      // Request notification permission
      const { status: notificationStatus } = await Notifications.requestPermissionsAsync()
      if (notificationStatus !== "granted") {
        console.warn("Notification permission denied")
      }

      // Save current tracking info
      await storageUtils.setCurrentTrackInfo({
        trackId,
        trackName,
        isTracking: true,
        startTime: Date.now(),
      })

      // Start background location updates with higher frequency
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000, // 3 seconds for more frequent updates
        distanceInterval: 3, // 3 meters
        deferredUpdatesInterval: 5000, // 5 seconds
        foregroundService: {
          notificationTitle: "🗺️ Location Tracker",
          notificationBody: `Recording: ${trackName}`,
          notificationColor: "#ef4444",
        },
      })

      // Show initial notification
      await showTrackingNotification(trackName, 0, 0, Date.now())

      // Set up periodic notification updates every 10 seconds
      const notificationInterval = setInterval(async () => {
        try {
          const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
          if (!currentTrackInfo || !currentTrackInfo.isTracking) {
            clearInterval(notificationInterval)
            return
          }

          const track = await storageUtils.getTrack(currentTrackInfo.trackId)
          if (track) {
            await updateTrackingNotification(
              track.locations.length,
              track.totalDistance,
              currentTrackInfo.trackName,
              currentTrackInfo.startTime,
            )
          }
        } catch (error) {
          console.error("Error in notification update interval:", error)
        }
      }, 10000) // Update every 10 seconds

      console.log("Background location tracking started successfully")
      return true
    } catch (error) {
      console.error("Error starting background location tracking:", error)
      return false
    }
  },

  // Stop background location tracking
  async stopBackgroundLocationTracking(): Promise<void> {
    try {
      console.log("Stopping background location tracking")

      // Stop location updates
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      }

      // Clear current tracking info
      await storageUtils.clearCurrentTrackInfo()

      // Cancel notification
      await Notifications.cancelAllScheduledNotificationsAsync()

      console.log("Background location tracking stopped")
    } catch (error) {
      console.error("Error stopping background location tracking:", error)
    }
  },

  // Check if background location is running
  async isBackgroundLocationRunning(): Promise<boolean> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      return isRegistered && currentTrackInfo?.isTracking === true
    } catch (error) {
      console.error("Error checking background location status:", error)
      return false
    }
  },

  // Get current tracking info
  async getCurrentTrackingInfo() {
    try {
      return await storageUtils.getCurrentTrackInfo()
    } catch (error) {
      console.error("Error getting current tracking info:", error)
      return null
    }
  },
}

// Show tracking notification with real-time stats
async function showTrackingNotification(trackName: string, pointCount: number, distance: number, startTime?: number) {
  try {
    const distanceText = distance > 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
    const durationText =
      duration > 3600
        ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
        : duration > 60
          ? `${Math.floor(duration / 60)}m ${duration % 60}s`
          : `${duration}s`

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🗺️ Location Tracker - RECORDING",
        body: `${trackName}\n📍 ${pointCount} points • 📏 ${distanceText} • ⏱️ ${durationText}`,
        data: { trackName, pointCount, distance, duration },
        sticky: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        categoryIdentifier: "TRACKING",
      },
      trigger: null, // Show immediately
    })
  } catch (error) {
    console.error("Error showing notification:", error)
  }
}

// Update tracking notification with real-time data
async function updateTrackingNotification(
  pointCount: number,
  distance: number,
  trackName?: string,
  startTime?: number,
) {
  try {
    const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
    if (currentTrackInfo) {
      await showTrackingNotification(
        trackName || currentTrackInfo.trackName,
        pointCount,
        distance,
        startTime || currentTrackInfo.startTime,
      )
    }
  } catch (error) {
    console.error("Error updating notification:", error)
  }
}

// Stop background location tracking (exported function)
export async function stopBackgroundLocationTracking(): Promise<void> {
  return BackgroundLocationService.stopBackgroundLocationTracking()
}
