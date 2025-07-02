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

export interface PlaybackState {
  isPlaying: boolean
  currentIndex: number
  speed: number
  showControls: boolean
  autoFollow: boolean
  showTrail: boolean
}

export interface PlaybackPosition {
  index: number
  location: LocationPoint
  progress: number
  timeElapsed: number
  distanceTraveled: number
}
