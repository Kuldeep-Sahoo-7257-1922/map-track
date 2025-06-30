"use client"

import type React from "react"
import { useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  AppState,
  BackHandler,
} from "react-native"
import { Provider as PaperProvider, Card, Button, Badge, Portal, Modal, TextInput } from "react-native-paper"
import { MaterialIcons } from "@expo/vector-icons"
import * as Location from "expo-location"
import * as FileSystem from "expo-file-system"
import * as Sharing from "expo-sharing"
import * as DocumentPicker from "expo-document-picker"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"

import MapComponent from "./src/components/MapView"
import TrackList from "./src/components/TrackList"
import CrashGuard from "./src/components/CrashGuard"
import ErrorBoundary from "./src/components/ErrorBoundary"
import { storageUtils } from "./src/utils/storage"
import { generateKML, generateGPX, parseKMLFile, parseGPXFile } from "./src/utils/fileUtils"
import { BackgroundLocationService } from "./src/services/BackgroundLocationService"
import { useAsyncSafeState, useAsyncOperation } from "./src/hooks/useAsyncSafeState"
import type { LocationPoint, SavedTrack } from "./src/types"

const App: React.FC = () => {
  const [isTracking, setIsTracking] = useAsyncSafeState(false)
  const [locations, setLocations] = useAsyncSafeState<LocationPoint[]>([])
  const [currentLocation, setCurrentLocation] = useAsyncSafeState<LocationPoint | null>(null)
  const [error, setError] = useAsyncSafeState<string>("")
  const [isDarkTheme, setIsDarkTheme] = useAsyncSafeState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useAsyncSafeState(false)
  const [showTrackNameDialog, setShowTrackNameDialog] = useAsyncSafeState(false)
  const [showTrackList, setShowTrackList] = useAsyncSafeState(false)
  const [savedTracks, setSavedTracks] = useAsyncSafeState<SavedTrack[]>([])
  const [currentTrackId, setCurrentTrackId] = useAsyncSafeState<string | null>(null)
  const [currentTrackName, setCurrentTrackName] = useAsyncSafeState<string>("")
  const [viewingTrack, setViewingTrack] = useAsyncSafeState<SavedTrack | null>(null)
  const [trackNameInput, setTrackNameInput] = useAsyncSafeState("")
  const [isAppActive, setIsAppActive] = useAsyncSafeState(true)
  const [isBackgroundTracking, setIsBackgroundTracking] = useAsyncSafeState(false)
  const [isInitialized, setIsInitialized] = useAsyncSafeState(false)
  const [lastSaveTime, setLastSaveTime] = useAsyncSafeState<number>(0)

  const locationSubscription = useRef<Location.LocationSubscription | null>(null)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const appStateRef = useRef(AppState.currentState)
  const { executeAsync } = useAsyncOperation()
  const isUnmountedRef = useRef(false)

  // Auto-save interval in milliseconds (10 seconds)
  const AUTO_SAVE_INTERVAL = 10000

  // Global error handler to prevent crashes - REACT NATIVE VERSION
  const globalErrorHandler = useCallback(
    (error: any, isFatal?: boolean) => {
      console.error("Global error caught:", error)

      try {
        // Save current state before potential crash
        if (isTracking && currentTrackId && locations.length > 0) {
          saveCurrentTrack(false).catch(console.error)
        }

        // Set user-friendly error message
        if (!isUnmountedRef.current) {
          setError(`App error: ${error?.message || "Unknown error"}. App will continue running.`)
        }
      } catch (e) {
        console.error("Error in error handler:", e)
      }
    },
    [isTracking, currentTrackId, locations, setError],
  )

  // Set up global error handlers - REACT NATIVE VERSION (NO WINDOW)
  useEffect(() => {
    const originalConsoleError = console.error
    console.error = (...args) => {
      originalConsoleError(...args)
      if (args[0] && typeof args[0] === "string" && args[0].includes("Error")) {
        globalErrorHandler(new Error(args.join(" ")))
      }
    }

    // React Native doesn't have window.addEventListener
    // Error handling is done through ErrorBoundary and CrashGuard components

    return () => {
      console.error = originalConsoleError
    }
  }, [globalErrorHandler])

  // Safe error handler
  const handleError = useCallback(
    (error: any, context: string) => {
      try {
        console.error(`Error in ${context}:`, error)
        const errorMessage = error?.message || error?.toString() || "Unknown error"
        if (!isUnmountedRef.current) {
          setError(`${context}: ${errorMessage}`)
        }
      } catch (e) {
        console.error("Error in handleError:", e)
      }
    },
    [setError],
  )

  // Safe async wrapper with retry mechanism
  const safeAsync = useCallback(
    async (operation: () => Promise<void>, context: string, retries = 3): Promise<void> => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          if (isUnmountedRef.current) return
          await executeAsync(operation)
          return
        } catch (error) {
          console.error(`Attempt ${attempt} failed for ${context}:`, error)
          if (attempt === retries) {
            handleError(error, context)
          } else {
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
          }
        }
      }
    },
    [executeAsync, handleError],
  )

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      try {
        if (isMapFullscreen) {
          setIsMapFullscreen(false)
          return true
        }
        if (showTrackNameDialog) {
          setShowTrackNameDialog(false)
          return true
        }
        if (showTrackList) {
          setShowTrackList(false)
          return true
        }

        // If tracking is active, warn user before exiting
        if (isTracking) {
          Alert.alert(
            "Location Tracking Active",
            "Location tracking is active. The app will continue tracking in the background if you exit.",
            [
              { text: "Continue Tracking", style: "default" },
              {
                text: "Stop & Exit",
                style: "destructive",
                onPress: () => {
                  stopTracking().finally(() => {
                    BackHandler.exitApp()
                  })
                },
              },
            ],
          )
          return true
        }

        return false
      } catch (error) {
        console.error("Back handler error:", error)
        return false
      }
    })

    return () => backHandler.remove()
  }, [isMapFullscreen, showTrackNameDialog, showTrackList, isTracking])

  // Handle app state changes with background tracking - SIMPLIFIED
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      try {
        console.log("App state changed:", appStateRef.current, "->", nextAppState)

        if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
          setIsAppActive(true)
          console.log("App has come to the foreground")

          // Check if background tracking was active and sync data
          const isBackgroundActive = await BackgroundLocationService.isBackgroundLocationRunning()
          if (isBackgroundActive) {
            await syncBackgroundData()
          }
        } else if (nextAppState.match(/inactive|background/)) {
          setIsAppActive(false)
          console.log("App has gone to the background")

          // Save current progress before going to background
          if (isTracking && currentTrackId && locations.length > 0) {
            await saveCurrentTrack(false)
          }

          // For now, we'll disable automatic background tracking to avoid permission issues
          // Users can manually enable it later when they have a development build
          console.log("Background tracking disabled in Expo Go - use development build for full functionality")
        }

        appStateRef.current = nextAppState
      } catch (error) {
        console.error("App state change error:", error)
        handleError(error, "App state change")
      }
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange)
    return () => subscription?.remove()
  }, [isTracking, currentTrackId, currentTrackName, locations, setIsAppActive, setIsBackgroundTracking, handleError])

  // Sync background data when app comes to foreground
  const syncBackgroundData = useCallback(async () => {
    try {
      console.log("Syncing background data...")
      const currentTrackInfo = await BackgroundLocationService.getCurrentTrackingInfo()

      if (currentTrackInfo && currentTrackInfo.trackId) {
        const track = await storageUtils.getTrack(currentTrackInfo.trackId)
        if (track) {
          if (!isUnmountedRef.current) {
            setLocations(track.locations)
            setCurrentTrackId(track.id)
            setCurrentTrackName(track.name)
            setIsTracking(true)

            if (track.locations.length > 0) {
              setCurrentLocation(track.locations[track.locations.length - 1])
            }
          }

          console.log("Background data synced:", track.locations.length, "locations")
        }
      }
    } catch (error) {
      console.error("Background sync error:", error)
      handleError(error, "Background data sync")
    }
  }, [setLocations, setCurrentTrackId, setCurrentTrackName, setIsTracking, setCurrentLocation, handleError])

  // Initialize app and check for existing background tracking
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("Initializing app...")

        // Load saved tracks with error handling
        try {
          const tracks = await storageUtils.getAllTracks()
          if (!isUnmountedRef.current) {
            setSavedTracks(tracks || [])
          }
        } catch (error) {
          console.error("Error loading tracks:", error)
          setSavedTracks([])
        }

        // Check if background tracking is active
        try {
          const isBackgroundActive = await BackgroundLocationService.isBackgroundLocationRunning()
          if (isBackgroundActive && !isUnmountedRef.current) {
            setIsBackgroundTracking(true)
            await syncBackgroundData()
          }
        } catch (error) {
          console.error("Error checking background tracking:", error)
        }

        if (!isUnmountedRef.current) {
          setIsInitialized(true)
        }
        console.log("App initialized successfully")
      } catch (error) {
        console.error("App initialization error:", error)
        handleError(error, "App initialization")
        // Set initialized anyway to prevent infinite loading
        if (!isUnmountedRef.current) {
          setIsInitialized(true)
        }
      }
    }

    initializeApp()
  }, [setSavedTracks, setIsBackgroundTracking, syncBackgroundData, handleError, setIsInitialized])

  // Request location permissions with comprehensive error handling
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      console.log("Requesting location permissions...")

      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync()
      if (!isLocationEnabled) {
        setError("Location services are disabled. Please enable location services in your device settings.")
        return false
      }

      // Request foreground permission
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync()
      if (foregroundStatus !== "granted") {
        setError("Location permission denied. Please grant location permission to use this app.")
        return false
      }

      // Request background permission for continuous tracking
      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync()
        if (backgroundStatus !== "granted") {
          console.log("Background location permission denied - tracking will pause when app is closed")
          Alert.alert(
            "Background Location",
            "For continuous tracking when the app is closed, please grant 'Allow all the time' location permission in your device settings. Note: Full background tracking requires a development build.",
            [{ text: "OK" }],
          )
        }
      } catch (bgError) {
        console.error("Background permission error:", bgError)
        // Continue without background permission
      }

      console.log("Location permissions granted")
      return true
    } catch (error) {
      console.error("Permission request error:", error)
      handleError(error, "Location permission request")
      return false
    }
  }, [setError, handleError])

  // 🔄 AUTOMATIC SAVE SYSTEM - Enhanced with immediate saves
  useEffect(() => {
    if (isTracking && currentTrackId && locations.length > 0 && isAppActive && !isBackgroundTracking) {
      console.log("🔄 Starting automatic save system...")

      // Clear any existing interval
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }

      // Set up automatic saving every 10 seconds
      autoSaveIntervalRef.current = setInterval(() => {
        console.log("💾 Auto-saving track progress...")
        safeAsync(async () => {
          await saveCurrentTrack(false)
          setLastSaveTime(Date.now())
        }, "Auto-save").catch(console.error)
      }, AUTO_SAVE_INTERVAL)

      console.log("✅ Automatic save system activated (every 10 seconds)")
    } else {
      if (autoSaveIntervalRef.current) {
        console.log("⏹️ Stopping automatic save system")
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }
  }, [isTracking, currentTrackId, locations.length, isAppActive, isBackgroundTracking, safeAsync, setLastSaveTime])

  // 💾 IMMEDIATE SAVE on location updates (every 5 new points)
  useEffect(() => {
    if (isTracking && currentTrackId && locations.length > 0) {
      // Save immediately every 5 location points
      if (locations.length % 5 === 0) {
        console.log(`💾 Immediate save triggered at ${locations.length} points`)
        safeAsync(async () => {
          await saveCurrentTrack(false)
          setLastSaveTime(Date.now())
        }, "Immediate save").catch(console.error)
      }
    }
  }, [locations.length, isTracking, currentTrackId, safeAsync, setLastSaveTime])

  // Save current track to storage with comprehensive error handling
  const saveCurrentTrack = useCallback(
    async (isComplete = false): Promise<void> => {
      if (!currentTrackId || !currentTrackName || locations.length === 0) {
        console.log("Cannot save track: missing data")
        return
      }

      try {
        console.log(`💾 Saving track: "${currentTrackName}" with ${locations.length} points (Complete: ${isComplete})`)
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
        try {
          const tracks = await storageUtils.getAllTracks()
          if (!isUnmountedRef.current) {
            setSavedTracks(tracks || [])
          }
        } catch (error) {
          console.error("Error refreshing tracks:", error)
        }

        console.log(`✅ Track saved successfully: ${locations.length} points, ${(stats.distance / 1000).toFixed(2)}km`)
      } catch (error) {
        console.error("Save track error:", error)
        handleError(error, "Save track")
      }
    },
    [currentTrackId, currentTrackName, locations, setSavedTracks, handleError],
  )

  // Start new tracking
  const handleStartTracking = useCallback(
    async (trackName: string) => {
      await safeAsync(async () => {
        setShowTrackNameDialog(false)
        setCurrentTrackName(trackName)
        const newTrackId = Date.now().toString()
        setCurrentTrackId(newTrackId)
        setViewingTrack(null)
        setError("")
        setLastSaveTime(0)
        await startTracking()
      }, "Start tracking")
    },
    [
      setShowTrackNameDialog,
      setCurrentTrackName,
      setCurrentTrackId,
      setViewingTrack,
      setError,
      setLastSaveTime,
      safeAsync,
    ],
  )

  // Resume existing track
  const handleResumeTrack = useCallback(
    async (track: SavedTrack) => {
      await safeAsync(async () => {
        setCurrentTrackId(track.id)
        setCurrentTrackName(track.name)
        setLocations([...track.locations])
        setViewingTrack(null)
        setShowTrackList(false)
        setError("")
        setLastSaveTime(Date.now())

        if (track.locations.length > 0) {
          setCurrentLocation(track.locations[track.locations.length - 1])
        }

        // Mark track as incomplete since we're resuming
        const updatedTrack = { ...track, isComplete: false, lastModified: Date.now() }
        await storageUtils.saveTrack(updatedTrack)

        const tracks = await storageUtils.getAllTracks()
        setSavedTracks(tracks || [])

        await startTracking()
      }, "Resume track")
    },
    [
      setCurrentTrackId,
      setCurrentTrackName,
      setLocations,
      setViewingTrack,
      setShowTrackList,
      setError,
      setLastSaveTime,
      setCurrentLocation,
      setSavedTracks,
      safeAsync,
    ],
  )

  // View existing track
  const handleViewTrack = useCallback(
    (track: SavedTrack) => {
      try {
        console.log("Viewing track:", track.name)
        setViewingTrack(track)
        setCurrentTrackId(null)
        setCurrentTrackName("")
        setIsTracking(false)
        setShowTrackList(false)
        setLastSaveTime(0)

        // Stop any active location tracking
        if (locationSubscription.current) {
          locationSubscription.current.remove()
          locationSubscription.current = null
        }

        setTimeout(() => {
          if (!isUnmountedRef.current) {
            setLocations(track.locations || [])
            setCurrentLocation(track.locations?.[0] || null)
          }
        }, 100)
      } catch (error) {
        console.error("View track error:", error)
        handleError(error, "View track")
      }
    },
    [
      setViewingTrack,
      setCurrentTrackId,
      setCurrentTrackName,
      setIsTracking,
      setShowTrackList,
      setLastSaveTime,
      setLocations,
      setCurrentLocation,
      handleError,
    ],
  )

  // Start tracking location with comprehensive error handling and fallback
  const startTracking = useCallback(async (): Promise<void> => {
    try {
      console.log("🚀 Starting location tracking...")

      const hasPermission = await requestLocationPermission()
      if (!hasPermission) {
        return
      }

      setError("")
      setIsTracking(true)

      // Get initial position with timeout and error handling
      console.log("📍 Getting initial position...")
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // Use Balanced for better compatibility
          timeout: 15000,
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

        console.log("📍 Initial location:", newLocation)
        if (!isUnmountedRef.current) {
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
        }
      } catch (locationError) {
        console.error("Initial location error:", locationError)
        // Continue with watch position even if initial location fails
      }

      // Start watching position with error handling and fallback settings
      console.log("👁️ Starting location watch...")
      try {
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced, // Use Balanced for better compatibility
            timeInterval: 5000, // 5 seconds
            distanceInterval: 5, // 5 meters
          },
          (location) => {
            try {
              if (isUnmountedRef.current) return

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
            } catch (error) {
              console.error("Error processing location update:", error)
            }
          },
        )
      } catch (watchError) {
        console.error("Watch position error:", watchError)

        // Try with even more conservative settings
        try {
          console.log("Retrying with conservative settings...")
          locationSubscription.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Low, // Use Low accuracy as fallback
              timeInterval: 10000, // 10 seconds
              distanceInterval: 10, // 10 meters
            },
            (location) => {
              try {
                if (isUnmountedRef.current) return

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
              } catch (error) {
                console.error("Error processing location update:", error)
              }
            },
          )
        } catch (fallbackError) {
          console.error("Fallback location settings also failed:", fallbackError)
          throw fallbackError
        }
      }

      console.log("✅ Location tracking started successfully with automatic saving")
    } catch (error) {
      console.error("Start tracking error:", error)
      handleError(error, "Start location tracking")
      if (!isUnmountedRef.current) {
        setIsTracking(false)
      }
    }
  }, [requestLocationPermission, setError, setIsTracking, setCurrentLocation, setLocations, handleError])

  // Stop tracking with proper cleanup
  const stopTracking = useCallback(async () => {
    await safeAsync(async () => {
      console.log("⏹️ Stopping location tracking...")
      setIsTracking(false)

      // Stop foreground location tracking
      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove()
          locationSubscription.current = null
          console.log("Location subscription removed")
        } catch (error) {
          console.error("Error removing location subscription:", error)
        }
      }

      // Stop background location tracking
      try {
        await BackgroundLocationService.stopBackgroundLocationTracking()
        setIsBackgroundTracking(false)
      } catch (error) {
        console.error("Error stopping background tracking:", error)
      }

      // Save final track
      if (currentTrackId && locations.length > 0) {
        try {
          await saveCurrentTrack(true)
          console.log("✅ Final track save completed")
        } catch (error) {
          console.error("Error saving final track:", error)
        }
      }
    }, "Stop tracking")
  }, [setIsTracking, setIsBackgroundTracking, currentTrackId, locations, saveCurrentTrack, safeAsync])

  // Download KML file with error handling
  const downloadKML = useCallback(
    async (track?: SavedTrack) => {
      await safeAsync(async () => {
        const trackData = track || { name: currentTrackName || "Current Track", locations }
        if (!trackData.locations || trackData.locations.length === 0) {
          setError("No location data to download")
          return
        }

        console.log("Generating KML for:", trackData.name)
        const kmlContent = generateKML(trackData.locations, trackData.name)
        const filename = `${(trackData.name || "track").replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.kml`
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
      }, "Download KML")
    },
    [currentTrackName, locations, setError, safeAsync],
  )

  // Download GPX file with error handling
  const downloadGPX = useCallback(
    async (track?: SavedTrack) => {
      await safeAsync(async () => {
        const trackData = track || { name: currentTrackName || "Current Track", locations }
        if (!trackData.locations || trackData.locations.length === 0) {
          setError("No location data to download")
          return
        }

        console.log("Generating GPX for:", trackData.name)
        const gpxContent = generateGPX(trackData.locations, trackData.name)
        const filename = `${(trackData.name || "track").replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.gpx`
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
      }, "Download GPX")
    },
    [currentTrackName, locations, setError, safeAsync],
  )

  // Delete track with error handling
  const deleteTrack = useCallback(
    async (trackId: string) => {
      await safeAsync(async () => {
        await storageUtils.deleteTrack(trackId)
        const tracks = await storageUtils.getAllTracks()
        setSavedTracks(tracks || [])

        if (viewingTrack?.id === trackId) {
          setViewingTrack(null)
          setLocations([])
          setCurrentLocation(null)
        }
      }, "Delete track")
    },
    [setSavedTracks, viewingTrack, setViewingTrack, setLocations, setCurrentLocation, safeAsync],
  )

  // Clear current data with confirmation
  const clearData = useCallback(() => {
    try {
      Alert.alert("Clear Data", "Are you sure you want to clear current data? Unsaved data will be lost.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            try {
              setLocations([])
              setCurrentLocation(null)
              setError("")
              setCurrentTrackId(null)
              setCurrentTrackName("")
              setViewingTrack(null)
              setLastSaveTime(0)
            } catch (error) {
              console.error("Clear data error:", error)
              handleError(error, "Clear data")
            }
          },
        },
      ])
    } catch (error) {
      console.error("Clear data dialog error:", error)
    }
  }, [
    setLocations,
    setCurrentLocation,
    setError,
    setCurrentTrackId,
    setCurrentTrackName,
    setViewingTrack,
    setLastSaveTime,
    handleError,
  ])

  // Import file with comprehensive error handling
  const importFile = useCallback(async () => {
    await safeAsync(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const file = result.assets?.[0]
      if (!file || (!file.name?.toLowerCase().endsWith(".kml") && !file.name?.toLowerCase().endsWith(".gpx"))) {
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
      setSavedTracks(tracks || [])

      handleViewTrack(importedTrack)
      setError("")
    }, "Import file")
  }, [setError, setSavedTracks, handleViewTrack, safeAsync])

  // Calculate statistics safely
  const calculateDistance = useCallback(() => {
    try {
      if (!locations || locations.length < 2) return 0
      const stats = storageUtils.calculateTrackStats(locations)
      return stats.distance || 0
    } catch (error) {
      console.error("Error calculating distance:", error)
      return 0
    }
  }, [locations])

  const calculateElevation = useCallback(() => {
    try {
      if (!locations || locations.length < 2) return { gain: 0, loss: 0, min: 0, max: 0 }

      let gain = 0
      let loss = 0
      let min = locations[0]?.altitude || 0
      let max = locations[0]?.altitude || 0

      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1]
        const curr = locations[i]

        if (prev?.altitude && curr?.altitude) {
          const diff = curr.altitude - prev.altitude
          if (diff > 0) gain += diff
          else loss += Math.abs(diff)

          min = Math.min(min, curr.altitude)
          max = Math.max(max, curr.altitude)
        }
      }

      return { gain, loss, min, max }
    } catch (error) {
      console.error("Error calculating elevation:", error)
      return { gain: 0, loss: 0, min: 0, max: 0 }
    }
  }, [locations])

  const getMaxSpeed = useCallback(() => {
    try {
      if (!locations || locations.length === 0) return 0
      return Math.max(...locations.map((loc) => loc.speed || 0))
    } catch (error) {
      console.error("Error calculating max speed:", error)
      return 0
    }
  }, [locations])

  // Format last save time
  const formatLastSaveTime = useCallback(() => {
    if (!lastSaveTime) return "Not saved yet"
    const now = Date.now()
    const diff = Math.floor((now - lastSaveTime) / 1000)
    if (diff < 60) return `Saved ${diff}s ago`
    if (diff < 3600) return `Saved ${Math.floor(diff / 60)}m ago`
    return `Saved ${Math.floor(diff / 3600)}h ago`
  }, [lastSaveTime])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("App unmounting, cleaning up...")
      isUnmountedRef.current = true

      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove()
        } catch (error) {
          console.error("Error removing location subscription on unmount:", error)
        }
      }
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }
    }
  }, [])

  // Don't render until initialized
  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Initializing Location Tracker...</Text>
      </View>
    )
  }

  const totalDistance = calculateDistance()
  const duration =
    locations && locations.length > 0
      ? (locations[locations.length - 1]?.timestamp - locations[0]?.timestamp) / 1000
      : 0
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
    <ErrorBoundary>
      <CrashGuard>
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
                  {isBackgroundTracking && (
                    <Badge style={[styles.headerBadge, styles.backgroundBadge]}>Background Active</Badge>
                  )}
                </View>
                <View style={styles.headerRight}>
                  <TouchableOpacity onPress={() => setShowTrackList(!showTrackList)} style={styles.headerButton}>
                    <MaterialIcons name="folder" size={24} color={theme.colors.text} />
                    <Text style={[styles.headerButtonText, { color: theme.colors.text }]}>({savedTracks.length})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsDarkTheme(!isDarkTheme)} style={styles.headerButton}>
                    <MaterialIcons
                      name={isDarkTheme ? "wb-sunny" : "brightness-2"}
                      size={24}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Scrollable Content */}
              <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Control Buttons */}
                <CrashGuard>
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

                        <View style={styles.buttonRow}>
                          <Button
                            mode="outlined"
                            onPress={() => downloadKML()}
                            disabled={!locations || locations.length === 0}
                            style={styles.smallButton}
                            icon="download"
                          >
                            KML
                          </Button>
                          <Button
                            mode="outlined"
                            onPress={() => downloadGPX()}
                            disabled={!locations || locations.length === 0}
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

                      {/* Status with Auto-Save Info */}
                      <View style={styles.statusContainer}>
                        <Badge style={[styles.statusBadge, isTracking ? styles.trackingBadge : styles.stoppedBadge]}>
                          {isTracking ? "Tracking Active" : viewingTrack ? "Viewing Track" : "Tracking Stopped"}
                        </Badge>
                        {(isTracking || isBackgroundTracking) && (
                          <View style={styles.liveIndicator}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>
                              {isBackgroundTracking ? "Background • Auto-saving" : "Live • Auto-saving"}
                            </Text>
                          </View>
                        )}
                        {isTracking && lastSaveTime > 0 && (
                          <Text style={styles.saveStatus}>💾 {formatLastSaveTime()}</Text>
                        )}
                      </View>

                      {/* Auto-Save Information */}
                      {isTracking && (
                        <View style={styles.autoSaveInfo}>
                          <MaterialIcons name="save" size={16} color="#10b981" />
                          <Text style={styles.autoSaveText}>
                            Auto-saving every 10 seconds & every 5 location points
                          </Text>
                        </View>
                      )}

                      {/* Development Build Notice */}
                      <View style={styles.devNotice}>
                        <MaterialIcons name="info" size={16} color="#f59e0b" />
                        <Text style={styles.devNoticeText}>
                          For full background tracking, use a development build instead of Expo Go
                        </Text>
                      </View>

                      {/* Error Display */}
                      {error && (
                        <View style={styles.errorContainer}>
                          <Text style={styles.errorText}>{error}</Text>
                          <Button
                            mode="outlined"
                            onPress={() => setError("")}
                            style={styles.errorButton}
                            labelStyle={styles.errorButtonLabel}
                          >
                            Dismiss
                          </Button>
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                </CrashGuard>

                {/* Track List */}
                {showTrackList && (
                  <CrashGuard>
                    <TrackList
                      tracks={savedTracks || []}
                      onDownloadKML={downloadKML}
                      onDownloadGPX={downloadGPX}
                      onResume={handleResumeTrack}
                      onDelete={deleteTrack}
                      onView={handleViewTrack}
                      isDarkTheme={isDarkTheme}
                    />
                  </CrashGuard>
                )}

                {/* Current Location */}
                {currentLocation && (
                  <CrashGuard>
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
                              {currentLocation.latitude?.toFixed(6) || "N/A"}
                            </Text>
                          </View>
                          <View style={styles.locationItem}>
                            <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Longitude:</Text>
                            <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                              {currentLocation.longitude?.toFixed(6) || "N/A"}
                            </Text>
                          </View>
                          <View style={styles.locationItem}>
                            <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Time:</Text>
                            <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                              {currentLocation.timestamp
                                ? new Date(currentLocation.timestamp).toLocaleTimeString()
                                : "N/A"}
                            </Text>
                          </View>
                          <View style={styles.locationItem}>
                            <Text style={[styles.locationLabel, { color: theme.colors.text }]}>Accuracy:</Text>
                            <Text style={[styles.locationValue, { color: theme.colors.text }]}>
                              {currentLocation.accuracy ? Math.round(currentLocation.accuracy) + "m" : "Unknown"}
                            </Text>
                          </View>
                          {currentLocation.speed && currentLocation.speed > 0 && (
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
                  </CrashGuard>
                )}

                {/* Statistics */}
                {locations && locations.length > 0 && (
                  <CrashGuard>
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
                              {Math.floor(duration / 3600)}h {Math.floor((duration % 3600) / 60)}m{" "}
                              {Math.floor(duration % 60)}s
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
                  </CrashGuard>
                )}

                {/* Map View */}
                {locations && locations.length > 0 && (
                  <CrashGuard>
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
                  </CrashGuard>
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
                    <CrashGuard>
                      <MapComponent
                        locations={locations || []}
                        currentLocation={currentLocation}
                        isTracking={isTracking}
                        isDarkTheme={isDarkTheme}
                        style={styles.fullscreenMap}
                        showLayerSelector={true}
                        isFullscreen={true}
                        onExitFullscreen={() => setIsMapFullscreen(false)}
                      />
                    </CrashGuard>
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
                        <Button
                          mode="outlined"
                          onPress={() => setShowTrackNameDialog(false)}
                          style={styles.modalButton}
                        >
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
      </CrashGuard>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
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
  backgroundBadge: {
    backgroundColor: "#10b981",
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
    flexWrap: "wrap",
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
  saveStatus: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "500",
  },
  autoSaveInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    gap: 6,
  },
  autoSaveText: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "500",
  },
  devNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 6,
    gap: 6,
  },
  devNoticeText: {
    fontSize: 12,
    color: "#f59e0b",
    fontWeight: "500",
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
    marginBottom: 8,
  },
  errorButton: {
    alignSelf: "flex-start",
  },
  errorButtonLabel: {
    fontSize: 12,
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
