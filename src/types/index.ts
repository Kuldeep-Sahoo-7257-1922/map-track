export interface LocationPoint {
  latitude: number
  longitude: number
  timestamp: number
  accuracy?: number
  speed?: number
  heading?: number
  altitude?: number
}

export interface SavedTrack {
  id: string
  name: string
  locations: LocationPoint[]
  createdAt: number
  lastModified: number
  isComplete: boolean
  totalDistance: number
  duration: number
}

export interface TrackStats {
  distance: number
  duration: number
}
