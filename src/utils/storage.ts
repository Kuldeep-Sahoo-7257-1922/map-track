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
  // Get all saved tracks
  getAllTracks: async (): Promise<SavedTrack[]> => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error("Error loading tracks from storage:", error)
      return []
    }
  },

  // Save a track
  saveTrack: async (track: SavedTrack): Promise<void> => {
    try {
      const tracks = await storageUtils.getAllTracks()
      const existingIndex = tracks.findIndex((t) => t.id === track.id)

      if (existingIndex >= 0) {
        tracks[existingIndex] = track
      } else {
        tracks.push(track)
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
    } catch (error) {
      console.error("Error saving track to storage:", error)
      throw error
    }
  },

  // Delete a track
  deleteTrack: async (trackId: string): Promise<void> => {
    try {
      const tracks = await storageUtils.getAllTracks()
      const filteredTracks = tracks.filter((t) => t.id !== trackId)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filteredTracks))
    } catch (error) {
      console.error("Error deleting track from storage:", error)
      throw error
    }
  },

  // Get a specific track
  getTrack: async (trackId: string): Promise<SavedTrack | null> => {
    try {
      const tracks = await storageUtils.getAllTracks()
      return tracks.find((t) => t.id === trackId) || null
    } catch (error) {
      console.error("Error getting track from storage:", error)
      return null
    }
  },

  // Calculate track statistics
  calculateTrackStats: (locations: LocationPoint[]): TrackStats => {
    if (locations.length < 2) return { distance: 0, duration: 0 }

    let totalDistance = 0
    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i - 1]
      const curr = locations[i]

      if (!prev || !curr) continue

      // Haversine formula for distance calculation
      const R = 6371e3 // Earth's radius in meters
      const φ1 = (prev.latitude * Math.PI) / 180
      const φ2 = (curr.latitude * Math.PI) / 180
      const Δφ = ((curr.latitude - prev.latitude) * Math.PI) / 180
      const Δλ = ((curr.longitude - prev.longitude) * Math.PI) / 180

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      totalDistance += R * c
    }

    const duration = (locations[locations.length - 1]?.timestamp - locations[0]?.timestamp) / 1000

    return { distance: totalDistance, duration }
  },

  // Current track management for background tracking
  setCurrentTrackInfo: async (info: CurrentTrackInfo): Promise<void> => {
    try {
      await AsyncStorage.setItem(CURRENT_TRACK_KEY, JSON.stringify(info))
    } catch (error) {
      console.error("Error saving current track info:", error)
      throw error
    }
  },

  getCurrentTrackInfo: async (): Promise<CurrentTrackInfo | null> => {
    try {
      const stored = await AsyncStorage.getItem(CURRENT_TRACK_KEY)
      return stored ? JSON.parse(stored) : null
    } catch (error) {
      console.error("Error getting current track info:", error)
      return null
    }
  },

  clearCurrentTrackInfo: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(CURRENT_TRACK_KEY)
    } catch (error) {
      console.error("Error clearing current track info:", error)
    }
  },

  // Add location to current track (for background updates)
  addLocationToCurrentTrack: async (location: LocationPoint): Promise<void> => {
    try {
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo()
      if (!currentTrackInfo) return

      const track = await storageUtils.getTrack(currentTrackInfo.trackId)
      if (!track) return

      // Add location to track
      track.locations.push(location)
      track.lastModified = Date.now()

      // Recalculate stats
      const stats = storageUtils.calculateTrackStats(track.locations)
      track.totalDistance = stats.distance
      track.duration = stats.duration

      // Save updated track
      await storageUtils.saveTrack(track)
    } catch (error) {
      console.error("Error adding location to current track:", error)
    }
  },
}
