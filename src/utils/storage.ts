import AsyncStorage from "@react-native-async-storage/async-storage"
import type { LocationPoint, SavedTrack, TrackStats } from "../types"

const STORAGE_KEY = "location-tracker-tracks"

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
}
