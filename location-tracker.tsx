"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, Square, Download, MapPin, Navigation, Maximize, FileText, Save, FolderOpen } from "lucide-react"
import dynamic from "next/dynamic"
import { ThemeToggle } from "./components/theme-toggle"
import { TrackNameDialog } from "./components/track-name-dialog"
import { TrackList } from "./components/track-list"
import { storageUtils, type LocationPoint, type SavedTrack } from "./utils/storage"

// File parsing utilities
const parseKMLFile = (kmlContent: string): LocationPoint[] => {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(kmlContent, "text/xml")
  const coordinates = xmlDoc.getElementsByTagName("coordinates")[0]?.textContent?.trim()

  if (!coordinates) return []

  const points: LocationPoint[] = []
  const coordLines = coordinates.split(/\s+/).filter((line) => line.trim())

  coordLines.forEach((line, index) => {
    const [lng, lat, alt] = line.split(",").map(Number)
    if (!isNaN(lng) && !isNaN(lat)) {
      points.push({
        latitude: lat,
        longitude: lng,
        timestamp: Date.now() + index * 1000, // Fake timestamps
        altitude: alt || undefined,
      })
    }
  })

  return points
}

const parseGPXFile = (gpxContent: string): LocationPoint[] => {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(gpxContent, "text/xml")
  const trackPoints = xmlDoc.getElementsByTagName("trkpt")

  const points: LocationPoint[] = []

  for (let i = 0; i < trackPoints.length; i++) {
    const trkpt = trackPoints[i]
    const lat = Number.parseFloat(trkpt.getAttribute("lat") || "0")
    const lng = Number.parseFloat(trkpt.getAttribute("lon") || "0")
    const eleElement = trkpt.getElementsByTagName("ele")[0]
    const timeElement = trkpt.getElementsByTagName("time")[0]

    if (!isNaN(lat) && !isNaN(lng)) {
      points.push({
        latitude: lat,
        longitude: lng,
        timestamp: timeElement ? new Date(timeElement.textContent || "").getTime() : Date.now() + i * 1000,
        altitude: eleElement ? Number.parseFloat(eleElement.textContent || "0") : undefined,
      })
    }
  }

  return points
}

// Dynamic import to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("./map-view"), { ssr: false })

export default function LocationTracker() {
  const [isTracking, setIsTracking] = useState(false)
  const [locations, setLocations] = useState<LocationPoint[]>([])
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null)
  const [error, setError] = useState<string>("")
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [showTrackNameDialog, setShowTrackNameDialog] = useState(false)
  const [showTrackList, setShowTrackList] = useState(false)
  const [savedTracks, setSavedTracks] = useState<SavedTrack[]>([])
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null)
  const [currentTrackName, setCurrentTrackName] = useState<string>("")
  const [viewingTrack, setViewingTrack] = useState<SavedTrack | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importedTracks, setImportedTracks] = useState<SavedTrack[]>([])

  const watchIdRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load saved tracks on mount
  useEffect(() => {
    const tracks = storageUtils.getAllTracks()
    setSavedTracks(tracks)
  }, [])

  // Detect device theme on mount
  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    setIsDarkTheme(prefersDark)
  }, [])

  // Auto-save current track every 10 seconds
  useEffect(() => {
    if (isTracking && currentTrackId && locations.length > 0) {
      autoSaveIntervalRef.current = setInterval(() => {
        saveCurrentTrack(false)
      }, 10000) // Auto-save every 10 seconds
    } else {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }
    }
  }, [isTracking, currentTrackId, locations])

  // Toggle theme
  const toggleTheme = () => {
    setIsDarkTheme(!isDarkTheme)
  }

  // Toggle map fullscreen
  const toggleMapFullscreen = () => {
    setIsMapFullscreen(!isMapFullscreen)
  }

  // Toggle track list
  const toggleTrackList = () => {
    setShowTrackList(!showTrackList)
  }

  // Save current track to storage
  const saveCurrentTrack = (isComplete = false) => {
    if (!currentTrackId || !currentTrackName || locations.length === 0) return

    const stats = storageUtils.calculateTrackStats(locations)
    const track: SavedTrack = {
      id: currentTrackId,
      name: currentTrackName,
      locations: [...locations],
      createdAt: locations[0]?.timestamp || Date.now(),
      lastModified: Date.now(),
      isComplete,
      totalDistance: stats.distance,
      duration: stats.duration,
    }

    storageUtils.saveTrack(track)

    // Refresh saved tracks list
    const tracks = storageUtils.getAllTracks()
    setSavedTracks(tracks)
  }

  // Start new tracking
  const handleStartTracking = (trackName: string) => {
    setShowTrackNameDialog(false)
    setCurrentTrackName(trackName)
    setCurrentTrackId(Date.now().toString())
    setViewingTrack(null)
    startTracking()
  }

  // Resume existing track (works for both complete and incomplete tracks)
  const handleResumeTrack = (track: SavedTrack) => {
    setCurrentTrackId(track.id)
    setCurrentTrackName(track.name)
    setLocations([...track.locations]) // Create a copy to avoid mutation
    setViewingTrack(null)
    setShowTrackList(false)

    // Set current location to last known location
    if (track.locations.length > 0) {
      setCurrentLocation(track.locations[track.locations.length - 1])
    }

    // Mark track as incomplete since we're resuming
    const updatedTrack = { ...track, isComplete: false, lastModified: Date.now() }
    storageUtils.saveTrack(updatedTrack)

    // Refresh saved tracks list
    const tracks = storageUtils.getAllTracks()
    setSavedTracks(tracks)

    startTracking()
  }

  // View existing track
  const handleViewTrack = (track: SavedTrack) => {
    setViewingTrack(track)
    setCurrentTrackId(null)
    setCurrentTrackName("")
    setIsTracking(false)
    setShowTrackList(false)

    // Set locations and current location with a small delay to ensure map re-renders
    setTimeout(() => {
      setLocations(track.locations)
      setCurrentLocation(track.locations[0] || null) // Set to first location instead of last
    }, 100)
  }

  // Start tracking location
  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser")
      return
    }

    setError("")
    setIsTracking(true)

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation: LocationPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
          altitude: position.coords.altitude || undefined,
        }
        setCurrentLocation(newLocation)
        setLocations((prev) => {
          // Check if this is a significantly different location
          const lastLocation = prev[prev.length - 1]
          if (
            !lastLocation ||
            Math.abs(lastLocation.latitude - newLocation.latitude) > 0.00001 ||
            Math.abs(lastLocation.longitude - newLocation.longitude) > 0.00001
          ) {
            return [...prev, newLocation]
          }
          return prev
        })
      },
      (error) => {
        setError(`Error getting location: ${error.message}`)
        setIsTracking(false)
      },
    )

    // Watch position changes every second
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation: LocationPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
          altitude: position.coords.altitude || undefined,
        }
        setCurrentLocation(newLocation)
        setLocations((prev) => {
          // Check if this is a significantly different location
          const lastLocation = prev[prev.length - 1]
          if (
            !lastLocation ||
            Math.abs(lastLocation.latitude - newLocation.latitude) > 0.00001 ||
            Math.abs(lastLocation.longitude - newLocation.longitude) > 0.00001
          ) {
            return [...prev, newLocation]
          }
          return prev
        })
      },
      (error) => {
        setError(`Error tracking location: ${error.message}`)
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000,
      },
    )

    // Force update every second even if position hasn't changed significantly
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation: LocationPoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: Date.now(),
            accuracy: position.coords.accuracy,
            speed: position.coords.speed || undefined,
            heading: position.coords.heading || undefined,
            altitude: position.coords.altitude || undefined,
          }
          setCurrentLocation(newLocation)
          setLocations((prev) => {
            // Only add if it's different from the last location
            const lastLocation = prev[prev.length - 1]
            if (
              !lastLocation ||
              Math.abs(lastLocation.latitude - newLocation.latitude) > 0.00001 ||
              Math.abs(lastLocation.longitude - newLocation.longitude) > 0.00001
            ) {
              return [...prev, newLocation]
            }
            return prev
          })
        },
        () => {}, // Ignore errors in interval updates
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 },
      )
    }, 1000)
  }

  // Stop tracking
  const stopTracking = () => {
    setIsTracking(false)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Save track as complete
    if (currentTrackId) {
      saveCurrentTrack(true)
    }
  }

  // Generate KML file content
  const generateKML = (trackLocations: LocationPoint[], trackName = "GPS Track") => {
    if (trackLocations.length === 0) return ""

    const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${trackName}</name>
    <description>GPS track recorded on ${new Date().toLocaleDateString()}</description>
    
    <!-- Style for the track line -->
    <Style id="trackStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>3</width>
      </LineStyle>
    </Style>

    <!-- Track line -->
    <Placemark>
      <name>${trackName}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>`

    const coordinates = trackLocations
      .map((loc) => `${loc.longitude},${loc.latitude},${loc.altitude || 0}`)
      .join("\n          ")

    const kmlMiddle = `
        </coordinates>
      </LineString>
    </Placemark>

    <!-- Waypoints with arrows -->`

    const waypoints =
      trackLocations.length > 0
        ? `
    <!-- Start Point -->
    <Placemark>
      <name>Start Point</name>
      <description>
        Started at: ${new Date(trackLocations[0].timestamp).toLocaleString()}
        Accuracy: ${trackLocations[0].accuracy ? Math.round(trackLocations[0].accuracy) + "m" : "Unknown"}
        ${trackLocations[0].altitude ? `Altitude: ${Math.round(trackLocations[0].altitude)}m` : ""}
      </description>
      <Style>
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
      <Point>
        <coordinates>${trackLocations[0].longitude},${trackLocations[0].latitude},${trackLocations[0].altitude || 0}</coordinates>
      </Point>
    </Placemark>` +
          (trackLocations.length > 1
            ? `
    <!-- End Point -->
    <Placemark>
      <name>End Point</name>
      <description>
        Ended at: ${new Date(trackLocations[trackLocations.length - 1].timestamp).toLocaleString()}
        Accuracy: ${trackLocations[trackLocations.length - 1].accuracy ? Math.round(trackLocations[trackLocations.length - 1].accuracy) + "m" : "Unknown"}
        ${trackLocations[trackLocations.length - 1].altitude ? `Altitude: ${Math.round(trackLocations[trackLocations.length - 1].altitude)}m` : ""}
      </description>
      <Style>
        <IconStyle>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
      <Point>
        <coordinates>${trackLocations[trackLocations.length - 1].longitude},${trackLocations[trackLocations.length - 1].latitude},${trackLocations[trackLocations.length - 1].altitude || 0}</coordinates>
      </Point>
    </Placemark>`
            : "")
        : ""

    const kmlFooter = `
  </Document>
</kml>`

    return kmlHeader + coordinates + kmlMiddle + waypoints + kmlFooter
  }

  // Generate GPX file content
  const generateGPX = (trackLocations: LocationPoint[], trackName = "GPS Track") => {
    if (trackLocations.length === 0) return ""

    const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Location Tracker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    <desc>GPS track recorded on ${new Date().toLocaleDateString()}</desc>
    <time>${new Date(trackLocations[0]?.timestamp).toISOString()}</time>
  </metadata>
  <trk>
    <name>${trackName}</name>
    <trkseg>`

    const trackPoints = trackLocations
      .map(
        (loc) => `
      <trkpt lat="${loc.latitude}" lon="${loc.longitude}">
        ${loc.altitude ? `<ele>${loc.altitude}</ele>` : ""}
        <time>${new Date(loc.timestamp).toISOString()}</time>
        ${loc.speed ? `<extensions><speed>${loc.speed}</speed></extensions>` : ""}
      </trkpt>`,
      )
      .join("")

    const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`

    return gpxHeader + trackPoints + gpxFooter
  }

  // Download file helper
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Download KML file
  const downloadKML = (track?: SavedTrack) => {
    const trackData = track || { name: currentTrackName || "Current Track", locations }
    if (trackData.locations.length === 0) {
      setError("No location data to download")
      return
    }

    const kmlContent = generateKML(trackData.locations, trackData.name)
    const filename = `${trackData.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.kml`
    downloadFile(kmlContent, filename, "application/vnd.google-earth.kml+xml")
  }

  // Download GPX file
  const downloadGPX = (track?: SavedTrack) => {
    const trackData = track || { name: currentTrackName || "Current Track", locations }
    if (trackData.locations.length === 0) {
      setError("No location data to download")
      return
    }

    const gpxContent = generateGPX(trackData.locations, trackData.name)
    const filename = `${trackData.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.gpx`
    downloadFile(gpxContent, filename, "application/gpx+xml")
  }

  // Delete track
  const deleteTrack = (trackId: string) => {
    if (confirm("Are you sure you want to delete this track?")) {
      storageUtils.deleteTrack(trackId)
      const tracks = storageUtils.getAllTracks()
      setSavedTracks(tracks)

      // If viewing the deleted track, clear the view
      if (viewingTrack?.id === trackId) {
        setViewingTrack(null)
        setLocations([])
        setCurrentLocation(null)
      }
    }
  }

  // Clear current data
  const clearData = () => {
    if (confirm("Are you sure you want to clear current data? Unsaved data will be lost.")) {
      setLocations([])
      setCurrentLocation(null)
      setError("")
      setCurrentTrackId(null)
      setCurrentTrackName("")
      setViewingTrack(null)
    }
  }

  // Calculate total distance
  const calculateDistance = () => {
    if (locations.length < 2) return 0
    const stats = storageUtils.calculateTrackStats(locations)
    return stats.distance
  }

  // Calculate elevation gain/loss
  const calculateElevation = () => {
    if (locations.length < 2) return { gain: 0, loss: 0, min: 0, max: 0 }

    let gain = 0
    let loss = 0
    let min = locations[0]?.altitude || 0
    let max = locations[0]?.altitude || 0

    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i - 1]
      const curr = locations[i]

      if (prev.altitude && curr.altitude) {
        const diff = curr.altitude - prev.altitude
        if (diff > 0) gain += diff
        else loss += Math.abs(diff)

        min = Math.min(min, curr.altitude)
        max = Math.max(max, curr.altitude)
      }
    }

    return { gain, loss, min, max }
  }

  // Get max speed
  const getMaxSpeed = () => {
    return Math.max(...locations.map((loc) => loc.speed || 0))
  }

  // Handle file drop
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    files.forEach(handleFileImport)
  }

  const handleFileImport = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".kml") && !file.name.toLowerCase().endsWith(".gpx")) {
      setError("Please upload only KML or GPX files")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        let locations: LocationPoint[] = []

        if (file.name.toLowerCase().endsWith(".kml")) {
          locations = parseKMLFile(content)
        } else if (file.name.toLowerCase().endsWith(".gpx")) {
          locations = parseGPXFile(content)
        }

        if (locations.length === 0) {
          setError("No valid location data found in the file")
          return
        }

        // Create imported track
        const stats = storageUtils.calculateTrackStats(locations)
        const importedTrack: SavedTrack = {
          id: `imported_${Date.now()}`,
          name: `Imported: ${file.name.replace(/\.(kml|gpx)$/i, "")}`,
          locations,
          createdAt: locations[0]?.timestamp || Date.now(),
          lastModified: Date.now(),
          isComplete: true,
          totalDistance: stats.distance,
          duration: stats.duration,
        }

        // Save imported track
        storageUtils.saveTrack(importedTrack)

        // Refresh saved tracks list
        const tracks = storageUtils.getAllTracks()
        setSavedTracks(tracks)

        // Auto-view the imported track
        handleViewTrack(importedTrack)

        setError("")
      } catch (error) {
        setError("Error parsing file: " + (error as Error).message)
      }
    }

    reader.readAsText(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  // Handle file input
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(handleFileImport)
    e.target.value = "" // Reset input
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }
    }
  }, [])

  const totalDistance = calculateDistance()
  const duration =
    locations.length > 0 ? (locations[locations.length - 1]?.timestamp - locations[0]?.timestamp) / 1000 : 0
  const elevation = calculateElevation()
  const maxSpeed = getMaxSpeed()

  const themeClasses = isDarkTheme ? "dark bg-gray-900 text-white" : "bg-white text-gray-900"

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeClasses}`}>
      {/* Track Name Dialog */}
      <TrackNameDialog
        isOpen={showTrackNameDialog}
        onConfirm={handleStartTracking}
        onCancel={() => setShowTrackNameDialog(false)}
        isDarkTheme={isDarkTheme}
      />

      {/* Fullscreen Map Modal */}
      {isMapFullscreen && (
        <div className="fixed inset-0 z-50 bg-black">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              onClick={toggleMapFullscreen}
              variant="secondary"
              size="sm"
              className="bg-white/90 hover:bg-white text-black"
            >
              Exit Fullscreen
            </Button>
          </div>
          <div className="w-full h-full">
            <MapView
              locations={locations}
              currentLocation={currentLocation}
              isTracking={isTracking}
              isDarkTheme={isDarkTheme}
              isFullscreen={true}
            />
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto p-1 sm:p-2 md:p-4 space-y-2 sm:space-y-4">
        <Card className={isDarkTheme ? "bg-gray-800 border-gray-700" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Live Location Tracker
                {(currentTrackName || viewingTrack) && (
                  <Badge variant="outline" className="ml-2">
                    {viewingTrack ? `Viewing: ${viewingTrack.name}` : currentTrackName}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  onClick={toggleTrackList}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 bg-transparent text-xs sm:text-sm px-2 sm:px-3"
                >
                  <FolderOpen className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Tracks</span> ({savedTracks.length})
                </Button>
                <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Control Buttons */}
            <div className="flex gap-1 sm:gap-2 flex-wrap text-xs sm:text-sm">
              {!isTracking ? (
                <Button
                  onClick={() => setShowTrackNameDialog(true)}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                  disabled={viewingTrack !== null}
                >
                  <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                  Start New Track
                </Button>
              ) : (
                <Button
                  onClick={stopTracking}
                  variant="destructive"
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                >
                  <Square className="h-3 w-3 sm:h-4 sm:w-4" />
                  Stop Tracking
                </Button>
              )}

              {isTracking && currentTrackId && (
                <Button
                  onClick={() => saveCurrentTrack(false)}
                  variant="outline"
                  className="flex items-center gap-1 sm:gap-2 bg-transparent text-xs sm:text-sm px-2 sm:px-4"
                >
                  <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                  Save Progress
                </Button>
              )}

              <Button
                onClick={() => downloadKML()}
                disabled={locations.length === 0}
                variant="outline"
                className="flex items-center gap-1 sm:gap-2 bg-transparent text-xs sm:text-sm px-2 sm:px-4"
              >
                <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                KML
              </Button>

              <Button
                onClick={() => downloadGPX()}
                disabled={locations.length === 0}
                variant="outline"
                className="flex items-center gap-1 sm:gap-2 bg-transparent text-xs sm:text-sm px-2 sm:px-4"
              >
                <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                GPX
              </Button>

              <Button onClick={clearData} variant="outline" className="text-xs sm:text-sm px-2 sm:px-4 bg-transparent">
                Clear Data
              </Button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Badge variant={isTracking ? "default" : "secondary"}>
                {isTracking ? "Tracking Active" : viewingTrack ? "Viewing Track" : "Tracking Stopped"}
              </Badge>
              {isTracking && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  Live • Auto-saving
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div
                className={`p-3 border rounded-md text-sm ${
                  isDarkTheme ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {error}
              </div>
            )}

            {/* Track List */}
            {showTrackList && (
              <TrackList
                tracks={savedTracks}
                onDownloadKML={downloadKML}
                onDownloadGPX={downloadGPX}
                onResume={handleResumeTrack}
                onDelete={deleteTrack}
                onView={handleViewTrack}
                isDarkTheme={isDarkTheme}
              />
            )}

            {/* File Drop Zone */}
            <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
              <CardContent className="pt-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Import Track Files
                </h3>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragOver
                      ? isDarkTheme
                        ? "border-blue-400 bg-blue-900/20"
                        : "border-blue-400 bg-blue-50"
                      : isDarkTheme
                        ? "border-gray-600 hover:border-gray-500"
                        : "border-gray-300 hover:border-gray-400"
                  }`}
                  onDrop={handleFileDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div className="space-y-2">
                    <div className="text-2xl">📁</div>
                    <div className="font-medium">Drop KML or GPX files here</div>
                    <div className="text-sm text-muted-foreground">Or click to browse files</div>
                    <input
                      type="file"
                      accept=".kml,.gpx"
                      multiple
                      onChange={handleFileInputChange}
                      className="hidden"
                      id="file-input"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("file-input")?.click()}
                      className="bg-transparent"
                    >
                      Browse Files
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Supported formats: KML, GPX • Files are imported and saved locally
                </div>
              </CardContent>
            </Card>

            {/* Current Location */}
            {currentLocation && (
              <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Current Location</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Latitude:</span> {currentLocation.latitude.toFixed(6)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Longitude:</span> {currentLocation.longitude.toFixed(6)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time:</span>{" "}
                      {new Date(currentLocation.timestamp).toLocaleTimeString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Accuracy:</span>{" "}
                      {currentLocation.accuracy ? Math.round(currentLocation.accuracy) + "m" : "Unknown"}
                    </div>
                    {currentLocation.speed && (
                      <div>
                        <span className="text-muted-foreground">Speed:</span> {(currentLocation.speed * 3.6).toFixed(1)}{" "}
                        km/h
                      </div>
                    )}
                    {currentLocation.altitude && (
                      <div>
                        <span className="text-muted-foreground">Altitude:</span> {Math.round(currentLocation.altitude)}m
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Enhanced Statistics */}
            {locations.length > 0 && (
              <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
                <CardContent className="pt-4">
                  <h3 className="font-medium mb-2">Track Statistics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Points</div>
                      <div className="font-medium">{locations.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Distance</div>
                      <div className="font-medium">
                        {totalDistance > 1000
                          ? `${(totalDistance / 1000).toFixed(2)} km`
                          : `${Math.round(totalDistance)} m`}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Duration</div>
                      <div className="font-medium">
                        {Math.floor(duration / 3600)}h {Math.floor((duration % 3600) / 60)}m {Math.floor(duration % 60)}
                        s
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg Speed</div>
                      <div className="font-medium">
                        {duration > 0 ? `${((totalDistance / duration) * 3.6).toFixed(1)} km/h` : "0 km/h"}
                      </div>
                    </div>
                    {maxSpeed > 0 && (
                      <div>
                        <div className="text-muted-foreground">Max Speed</div>
                        <div className="font-medium">{(maxSpeed * 3.6).toFixed(1)} km/h</div>
                      </div>
                    )}
                    {elevation.gain > 0 && (
                      <>
                        <div>
                          <div className="text-muted-foreground">Elevation Gain</div>
                          <div className="font-medium">{Math.round(elevation.gain)}m</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Elevation Loss</div>
                          <div className="font-medium">{Math.round(elevation.loss)}m</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Altitude Range</div>
                          <div className="font-medium">
                            {Math.round(elevation.min)}m - {Math.round(elevation.max)}m
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Live Map View */}
            {locations.length > 0 && (
              <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{viewingTrack ? `Track: ${viewingTrack.name}` : "Live Track Map"}</h3>
                    <Button
                      onClick={toggleMapFullscreen}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2 bg-transparent"
                    >
                      <Maximize className="h-4 w-4" />
                      Fullscreen
                    </Button>
                  </div>
                  <div className="h-96 w-full rounded-lg overflow-hidden border-0">
                    <MapView
                      locations={locations}
                      currentLocation={currentLocation}
                      isTracking={isTracking}
                      isDarkTheme={isDarkTheme}
                      isFullscreen={false}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Locations */}
            {locations.length > 0 && (
              <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
                <CardContent className="pt-4">
                  <h3 className="font-medium mb-2">Recent Locations ({locations.length} total)</h3>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {locations
                      .slice(-10)
                      .reverse()
                      .map((loc, index) => (
                        <div
                          key={loc.timestamp}
                          className={`flex justify-between items-center text-xs p-2 rounded ${
                            isDarkTheme ? "bg-gray-600" : "bg-gray-50"
                          }`}
                        >
                          <span>
                            {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                            {loc.speed && ` • ${(loc.speed * 3.6).toFixed(1)} km/h`}
                          </span>
                          <span className="text-muted-foreground">{new Date(loc.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructions */}
            <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
              <CardContent className="pt-4">
                <h3 className="font-medium mb-2">How to Use</h3>
                <ol className="text-sm space-y-1 text-muted-foreground">
                  <li>1. Click "Start New Track" and enter a name for your track</li>
                  <li>2. Your location will be captured and auto-saved every 10 seconds</li>
                  <li>3. Use "Tracks" button to view, resume, or download saved tracks</li>
                  <li>4. Click on track segments in the map for detailed information</li>
                  <li>5. Use "Fullscreen" for better map viewing experience</li>
                  <li>6. All data is saved locally in your browser</li>
                </ol>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
