"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Alert, TouchableOpacity, StatusBar, ScrollView } from "react-native"
import { Provider as PaperProvider, Card, Button, Badge, Portal, Modal, TextInput } from "react-native-paper"
import { MaterialIcons } from "@expo/vector-icons"
import * as Location from "expo-location"
import * as FileSystem from "expo-file-system"
import * as Sharing from "expo-sharing"
import * as DocumentPicker from "expo-document-picker"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"

import MapComponent from "./src/components/MapView"
import TrackList from "./src/components/TrackList"
import { storageUtils } from "./src/utils/storage"
import { generateKML, generateGPX, parseKMLFile, parseGPXFile } from "./src/utils/fileUtils"
import type { LocationPoint, SavedTrack } from "./src/types"

const App: React.FC = () => {
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
  const [trackNameInput, setTrackNameInput] = useState("")

  const locationSubscription = useRef<Location.LocationSubscription | null>(null)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Request location permissions
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== "granted") {
        setError("Location permission denied")
        return false
      }
      return true
    } catch (error) {
      setError("Error requesting location permission")
      return false
    }
  }

  // Load saved tracks on mount
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const tracks = await storageUtils.getAllTracks()
        setSavedTracks(tracks)
      } catch (error) {
        console.error("Error loading tracks:", error)
      }
    }
    loadTracks()
  }, [])

  // Auto-save current track every 10 seconds
  useEffect(() => {
    if (isTracking && currentTrackId && locations.length > 0) {
      autoSaveIntervalRef.current = setInterval(() => {
        saveCurrentTrack(false)
      }, 10000)
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

  // Save current track to storage
  const saveCurrentTrack = async (isComplete = false) => {
    if (!currentTrackId || !currentTrackName || locations.length === 0) return

    try {
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

      await storageUtils.saveTrack(track)

      // Refresh saved tracks list
      const tracks = await storageUtils.getAllTracks()
      setSavedTracks(tracks)
    } catch (error) {
      console.error("Error saving track:", error)
    }
  }

  // Start new tracking
  const handleStartTracking = (trackName: string) => {
    setShowTrackNameDialog(false)
    setCurrentTrackName(trackName)
    setCurrentTrackId(Date.now().toString())
    setViewingTrack(null)
    startTracking()
  }

  // Resume existing track
  const handleResumeTrack = async (track: SavedTrack) => {
    setCurrentTrackId(track.id)
    setCurrentTrackName(track.name)
    setLocations([...track.locations])
    setViewingTrack(null)
    setShowTrackList(false)

    if (track.locations.length > 0) {
      setCurrentLocation(track.locations[track.locations.length - 1])
    }

    try {
      // Mark track as incomplete since we're resuming
      const updatedTrack = { ...track, isComplete: false, lastModified: Date.now() }
      await storageUtils.saveTrack(updatedTrack)

      const tracks = await storageUtils.getAllTracks()
      setSavedTracks(tracks)
    } catch (error) {
      console.error("Error updating track:", error)
    }

    startTracking()
  }

  // View existing track
  const handleViewTrack = (track: SavedTrack) => {
    setViewingTrack(track)
    setCurrentTrackId(null)
    setCurrentTrackName("")
    setIsTracking(false)
    setShowTrackList(false)

    setTimeout(() => {
      setLocations(track.locations)
      setCurrentLocation(track.locations[0] || null)
    }, 100)
  }

  // Start tracking location
  const startTracking = async () => {
    const hasPermission = await requestLocationPermission()
    if (!hasPermission) {
      return
    }

    setError("")
    setIsTracking(true)

    try {
      // Get initial position
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      })

      const newLocation: LocationPoint = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        timestamp: Date.now(),
        accuracy: initialLocation.coords.accuracy || undefined,
        speed: initialLocation.coords.speed || undefined,
        heading: initialLocation.coords.heading || undefined,
        altitude: initialLocation.coords.altitude || undefined,
      }

      setCurrentLocation(newLocation)
      setLocations((prev) => {
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

      // Start watching position
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          const newLocation: LocationPoint = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: Date.now(),
            accuracy: location.coords.accuracy || undefined,
            speed: location.coords.speed || undefined,
            heading: location.coords.heading || undefined,
            altitude: location.coords.altitude || undefined,
          }

          setCurrentLocation(newLocation)
          setLocations((prev) => {
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
      )
    } catch (error) {
      setError(`Error starting location tracking: ${error}`)
      setIsTracking(false)
    }
  }

  // Stop tracking
  const stopTracking = () => {
    setIsTracking(false)
    if (locationSubscription.current) {
      locationSubscription.current.remove()
      locationSubscription.current = null
    }

    if (currentTrackId) {
      saveCurrentTrack(true)
    }
  }

  // Download KML file
  const downloadKML = async (track?: SavedTrack) => {
    const trackData = track || { name: currentTrackName || "Current Track", locations }
    if (trackData.locations.length === 0) {
      setError("No location data to download")
      return
    }

    try {
      const kmlContent = generateKML(trackData.locations, trackData.name)
      const filename = `${trackData.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.kml`
      const fileUri = `${FileSystem.documentDirectory}${filename}`

      await FileSystem.writeAsStringAsync(fileUri, kmlContent)

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.google-earth.kml+xml",
          dialogTitle: "Share KML Track",
        })
      } else {
        Alert.alert("Success", `KML file saved to: ${fileUri}`)
      }
    } catch (error) {
      setError("Error sharing KML file")
    }
  }

  // Download GPX file
  const downloadGPX = async (track?: SavedTrack) => {
    const trackData = track || { name: currentTrackName || "Current Track", locations }
    if (trackData.locations.length === 0) {
      setError("No location data to download")
      return
    }

    try {
      const gpxContent = generateGPX(trackData.locations, trackData.name)
      const filename = `${trackData.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.gpx`
      const fileUri = `${FileSystem.documentDirectory}${filename}`

      await FileSystem.writeAsStringAsync(fileUri, gpxContent)

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/gpx+xml",
          dialogTitle: "Share GPX Track",
        })
      } else {
        Alert.alert("Success", `GPX file saved to: ${fileUri}`)
      }
    } catch (error) {
      setError("Error sharing GPX file")
    }
  }

  // Delete track
  const deleteTrack = async (trackId: string) => {
    try {
      await storageUtils.deleteTrack(trackId)
      const tracks = await storageUtils.getAllTracks()
      setSavedTracks(tracks)

      if (viewingTrack?.id === trackId) {
        setViewingTrack(null)
        setLocations([])
        setCurrentLocation(null)
      }
    } catch (error) {
      console.error("Error deleting track:", error)
    }
  }

  // Clear current data
  const clearData = () => {
    Alert.alert("Clear Data", "Are you sure you want to clear current data? Unsaved data will be lost.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setLocations([])
          setCurrentLocation(null)
          setError("")
          setCurrentTrackId(null)
          setCurrentTrackName("")
          setViewingTrack(null)
        },
      },
    ])
  }

  // Import file
  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const file = result.assets[0]
      if (!file.name?.toLowerCase().endsWith(".kml") && !file.name?.toLowerCase().endsWith(".gpx")) {
        setError("Please select only KML or GPX files")
        return
      }

      const content = await FileSystem.readAsStringAsync(file.uri)
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

      await storageUtils.saveTrack(importedTrack)
      const tracks = await storageUtils.getAllTracks()
      setSavedTracks(tracks)

      handleViewTrack(importedTrack)
      setError("")
    } catch (error) {
      setError("Error importing file")
    }
  }

  // Calculate statistics
  const calculateDistance = () => {
    if (locations.length < 2) return 0
    const stats = storageUtils.calculateTrackStats(locations)
    return stats.distance
  }

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

  const getMaxSpeed = () => {
    return Math.max(...locations.map((loc) => loc.speed || 0))
  }

  const totalDistance = calculateDistance()
  const duration =
    locations.length > 0 ? (locations[locations.length - 1]?.timestamp - locations[0]?.timestamp) / 1000 : 0
  const elevation = calculateElevation()
  const maxSpeed = getMaxSpeed()

  const theme = {
    colors: {
      primary: "#2563eb",
      background: isDarkTheme ? "#111827" : "#ffffff",
      surface: isDarkTheme ? "#374151" : "#ffffff",
      text: isDarkTheme ? "#ffffff" : "#000000",
    },
  }

  return (
    <PaperProvider theme={theme}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <StatusBar
            barStyle={isDarkTheme ? "light-content" : "dark-content"}
            backgroundColor={theme.colors.background}
          />

          {/* Header */}
          <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.headerLeft}>
              <MaterialIcons name="navigation" size={24} color={theme.colors.text} />
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Location Tracker</Text>
              {(currentTrackName || viewingTrack) && (
                <Badge style={styles.headerBadge}>
                  {viewingTrack ? `Viewing: ${viewingTrack.name}` : currentTrackName}
                </Badge>
              )}
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => setShowTrackList(!showTrackList)} style={styles.headerButton}>
                <MaterialIcons name="folder" size={24} color={theme.colors.text} />
                <Text style={[styles.headerButtonText, { color: theme.colors.text }]}>({savedTracks.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsDarkTheme(!isDarkTheme)} style={styles.headerButton}>
                <MaterialIcons name={isDarkTheme ? "wb-sunny" : "brightness-2"} size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Scrollable Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Control Buttons */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <View style={styles.controlButtons}>
                  {!isTracking ? (
                    <Button
                      mode="contained"
                      onPress={() => {
                        setTrackNameInput(`Track ${new Date().toLocaleDateString()}`)
                        setShowTrackNameDialog(true)
                      }}
                      disabled={viewingTrack !== null}
                      style={styles.controlButton}
                      icon="play"
                    >
                      Start New Track
                    </Button>
                  ) : (
                    <Button
                      mode="contained"
                      onPress={stopTracking}
                      style={[styles.controlButton, styles.stopButton]}
                      buttonColor="#ef4444"
                      icon="stop"
                    >
                      Stop Tracking
                    </Button>
                  )}

                  {isTracking && currentTrackId && (
                    <Button
                      mode="outlined"
                      onPress={() => saveCurrentTrack(false)}
                      style={styles.controlButton}
                      icon="content-save"
                    >
                      Save Progress
                    </Button>
                  )}

                  <View style={styles.buttonRow}>
                    <Button
                      mode="outlined"
                      onPress={() => downloadKML()}
                      disabled={locations.length === 0}
                      style={styles.smallButton}
                      icon="download"
                    >
                      KML
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => downloadGPX()}
                      disabled={locations.length === 0}
                      style={styles.smallButton}
                      icon="download"
                    >
                      GPX
                    </Button>
                    <Button mode="outlined" onPress={clearData} style={styles.smallButton} icon="delete">
                      Clear
                    </Button>
                    <Button mode="outlined" onPress={importFile} style={styles.smallButton} icon="upload">
                      Import
                    </Button>
                  </View>
                </View>

                {/* Status */}
                <View style={styles.statusContainer}>
                  <Badge style={[styles.statusBadge, isTracking ? styles.trackingBadge : styles.stoppedBadge]}>
                    {isTracking ? "Tracking Active" : viewingTrack ? "Viewing Track" : "Tracking Stopped"}
                  </Badge>
                  {isTracking && (
                    <View style={styles.liveIndicator}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Live • Auto-saving</Text>
                    </View>
                  )}
                </View>

                {/* Error Display */}
                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </Card.Content>
            </Card>

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

            {/* Current Location */}
            {currentLocation && (
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <MaterialIcons name="my-location" size={20} color="#3b82f6" />
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Current Location</Text>
                  </View>
                  <View style={styles.locationGrid}>
                    <View style={styles.locationItem}>
                      <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Latitude:</Text>
                      <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                        {currentLocation.latitude.toFixed(6)}
                      </Text>
                    </View>
                    <View style={styles.locationItem}>
                      <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Longitude:</Text>
                      <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                        {currentLocation.longitude.toFixed(6)}
                      </Text>
                    </View>
                    <View style={styles.locationItem}>
                      <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Time:</Text>
                      <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                        {new Date(currentLocation.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                    <View style={styles.locationItem}>
                      <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Accuracy:</Text>
                      <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                        {currentLocation.accuracy ? Math.round(currentLocation.accuracy) + "m" : "Unknown"}
                      </Text>
                    </View>
                    {currentLocation.speed && (
                      <View style={styles.locationItem}>
                        <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Speed:</Text>
                        <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                          {(currentLocation.speed * 3.6).toFixed(1)} km/h
                        </Text>
                      </View>
                    )}
                    {currentLocation.altitude && (
                      <View style={styles.locationItem}>
                        <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Altitude:</Text>
                        <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                          {Math.round(currentLocation.altitude)}m
                        </Text>
                      </View>
                    )}
                  </View>
                </Card.Content>
              </Card>
            )}

            {/* Statistics */}
            {locations.length > 0 && (
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Track Statistics</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.colors.text }]}>Points</Text>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>{locations.length}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.colors.text }]}>Distance</Text>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>
                        {totalDistance > 1000
                          ? `${(totalDistance / 1000).toFixed(2)} km`
                          : `${Math.round(totalDistance)} m`}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.colors.text }]}>Duration</Text>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>
                        {Math.floor(duration / 3600)}h {Math.floor((duration % 3600) / 60)}m {Math.floor(duration % 60)}
                        s
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.colors.text }]}>Avg Speed</Text>
                      <Text style={[styles.statValue, { color: theme.colors.text }]}>
                        {duration > 0 ? `${((totalDistance / duration) * 3.6).toFixed(1)} km/h` : "0 km/h"}
                      </Text>
                    </View>
                    {maxSpeed > 0 && (
                      <View style={styles.statItem}>
                        <Text style={[styles.statLabel, { color: theme.colors.text }]}>Max Speed</Text>
                        <Text style={[styles.statValue, { color: theme.colors.text }]}>
                          {(maxSpeed * 3.6).toFixed(1)} km/h
                        </Text>
                      </View>
                    )}
                    {elevation.gain > 0 && (
                      <>
                        <View style={styles.statItem}>
                          <Text style={[styles.statLabel, { color: theme.colors.text }]}>Elevation Gain</Text>
                          <Text style={[styles.statValue, { color: theme.colors.text }]}>
                            {Math.round(elevation.gain)}m
                          </Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={[styles.statLabel, { color: theme.colors.text }]}>Elevation Loss</Text>
                          <Text style={[styles.statValue, { color: theme.colors.text }]}>
                            {Math.round(elevation.loss)}m
                          </Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={[styles.statLabel, { color: theme.colors.text }]}>Altitude Range</Text>
                          <Text style={[styles.statValue, { color: theme.colors.text }]}>
                            {Math.round(elevation.min)}m - {Math.round(elevation.max)}m
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </Card.Content>
              </Card>
            )}

            {/* Map View */}
            {locations.length > 0 && (
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <View style={styles.mapHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                      {viewingTrack ? `Track: ${viewingTrack.name}` : "Live Track Map"}
                    </Text>
                    <Button
                      mode="outlined"
                      onPress={() => setIsMapFullscreen(true)}
                      style={styles.fullscreenButton}
                      icon="fullscreen"
                    >
                      Fullscreen
                    </Button>
                  </View>
                  <View style={styles.mapContainer}>
                    <MapComponent
                      locations={locations}
                      currentLocation={currentLocation}
                      isTracking={isTracking}
                      isDarkTheme={isDarkTheme}
                      style={styles.map}
                      showLayerSelector={false}
                    />
                  </View>
                </Card.Content>
              </Card>
            )}
          </ScrollView>

          {/* Fullscreen Map Modal */}
          <Portal>
            <Modal
              visible={isMapFullscreen}
              onDismiss={() => setIsMapFullscreen(false)}
              style={styles.fullscreenModal}
              contentContainerStyle={styles.fullscreenModalContent}
            >
              <View style={styles.fullscreenMapContainer}>
                <MapComponent
                  locations={locations}
                  currentLocation={currentLocation}
                  isTracking={isTracking}
                  isDarkTheme={isDarkTheme}
                  style={styles.fullscreenMap}
                  showLayerSelector={true}
                  isFullscreen={true}
                  onExitFullscreen={() => setIsMapFullscreen(false)}
                />
              </View>
            </Modal>
          </Portal>

          {/* Track Name Dialog */}
          <Portal>
            <Modal
              visible={showTrackNameDialog}
              onDismiss={() => setShowTrackNameDialog(false)}
              contentContainerStyle={styles.modalContainer}
            >
              <Card style={{ backgroundColor: theme.colors.surface }}>
                <Card.Content>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Name Your Track</Text>
                  <TextInput
                    value={trackNameInput}
                    onChangeText={setTrackNameInput}
                    placeholder="Enter track name..."
                    style={styles.textInput}
                    mode="outlined"
                  />
                  <View style={styles.modalButtons}>
                    <Button mode="outlined" onPress={() => setShowTrackNameDialog(false)} style={styles.modalButton}>
                      Cancel
                    </Button>
                    <Button
                      mode="contained"
                      onPress={() => handleStartTracking(trackNameInput)}
                      disabled={!trackNameInput.trim()}
                      style={styles.modalButton}
                    >
                      Start Tracking
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            </Modal>
          </Portal>
        </SafeAreaView>
      </SafeAreaProvider>
    </PaperProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  headerBadge: {
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
  },
  headerButtonText: {
    marginLeft: 4,
    fontSize: 12,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  controlButtons: {
    gap: 12,
  },
  controlButton: {
    marginBottom: 8,
  },
  stopButton: {
    backgroundColor: "#ef4444",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallButton: {
    flex: 1,
    minWidth: 80,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
  },
  trackingBadge: {
    backgroundColor: "#10b981",
  },
  stoppedBadge: {
    backgroundColor: "#6b7280",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  liveText: {
    fontSize: 12,
    color: "#10b981",
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  locationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  locationItem: {
    flex: 1,
    minWidth: "45%",
  },
  locationLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: "30%",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
  },
  mapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  fullscreenButton: {
    marginLeft: 8,
  },
  mapContainer: {
    height: 300,
    borderRadius: 8,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  fullscreenModal: {
    margin: 0,
  },
  fullscreenModalContent: {
    flex: 1,
    margin: 0,
  },
  fullscreenMapContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  fullscreenMap: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  textInput: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    minWidth: 100,
  },
})

export default App
