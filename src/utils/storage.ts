import AsyncStorage from "@react-native-async-storage/async-storage"
import type { LocationPoint, SavedTrack, TrackStats } from "../types"

const STORAGE_KEY = "location-tracker-tracks"
const CURRENT_TRACK_KEY = "location-tracker-current-track"

export interface CurrentTrackInfo {
  trackId: string
  trackName: string
  isTracking: boolean
  startTime: number
}

export const storageUtils = {
  // Get all saved tracks with error handling
  getAllTracks: async (): Promise<SavedTrack[]> => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      const tracks = stored ? JSON.parse(stored) : []

      // Validate tracks data
      if (!Array.isArray(tracks)) {
        console.warn("Invalid tracks data, resetting to empty array")
        return []
      }

      // Filter out invalid tracks
      const validTracks = tracks.filter(
        (track) =>
          track && typeof track.id === "string" && typeof track.name === "string" && Array.isArray(track.locations),
      )

      if (validTracks.length !== tracks.length) {
        console.warn(`Filtered out ${tracks.length - validTracks.length} invalid tracks`)
        // Save cleaned data back
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validTracks))
      }

      return validTracks
    } catch (error) {
      console.error("Error loading tracks from storage:", error)
      return []
    }
  },

  // Save a track with comprehensive error handling
  saveTrack: async (track: SavedTrack): Promise<void> => {
    try {
      if (!track || !track.id || !track.name || !Array.isArray(track.locations)) {
        throw new Error("Invalid track data")
      }

      const tracks = await storageUtils.getAllTracks()
      const existingIndex = tracks.findIndex((t) => t.id === track.id)

      if (existingIndex >= 0) {
        tracks[existingIndex] = track
      } else {
        tracks.push(track)
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
      console.log("Track saved successfully:", track.name)
    } catch (error) {
      console.error("Error saving track to storage:", error)
      throw error
    }
  },

  // Delete a track with error handling
  deleteTrack: async (trackId: string): Promise<void> => {
    try {
      if (!trackId) {
        throw new Error("Invalid track ID")
      }

      const tracks = await storageUtils.getAllTracks()
      const filteredTracks = tracks.filter((t) => t.id !== trackId)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredTracks))
      console.log("Track deleted successfully:", trackId)
    } catch (error) {
      console.error("Error deleting track from storage:", error)
      throw error
    }
  },

  // Get a specific track with error handling
  getTrack: async (trackId: string): Promise<SavedTrack | null> => {
    try {
      if (!trackId) {
        return null
      }

      const tracks = await storageUtils.getAllTracks()
      const track = tracks.find((t) => t.id === trackId)
      return track || null
    } catch (error) {
      console.error("Error getting track from storage:", error)
      return null
    }
  },

  // Calculate track statistics with error handling
  calculateTrackStats: (locations: LocationPoint[]): TrackStats => {
    try {
      if (!Array.isArray(locations) || locations.length < 2) {
        return { distance: 0, duration: 0 }
      }

      let totalDistance = 0
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1]
        const curr = locations[i]

        if (
          !prev ||
          !curr ||
          typeof prev.latitude !== "number" ||
          typeof prev.longitude !== "number" ||
          typeof curr.latitude !== "number" ||
          typeof curr.longitude !== "number"
        ) {
          continue
        }

        // Haversine formula for distance calculation
        const R = 6371e3 // Earth's radius in meters
        const φ1 = (prev.latitude * Math.PI) / 180
        const φ2 = (curr.latitude * Math.PI) / 180
        const Δφ = ((curr.latitude - prev.latitude) * Math.PI) / 180
        const Δλ = ((curr.longitude - prev.longitude) * Math.PI) / 180

        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

        const distance = R * c
        if (!isNaN(distance) && distance > 0) {
          totalDistance += distance
        }
      }

      const firstLocation = locations[0]
      const lastLocation = locations[locations.length - 1]

      if (!firstLocation?.timestamp || !lastLocation?.timestamp) {
        return { distance: totalDistance, duration: 0 }
      }

      const duration = Math.max(0, (lastLocation.timestamp - firstLocation.timestamp) / 1000)

      return { distance: totalDistance, duration }
    } catch (error) {
      console.error("Error calculating track stats:", error)
      return { distance: 0, duration: 0 }
    }
  },

  // Current track management for background tracking
  setCurrentTrackInfo: async (info: CurrentTrackInfo): Promise<void> => {
    try {
      if (!info || !info.trackId || !info.trackName) {
        throw new Error("Invalid track info")
      }

      await AsyncStorage.setItem(CURRENT_TRACK_KEY, JSON.stringify(info))
      console.log("Current track info saved:", info.trackName)
    } catch (error) {
      console.error("Error saving current track info:", error)
      throw error
    }
  },

  getCurrentTrackInfo: async (): Promise<CurrentTrackInfo | null> => {
    try {
      const stored = await AsyncStorage.getItem(CURRENT_TRACK_KEY)
      if (!stored) {
        return null
      }

      const info = JSON.parse(stored)

      // Validate track info
      if (!info || !info.trackId || !info.trackName || typeof info.isTracking !== "boolean") {
        console.warn("Invalid current track info, clearing")
        await AsyncStorage.removeItem(CURRENT_TRACK_KEY)
        return null
      }

      return info
    } catch (error) {
      console.error("Error getting current track info:", error)
      return null
    }
  },

  clearCurrentTrackInfo: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(CURRENT_TRACK_KEY)
      console.log("Current track info cleared")
    } catch (error) {
      console.error("Error clearing current track info:", error)
    }
  },

  // Add location to current track (for background updates) with error handling
  addLocationToCurrentTrack: async (location: LocationPoint): Promise<void> => {
    try {
      if (
        !location ||
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number" ||
        isNaN(location.latitude) ||
        isNaN(location.longitude)
      ) {
        console.warn("Invalid location data:", location)
        return
      }

      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      if (!currentTrackInfo) {
        console.warn("No current track info found")
        return
      }

      const track = await storageUtils.getTrack(currentTrackInfo.trackId)
      if (!track) {
        console.warn("Current track not found:", currentTrackInfo.trackId)
        return
      }

      // Add location to track
      track.locations.push(location)
      track.lastModified = Date.now()

      // Recalculate stats
      const stats = storageUtils.calculateTrackStats(track.locations)
      track.totalDistance = stats.distance
      track.duration = stats.duration

      // Save updated track
      await storageUtils.saveTrack(track)
      console.log("Location added to track:", track.name, "Total points:", track.locations.length)
    } catch (error) {
      console.error("Error adding location to current track:", error)
    }
  },

  // Storage health check and cleanup
  healthCheck: async (): Promise<boolean> => {
    try {
      // Test basic storage functionality
      const testKey = "health-check-test"
      const testValue = "test-value"

      await AsyncStorage.setItem(testKey, testValue)
      const retrieved = await AsyncStorage.getItem(testKey)
      await AsyncStorage.removeItem(testKey)

      if (retrieved !== testValue) {
        console.error("Storage health check failed: value mismatch")
        return false
      }

      // Check tracks data integrity
      const tracks = await storageUtils.getAllTracks()
      console.log("Storage health check passed. Tracks count:", tracks.length)

      return true
    } catch (error) {
      console.error("Storage health check failed:", error)
      return false
    }
  },
}
