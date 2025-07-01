"use client";

import type React from "react";
import { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  BackHandler,
  TextInput,
  Animated,
  Dimensions,
} from "react-native";
import {
  Provider as PaperProvider,
  Portal,
  Modal,
  FAB,
  Switch,
} from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import MapComponent from "./src/components/MapView";
import CrashGuard from "./src/components/CrashGuard";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { storageUtils } from "./src/utils/storage";
import {
  generateKML,
  generateGPX,
  parseKMLFile,
  parseGPXFile,
} from "./src/utils/fileUtils";
import {
  useAsyncSafeState,
  useAsyncOperation,
} from "./src/hooks/useAsyncSafeState";
import {
  LocationService,
  BackgroundLocationService,
} from "./src/services/LocationService";
import type { LocationPoint, SavedTrack } from "./src/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

const App: React.FC = () => {
  const [isTracking, setIsTracking] = useAsyncSafeState(false);
  const [isPaused, setIsPaused] = useAsyncSafeState(false);
  const [locations, setLocations] = useAsyncSafeState<LocationPoint[]>([]);
  const [currentLocation, setCurrentLocation] =
    useAsyncSafeState<LocationPoint | null>(null);
  const [error, setError] = useAsyncSafeState<string>("");
  const [isDarkTheme, setIsDarkTheme] = useAsyncSafeState(true);
  const [showTrackNameDialog, setShowTrackNameDialog] =
    useAsyncSafeState(false);
  const [showAboutDialog, setShowAboutDialog] = useAsyncSafeState(false);
  const [savedTracks, setSavedTracks] = useAsyncSafeState<SavedTrack[]>([]);
  const [currentTrackId, setCurrentTrackId] = useAsyncSafeState<string | null>(
    null
  );
  const [currentTrackName, setCurrentTrackName] = useAsyncSafeState<string>("");
  const [viewingTrack, setViewingTrack] = useAsyncSafeState<SavedTrack | null>(
    null
  );
  const [selectedTracks, setSelectedTracks] = useAsyncSafeState<SavedTrack[]>(
    []
  );
  const [trackNameInput, setTrackNameInput] = useAsyncSafeState("");
  const [isInitialized, setIsInitialized] = useAsyncSafeState(false);
  const [searchQuery, setSearchQuery] = useAsyncSafeState("");
  const [isDrawerOpen, setIsDrawerOpen] = useAsyncSafeState(false);

  // Enhanced GPS Status states
  const [gpsStatus, setGpsStatus] = useAsyncSafeState<
    "searching" | "connected" | "poor" | "disconnected"
  >("disconnected");
  const [satelliteInfo, setSatelliteInfo] = useAsyncSafeState<{
    total: number;
    used: number;
    constellations: string[];
  }>({ total: 0, used: 0, constellations: [] });
  const [lastLocationTime, setLastLocationTime] = useAsyncSafeState<number>(0);

  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { executeAsync } = useAsyncOperation();
  const isUnmountedRef = useRef(false);
  const drawerAnimation = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const locationService = useRef(LocationService.getInstance());

  const AUTO_SAVE_INTERVAL = 10000;

  // Safe error handler
  const handleError = useCallback(
    (error: any, context: string) => {
      try {
        console.error(`Error in ${context}:`, error);
        const errorMessage =
          error?.message || error?.toString() || "Unknown error";
        if (!isUnmountedRef.current) {
          setError(`${context}: ${errorMessage}`);
        }
      } catch (e) {
        console.error("Error in handleError:", e);
      }
    },
    [setError]
  );

  // Safe async wrapper
  const safeAsync = useCallback(
    async (
      operation: () => Promise<void>,
      context: string,
      retries = 3
    ): Promise<void> => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          if (isUnmountedRef.current) return;
          await executeAsync(operation);
          return;
        } catch (error) {
          console.error(`Attempt ${attempt} failed for ${context}:`, error);
          if (attempt === retries) {
            handleError(error, context);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    },
    [executeAsync, handleError]
  );

  // Update GPS status based on location updates and satellite info
  const updateGpsStatus = useCallback(
    (location: LocationPoint, satInfo: any) => {
      const now = Date.now();
      setLastLocationTime(now);
      setSatelliteInfo(satInfo);

      const accuracy = location.accuracy || 999;
      const usedSatellites = satInfo.used || 0;

      // Determine GPS status based on accuracy and satellite count
      if (accuracy <= 5 && usedSatellites >= 8) {
        setGpsStatus("connected");
      } else if (accuracy <= 20 && usedSatellites >= 4) {
        setGpsStatus("poor");
      } else if (usedSatellites >= 3) {
        setGpsStatus("searching");
      } else {
        setGpsStatus("disconnected");
      }
    },
    [setGpsStatus, setSatelliteInfo, setLastLocationTime]
  );

  // Monitor GPS status
  useEffect(() => {
    if (!isTracking) {
      setGpsStatus("disconnected");
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      return;
    }

    const statusInterval = setInterval(() => {
      const timeSinceLastLocation = Date.now() - lastLocationTime;

      if (timeSinceLastLocation > 30000) {
        // No location for 30 seconds
        setGpsStatus("disconnected");
        setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      } else if (timeSinceLastLocation > 15000) {
        // No location for 15 seconds
        setGpsStatus("searching");
        setSatelliteInfo((prev) => ({
          ...prev,
          used: Math.max(0, prev.used - 2),
        }));
      }
    }, 5000);

    return () => clearInterval(statusInterval);
  }, [isTracking, lastLocationTime, setGpsStatus, setSatelliteInfo]);

  // Drawer animation functions
  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    Animated.timing(drawerAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [drawerAnimation, setIsDrawerOpen]);

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnimation, {
      toValue: -DRAWER_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsDrawerOpen(false);
    });
  }, [drawerAnimation, setIsDrawerOpen]);

  // Clear all selected tracks
  const clearAllTracks = useCallback(() => {
    setSelectedTracks([]);
    setViewingTrack(null);
    setShowAboutDialog(false);
  }, [setSelectedTracks, setViewingTrack, setShowAboutDialog]);

  // Initialize app and location service
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("Initializing app...");

        // Load saved tracks
        const tracks = await storageUtils.getAllTracks();
        if (!isUnmountedRef.current) {
          setSavedTracks(tracks || []);
        }

        // Setup location service callbacks
        const locationService = LocationService.getInstance();

        locationService.addLocationCallback(
          (location: LocationPoint, satInfo: any) => {
            if (!isUnmountedRef.current) {
              setCurrentLocation(location);
              updateGpsStatus(location, satInfo);

              // Only add to locations if tracking and not paused
              if (isTracking && !isPaused) {
                setLocations((prev) => [...prev, location]);
              }
            }
          }
        );

        locationService.addErrorCallback((errorMessage: string) => {
          if (!isUnmountedRef.current) {
            setError(errorMessage);
            setGpsStatus("disconnected");
            setSatelliteInfo({ total: 0, used: 0, constellations: [] });
          }
        });

        setIsInitialized(true);
        console.log("✅ App initialized successfully");
      } catch (error) {
        console.error("App initialization error:", error);
        handleError(error, "App initialization");
        if (!isUnmountedRef.current) {
          setIsInitialized(true);
        }
      }
    };

    initializeApp();
  }, [
    setSavedTracks,
    handleError,
    setIsInitialized,
    setCurrentLocation,
    updateGpsStatus,
    isTracking,
    isPaused,
    setLocations,
    setError,
    setGpsStatus,
    setSatelliteInfo,
  ]);

  // Save current track to storage
  const saveCurrentTrack = useCallback(
    async (isComplete = false): Promise<void> => {
      if (!currentTrackId || !currentTrackName || locations.length === 0) {
        console.log("Cannot save track: missing data");
        return;
      }

      try {
        console.log(
          `💾 Saving track: "${currentTrackName}" with ${locations.length} points`
        );
        const stats = storageUtils.calculateTrackStats(locations);
        const track: SavedTrack = {
          id: currentTrackId,
          name: currentTrackName,
          locations: [...locations],
          createdAt: locations[0]?.timestamp || Date.now(),
          lastModified: Date.now(),
          isComplete,
          totalDistance: stats.distance,
          duration: stats.duration,
        };

        await storageUtils.saveTrack(track);
        const tracks = await storageUtils.getAllTracks();
        if (!isUnmountedRef.current) {
          setSavedTracks(tracks || []);
        }

        console.log(`✅ Track saved successfully`);
      } catch (error) {
        console.error("Save track error:", error);
        handleError(error, "Save track");
      }
    },
    [currentTrackId, currentTrackName, locations, setSavedTracks, handleError]
  );

  // Start new tracking
  const handleStartTracking = useCallback(
    async (trackName: string) => {
      if (!trackName.trim()) {
        setError("Please enter a track name");
        return;
      }

      await safeAsync(async () => {
        // Stop any existing tracking first
        if (isTracking) {
          await locationService.current.stopTracking();
          setIsTracking(false);
        }

        setShowTrackNameDialog(false);
        setCurrentTrackName(trackName.trim());
        const newTrackId = Date.now().toString();
        setCurrentTrackId(newTrackId);
        setViewingTrack(null);
        setSelectedTracks([]);
        setError("");
        setLocations([]);
        setCurrentLocation(null);
        setIsPaused(false);
        setGpsStatus("searching");
        setSatelliteInfo({ total: 0, used: 0, constellations: ["GPS"] });

        // Start location service
        const success = await locationService.current.startTracking();
        if (success) {
          setIsTracking(true);

          // Start background tracking
          await BackgroundLocationService.startBackgroundLocationTracking(
            newTrackId,
            trackName.trim()
          );

          console.log("✅ Tracking started successfully");
        } else {
          setError(
            "Failed to start GPS tracking. Please check your location settings."
          );
        }
      }, "Start tracking");
    },
    [
      setError,
      safeAsync,
      isTracking,
      setShowTrackNameDialog,
      setCurrentTrackName,
      setCurrentTrackId,
      setViewingTrack,
      setSelectedTracks,
      setLocations,
      setCurrentLocation,
      setIsPaused,
      setGpsStatus,
      setSatelliteInfo,
      setIsTracking,
    ]
  );

  // Stop tracking
  const stopTracking = useCallback(async () => {
    await safeAsync(async () => {
      console.log("⏹️ Stopping location tracking...");

      // Stop location service
      await locationService.current.stopTracking();

      // Stop background tracking
      await BackgroundLocationService.stopBackgroundLocationTracking();

      setIsTracking(false);
      setIsPaused(false);
      setGpsStatus("disconnected");
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });

      if (currentTrackId && locations.length > 0) {
        try {
          await saveCurrentTrack(true);
          console.log("✅ Final track save completed");
        } catch (error) {
          console.error("Error saving final track:", error);
        }
      }

      // Clear current tracking state
      setCurrentTrackId(null);
      setCurrentTrackName("");
    }, "Stop tracking");
  }, [
    safeAsync,
    setIsTracking,
    setIsPaused,
    setGpsStatus,
    setSatelliteInfo,
    currentTrackId,
    locations,
    saveCurrentTrack,
    setCurrentTrackId,
    setCurrentTrackName,
  ]);

  // Pause tracking
  const pauseTracking = useCallback(async () => {
    await safeAsync(async () => {
      console.log("⏸️ Pausing location tracking...");
      setIsPaused(true);
      setGpsStatus("disconnected");
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });

      // Stop location service but keep track data
      await locationService.current.stopTracking();

      // Save current progress
      if (currentTrackId && locations.length > 0) {
        await saveCurrentTrack(false);
      }
    }, "Pause tracking");
  }, [
    setIsPaused,
    setGpsStatus,
    setSatelliteInfo,
    currentTrackId,
    locations,
    saveCurrentTrack,
    safeAsync,
  ]);

  // Resume tracking
  const resumeTracking = useCallback(async () => {
    await safeAsync(async () => {
      console.log("▶️ Resuming location tracking...");
      setIsPaused(false);
      setGpsStatus("searching");
      setSatelliteInfo({ total: 0, used: 0, constellations: ["GPS"] });

      // Restart location service
      const success = await locationService.current.startTracking();
      if (success) {
        console.log("✅ Tracking resumed successfully");
      } else {
        setError(
          "Failed to resume GPS tracking. Please check your location settings."
        );
        setIsPaused(true);
        setGpsStatus("disconnected");
        setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      }
    }, "Resume tracking");
  }, [setIsPaused, setGpsStatus, setSatelliteInfo, setError, safeAsync]);

  // Auto-save system
  useEffect(() => {
    if (isTracking && !isPaused && currentTrackId && locations.length > 0) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }

      autoSaveIntervalRef.current = setInterval(() => {
        console.log("💾 Auto-saving track progress...");
        safeAsync(async () => {
          await saveCurrentTrack(false);
        }, "Auto-save").catch(console.error);
      }, AUTO_SAVE_INTERVAL);
    } else {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [
    isTracking,
    isPaused,
    currentTrackId,
    locations.length,
    safeAsync,
    saveCurrentTrack,
  ]);

  // Toggle track visibility
  const handleViewTrack = useCallback(
    (track: SavedTrack) => {
      try {
        console.log("Toggling track:", track.name);

        setSelectedTracks((prev) => {
          const isSelected = prev.some((t) => t.id === track.id);
          if (isSelected) {
            // Remove track from selection
            return prev.filter((t) => t.id !== track.id);
          } else {
            // Add track to selection
            return [...prev, track];
          }
        });

        setViewingTrack(null);
        // Don't clear current tracking when viewing tracks
      } catch (error) {
        console.error("Toggle track error:", error);
        handleError(error, "Toggle track");
      }
    },
    [setSelectedTracks, setViewingTrack, handleError]
  );

  // Resume existing track
  const handleResumeTrack = useCallback(
    async (track: SavedTrack) => {
      await safeAsync(async () => {
        // Stop any existing tracking first
        if (isTracking) {
          await stopTracking();
        }

        setCurrentTrackId(track.id);
        setCurrentTrackName(track.name);
        setLocations([...track.locations]); // Keep existing locations
        setViewingTrack(null);
        setSelectedTracks([]);
        setError("");
        setIsPaused(false);
        closeDrawer();

        if (track.locations.length > 0) {
          setCurrentLocation(track.locations[track.locations.length - 1]);
        }

        const updatedTrack = {
          ...track,
          isComplete: false,
          lastModified: Date.now(),
        };
        await storageUtils.saveTrack(updatedTrack);

        const tracks = await storageUtils.getAllTracks();
        setSavedTracks(tracks || []);

        // Start location service
        const success = await locationService.current.startTracking();
        if (success) {
          setIsTracking(true);
          setGpsStatus("searching");
          setSatelliteInfo({ total: 0, used: 0, constellations: ["GPS"] });

          // Start background tracking
          await BackgroundLocationService.startBackgroundLocationTracking(
            track.id,
            track.name
          );
        } else {
          setError(
            "Failed to resume GPS tracking. Please check your location settings."
          );
        }
      }, "Resume track");
    },
    [
      safeAsync,
      isTracking,
      stopTracking,
      setCurrentTrackId,
      setCurrentTrackName,
      setLocations,
      setViewingTrack,
      setSelectedTracks,
      setError,
      setIsPaused,
      closeDrawer,
      setCurrentLocation,
      setSavedTracks,
      setIsTracking,
      setGpsStatus,
      setSatelliteInfo,
    ]
  );

  // Download functions
  const downloadKML = useCallback(
    async (track?: SavedTrack) => {
      await safeAsync(async () => {
        const trackData = track || {
          name: currentTrackName || "Current Track",
          locations,
        };
        if (!trackData.locations || trackData.locations.length === 0) {
          setError("No location data to download");
          return;
        }

        const kmlContent = generateKML(trackData.locations, trackData.name);
        const filename = `${(trackData.name || "track").replace(
          /[^a-z0-9]/gi,
          "_"
        )}_${new Date().toISOString().split("T")[0]}.kml`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, kmlContent);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.google-earth.kml+xml",
            dialogTitle: "Share KML Track",
          });
        } else {
          Alert.alert("Success", `KML file saved to: ${fileUri}`);
        }
      }, "Download KML");
    },
    [currentTrackName, locations, setError, safeAsync]
  );

  const downloadGPX = useCallback(
    async (track?: SavedTrack) => {
      await safeAsync(async () => {
        const trackData = track || {
          name: currentTrackName || "Current Track",
          locations,
        };
        if (!trackData.locations || trackData.locations.length === 0) {
          setError("No location data to download");
          return;
        }

        const gpxContent = generateGPX(trackData.locations, trackData.name);
        const filename = `${(trackData.name || "track").replace(
          /[^a-z0-9]/gi,
          "_"
        )}_${new Date().toISOString().split("T")[0]}.gpx`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, gpxContent);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/gpx+xml",
            dialogTitle: "Share GPX Track",
          });
        } else {
          Alert.alert("Success", `GPX file saved to: ${fileUri}`);
        }
      }, "Download GPX");
    },
    [currentTrackName, locations, setError, safeAsync]
  );

  // Delete track
  const deleteTrack = useCallback(
    async (trackId: string) => {
      Alert.alert(
        "Delete Track",
        "Are you sure you want to delete this track?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              await safeAsync(async () => {
                await storageUtils.deleteTrack(trackId);
                const tracks = await storageUtils.getAllTracks();
                setSavedTracks(tracks || []);

                // Remove from selected tracks if it was selected
                setSelectedTracks((prev) =>
                  prev.filter((t) => t.id !== trackId)
                );
              }, "Delete track");
            },
          },
        ]
      );
    },
    [setSavedTracks, setSelectedTracks, safeAsync]
  );

  // Import file
  const importFile = useCallback(async () => {
    await safeAsync(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets?.[0];
      if (
        !file ||
        (!file.name?.toLowerCase().endsWith(".kml") &&
          !file.name?.toLowerCase().endsWith(".gpx"))
      ) {
        setError("Please select only KML or GPX files");
        return;
      }

      const content = await FileSystem.readAsStringAsync(file.uri);
      let locations: LocationPoint[] = [];

      if (file.name.toLowerCase().endsWith(".kml")) {
        locations = parseKMLFile(content);
      } else if (file.name.toLowerCase().endsWith(".gpx")) {
        locations = parseGPXFile(content);
      }

      if (locations.length === 0) {
        setError("No valid location data found in the file");
        return;
      }

      const stats = storageUtils.calculateTrackStats(locations);
      const importedTrack: SavedTrack = {
        id: `imported_${Date.now()}`,
        name: `Imported: ${file.name.replace(/\.(kml|gpx)$/i, "")}`,
        locations,
        createdAt: locations[0]?.timestamp || Date.now(),
        lastModified: Date.now(),
        isComplete: true,
        totalDistance: stats.distance,
        duration: stats.duration,
      };

      await storageUtils.saveTrack(importedTrack);
      const tracks = await storageUtils.getAllTracks();
      setSavedTracks(tracks || []);

      handleViewTrack(importedTrack);
      setError("");
    }, "Import file");
  }, [setError, setSavedTracks, handleViewTrack, safeAsync]);

  // Calculate statistics
  const calculateDistance = useCallback(() => {
    try {
      if (!locations || locations.length < 2) return 0;
      const stats = storageUtils.calculateTrackStats(locations);
      return stats.distance || 0;
    } catch (error) {
      console.error("Error calculating distance:", error);
      return 0;
    }
  }, [locations]);

  // Filter tracks based on search query
  const filteredTracks = savedTracks.filter((track) =>
    track.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        try {
          if (isDrawerOpen) {
            closeDrawer();
            return true;
          }
          if (showTrackNameDialog || showAboutDialog) {
            setShowTrackNameDialog(false);
            setShowAboutDialog(false);
            return true;
          }
          if (isTracking) {
            Alert.alert(
              "Location Tracking Active",
              "Location tracking is active. Do you want to stop tracking and exit?",
              [
                { text: "Continue Tracking", style: "default" },
                {
                  text: "Stop & Exit",
                  style: "destructive",
                  onPress: () => {
                    stopTracking().finally(() => {
                      BackHandler.exitApp();
                    });
                  },
                },
              ]
            );
            return true;
          }
          return false;
        } catch (error) {
          console.error("Back handler error:", error);
          return false;
        }
      }
    );

    return () => backHandler.remove();
  }, [
    isDrawerOpen,
    showTrackNameDialog,
    showAboutDialog,
    isTracking,
    closeDrawer,
    setShowTrackNameDialog,
    setShowAboutDialog,
    stopTracking,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      locationService.current.stopTracking();
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, []);

  // Don't render until initialized
  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Initializing Location Tracker...</Text>
      </View>
    );
  }

  const totalDistance = calculateDistance();
  const duration =
    locations && locations.length > 0
      ? (locations[locations.length - 1]?.timestamp - locations[0]?.timestamp) /
        1000
      : 0;

  // Prepare map data for multiple tracks
  const allTracksData = selectedTracks.flatMap((track) =>
    track.locations.map((loc) => ({
      ...loc,
      trackId: track.id,
      trackName: track.name,
    }))
  );

  // Get GPS status color
  const getGpsStatusColor = () => {
    switch (gpsStatus) {
      case "connected":
        return "#10b981";
      case "poor":
        return "#f59e0b";
      case "searching":
        return "#3b82f6";
      case "disconnected":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  // Get GPS status icon
  const getGpsStatusIcon = () => {
    switch (gpsStatus) {
      case "connected":
        return "gps-fixed";
      case "poor":
        return "gps-not-fixed";
      case "searching":
        return "gps-not-fixed";
      case "disconnected":
        return "gps-off";
      default:
        return "gps-off";
    }
  };

  // Format constellation display
  const formatConstellations = () => {
    if (satelliteInfo.constellations.length === 0) return "None";
    if (satelliteInfo.constellations.length <= 2) {
      return satelliteInfo.constellations.join(", ");
    }
    return `${satelliteInfo.constellations.slice(0, 2).join(", ")} +${
      satelliteInfo.constellations.length - 2
    }`;
  };

  const theme = {
    colors: {
      primary: isDarkTheme ? "#2563eb" : "#6366f1",
      background: isDarkTheme ? "#1a1a1a" : "#f8fafc",
      surface: isDarkTheme ? "#2d2d2d" : "#ffffff",
      text: isDarkTheme ? "#ffffff" : "#1e293b",
      onSurface: isDarkTheme ? "#ffffff" : "#1e293b",
      outline: isDarkTheme ? "#404040" : "#e2e8f0",
      accent: isDarkTheme ? "#10b981" : "#059669",
      secondary: isDarkTheme ? "#8b5cf6" : "#7c3aed",
    },
  };

  return (
    <ErrorBoundary>
      <CrashGuard>
        <PaperProvider theme={theme}>
          <SafeAreaProvider>
            <SafeAreaView
              style={[
                styles.container,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <StatusBar
                barStyle={isDarkTheme ? "light-content" : "dark-content"}
                backgroundColor={theme.colors.background}
              />

              {/* Main Map View */}
              <View style={styles.mapViewContainer}>
                {/* Map */}
                <View style={styles.fullMapContainer}>
                  <CrashGuard>
                    <MapComponent
                      locations={
                        allTracksData.length > 0
                          ? allTracksData
                          : locations || []
                      }
                      currentLocation={currentLocation}
                      isTracking={isTracking && !isPaused}
                      isDarkTheme={isDarkTheme}
                      style={styles.fullMap}
                      showLayerSelector={true}
                      isFullscreen={false}
                    />
                  </CrashGuard>
                </View>

                {/* Top Overlay - Header with Enhanced GPS Status */}
                <View
                  style={[
                    styles.mapTopOverlay,
                    {
                      backgroundColor: isDarkTheme
                        ? "rgba(0, 0, 0, 0.85)"
                        : "rgba(255, 255, 255, 0.95)",
                      borderBottomColor: isDarkTheme
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.1)",
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={openDrawer}
                    style={styles.backButton}
                  >
                    <MaterialIcons
                      name="menu"
                      size={24}
                      color={isDarkTheme ? "#fff" : theme.colors.text}
                    />
                  </TouchableOpacity>

                  <View style={styles.mapHeaderCenter}>
                    <TouchableOpacity
                      style={[
                        styles.statisticsButton,
                        {
                          backgroundColor: isDarkTheme
                            ? "rgba(255, 255, 255, 0.15)"
                            : "rgba(99, 102, 241, 0.1)",
                          borderColor: isDarkTheme
                            ? "rgba(255, 255, 255, 0.2)"
                            : theme.colors.primary + "40",
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={getGpsStatusIcon()}
                        size={20}
                        color={getGpsStatusColor()}
                      />
                      <Text
                        style={[
                          styles.statisticsText,
                          {
                            color: isDarkTheme ? "#fff" : theme.colors.primary,
                          },
                        ]}
                      >
                        {selectedTracks.length > 0
                          ? `${selectedTracks.length} Track${
                              selectedTracks.length > 1 ? "s" : ""
                            } Selected`
                          : isTracking
                          ? `${currentTrackName} • ${satelliteInfo.used}/${satelliteInfo.total} SAT`
                          : "GPS Tracker"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.mapHeaderRight}>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={() => downloadKML()}
                    >
                      <MaterialIcons
                        name="download"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={() => downloadGPX()}
                    >
                      <MaterialIcons
                        name="file-download"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={importFile}
                    >
                      <MaterialIcons
                        name="upload"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bottom Overlay - Enhanced Statistics with Dynamic GPS Info */}
                <View
                  style={[
                    styles.mapBottomOverlay,
                    {
                      backgroundColor: isDarkTheme
                        ? "rgba(0, 0, 0, 0.6)"
                        : "rgba(255, 255, 255, 0.7)",
                    },
                  ]}
                >
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text
                        style={[
                          styles.statValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {currentLocation?.speed
                          ? `${(currentLocation.speed * 3.6).toFixed(0)}`
                          : "0"}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        km/h
                      </Text>
                      <Text
                        style={[
                          styles.statSubLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        SPEED
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <View style={styles.gpsStatusContainer}>
                        <MaterialIcons
                          name={getGpsStatusIcon()}
                          size={16}
                          color={getGpsStatusColor()}
                        />
                        <Text
                          style={[
                            styles.statValue,
                            {
                              color: getGpsStatusColor(),
                              fontSize: 14,
                            },
                          ]}
                        >
                          {satelliteInfo.used}/{satelliteInfo.total}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        SATELLITES
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <Text
                        style={[
                          styles.statValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {Math.floor(duration / 3600)
                          .toString()
                          .padStart(2, "0")}
                        :
                        {Math.floor((duration % 3600) / 60)
                          .toString()
                          .padStart(2, "0")}
                        :
                        {Math.floor(duration % 60)
                          .toString()
                          .padStart(2, "0")}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        DURATION
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <Text
                        style={[
                          styles.statValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {totalDistance > 1000
                          ? `${(totalDistance / 1000).toFixed(2)} km`
                          : `${Math.round(totalDistance)} m`}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        DISTANCE
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <Text
                        style={[
                          styles.statValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {currentLocation?.accuracy
                          ? `±${Math.round(currentLocation.accuracy)}m`
                          : "±--m"}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#94a3b8" },
                        ]}
                      >
                        ACCURACY
                      </Text>
                    </View>
                  </View>

                  {/* Additional Stats Row with Constellation Info */}
                  <View style={styles.additionalStatsRow}>
                    <View style={styles.additionalStatItem}>
                      <Text
                        style={[
                          styles.additionalStatValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {locations.length}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        POINTS
                      </Text>
                    </View>

                    <View style={styles.additionalStatItem}>
                      <Text
                        style={[
                          styles.additionalStatValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {currentLocation?.altitude
                          ? `${Math.round(currentLocation.altitude)} m`
                          : "0 m"}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        ELEVATION
                      </Text>
                    </View>

                    <View style={styles.additionalStatItem}>
                      <Text
                        style={[
                          styles.additionalStatValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {formatConstellations()}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        GNSS
                      </Text>
                    </View>

                    <View style={styles.additionalStatItem}>
                      <Text
                        style={[
                          styles.additionalStatValue,
                          { color: getGpsStatusColor() },
                        ]}
                      >
                        {gpsStatus.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        STATUS
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Control Buttons - Over Stats */}
                <View style={styles.mapControlButtons}>
                  {!isTracking ? (
                    <FAB
                      icon="play"
                      style={[
                        styles.playButton,
                        { backgroundColor: theme.colors.accent },
                      ]}
                      onPress={() => {
                        setTrackNameInput(
                          `Track ${new Date().toLocaleDateString()}`
                        );
                        setShowTrackNameDialog(true);
                      }}
                    />
                  ) : isPaused ? (
                    <FAB
                      icon="play"
                      style={[
                        styles.playButton,
                        { backgroundColor: theme.colors.accent },
                      ]}
                      onPress={resumeTracking}
                    />
                  ) : (
                    <FAB
                      icon="pause"
                      style={[
                        styles.playButton,
                        { backgroundColor: "#f59e0b" },
                      ]}
                      onPress={pauseTracking}
                    />
                  )}
                </View>
              </View>

              {/* Navigation Drawer */}
              {isDrawerOpen && (
                <TouchableOpacity
                  style={styles.drawerOverlay}
                  onPress={closeDrawer}
                  activeOpacity={1}
                />
              )}

              <Animated.View
                style={[
                  styles.drawer,
                  {
                    transform: [{ translateX: drawerAnimation }],
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                {/* Compact Drawer Header */}
                <View
                  style={[
                    styles.drawerHeader,
                    { borderBottomColor: theme.colors.outline },
                  ]}
                >
                  <View style={styles.drawerHeaderTop}>
                    <View style={styles.drawerTitleContainer}>
                      <MaterialIcons
                        name="place"
                        size={28}
                        color={theme.colors.primary}
                      />
                      <Text
                        style={[
                          styles.drawerTitle,
                          { color: theme.colors.text },
                        ]}
                      >
                        GPS Tracker
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={closeDrawer}
                      style={styles.closeButton}
                    >
                      <MaterialIcons
                        name="close"
                        size={24}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Compact Controls Row */}
                  <View style={styles.compactControlsRow}>
                    {/* Theme Toggle */}
                    <View style={styles.compactThemeToggle}>
                      <MaterialIcons
                        name={isDarkTheme ? "dark-mode" : "light-mode"}
                        size={18}
                        color={theme.colors.text}
                      />
                      <Switch
                        value={isDarkTheme}
                        onValueChange={setIsDarkTheme}
                        trackColor={{
                          false: "#cbd5e1",
                          true: theme.colors.primary + "80",
                        }}
                        thumbColor={
                          isDarkTheme ? theme.colors.primary : "#f1f5f9"
                        }
                        style={styles.compactSwitch}
                      />
                    </View>

                    {/* Quick Actions */}
                    {!isTracking ? (
                      <TouchableOpacity
                        style={[
                          styles.compactActionButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={() => {
                          setTrackNameInput(
                            `Track ${new Date().toLocaleDateString()}`
                          );
                          setShowTrackNameDialog(true);
                          closeDrawer();
                        }}
                      >
                        <MaterialIcons
                          name="play-arrow"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    ) : isPaused ? (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.compactActionButton,
                            { backgroundColor: theme.colors.accent },
                          ]}
                          onPress={() => {
                            resumeTracking();
                            closeDrawer();
                          }}
                        >
                          <MaterialIcons
                            name="play-arrow"
                            size={16}
                            color="#fff"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.compactActionButton,
                            { backgroundColor: "#ef4444" },
                          ]}
                          onPress={() => {
                            stopTracking();
                            closeDrawer();
                          }}
                        >
                          <MaterialIcons name="stop" size={16} color="#fff" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.compactActionButton,
                            { backgroundColor: "#f59e0b" },
                          ]}
                          onPress={() => {
                            pauseTracking();
                            closeDrawer();
                          }}
                        >
                          <MaterialIcons name="pause" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.compactActionButton,
                            { backgroundColor: "#ef4444" },
                          ]}
                          onPress={() => {
                            stopTracking();
                            closeDrawer();
                          }}
                        >
                          <MaterialIcons name="stop" size={16} color="#fff" />
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.compactActionButton,
                        { backgroundColor: theme.colors.secondary },
                      ]}
                      onPress={() => {
                        importFile();
                        closeDrawer();
                      }}
                    >
                      <MaterialIcons name="upload" size={16} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.compactActionButton,
                        { backgroundColor: "#6b7280" },
                      ]}
                      onPress={() => setShowAboutDialog(true)}
                    >
                      <MaterialIcons name="info" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Current Track Status with Enhanced GPS Info */}
                  {isTracking && (
                    <View style={styles.currentTrackStatus}>
                      <View style={styles.trackStatusRow}>
                        <View
                          style={[
                            styles.trackStatusIndicator,
                            {
                              backgroundColor: isPaused
                                ? "#f59e0b"
                                : theme.colors.accent,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.trackStatusText,
                            { color: theme.colors.text },
                          ]}
                        >
                          {currentTrackName} •{" "}
                          {isPaused ? "Paused" : "Recording"}
                        </Text>
                        <View style={styles.gpsStatusBadge}>
                          <MaterialIcons
                            name={getGpsStatusIcon()}
                            size={12}
                            color={getGpsStatusColor()}
                          />
                          <Text
                            style={[
                              styles.gpsStatusText,
                              { color: getGpsStatusColor() },
                            ]}
                          >
                            {satelliteInfo.used}/{satelliteInfo.total}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.trackStatusStats,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        {locations.length} points •{" "}
                        {totalDistance > 1000
                          ? `${(totalDistance / 1000).toFixed(2)} km`
                          : `${Math.round(totalDistance)} m`}
                      </Text>
                      {!isPaused && gpsStatus === "connected" && (
                        <Text
                          style={[
                            styles.trackStatusStats,
                            { color: theme.colors.accent, fontSize: 10 },
                          ]}
                        >
                          GPS locked • {formatConstellations()} active
                        </Text>
                      )}
                      {gpsStatus === "searching" && (
                        <Text
                          style={[
                            styles.trackStatusStats,
                            { color: "#f59e0b", fontSize: 10 },
                          ]}
                        >
                          Acquiring satellites... {satelliteInfo.used} found
                        </Text>
                      )}
                      {gpsStatus === "poor" && (
                        <Text
                          style={[
                            styles.trackStatusStats,
                            { color: "#f59e0b", fontSize: 10 },
                          ]}
                        >
                          Poor GPS signal • {satelliteInfo.used} satellites
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Search Bar */}
                <View style={styles.drawerSearchContainer}>
                  <TextInput
                    style={[
                      styles.drawerSearchInput,
                      {
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text,
                        borderColor: theme.colors.outline,
                      },
                    ]}
                    placeholder="Search tracks..."
                    placeholderTextColor={isDarkTheme ? "#888" : "#64748b"}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                {/* Track List Header */}
                <View style={styles.trackListHeader}>
                  <Text
                    style={[styles.sectionTitle, { color: theme.colors.text }]}
                  >
                    Saved Tracks ({filteredTracks.length})
                  </Text>
                  {selectedTracks.length > 0 && (
                    <Text
                      style={[
                        styles.selectedTracksInfo,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {selectedTracks.length} selected
                    </Text>
                  )}
                </View>

                {/* Track List */}
                <ScrollView
                  style={styles.drawerTrackList}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredTracks.map((track) => {
                    const isSelected = selectedTracks.some(
                      (t) => t.id === track.id
                    );
                    const isCurrentTrack = currentTrackId === track.id;
                    const isCurrentlyRecording = isCurrentTrack && isTracking;

                    return (
                      <TouchableOpacity
                        key={track.id}
                        style={[
                          styles.drawerTrackItem,
                          isSelected && {
                            backgroundColor: isDarkTheme
                              ? theme.colors.primary + "30"
                              : theme.colors.primary + "15",
                            borderLeftWidth: 4,
                            borderLeftColor: theme.colors.primary,
                          },
                          isCurrentlyRecording && {
                            backgroundColor: isDarkTheme
                              ? theme.colors.accent + "20"
                              : theme.colors.accent + "10",
                            borderLeftWidth: 4,
                            borderLeftColor: theme.colors.accent,
                          },
                          { borderBottomColor: theme.colors.outline },
                        ]}
                        onPress={() => handleViewTrack(track)}
                      >
                        <View style={styles.drawerTrackInfo}>
                          <View style={styles.trackNameRow}>
                            <Text
                              style={[
                                styles.drawerTrackName,
                                { color: theme.colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              {track.name}
                            </Text>
                            <View style={styles.trackStatusIcons}>
                              {isSelected && (
                                <MaterialIcons
                                  name="visibility"
                                  size={16}
                                  color={theme.colors.primary}
                                />
                              )}
                              {isCurrentlyRecording && (
                                <>
                                  <MaterialIcons
                                    name={
                                      isPaused ? "pause" : "fiber-manual-record"
                                    }
                                    size={16}
                                    color={
                                      isPaused ? "#f59e0b" : theme.colors.accent
                                    }
                                  />
                                  {!isPaused && (
                                    <View
                                      style={[
                                        styles.recordingIndicator,
                                        {
                                          backgroundColor: theme.colors.accent,
                                        },
                                      ]}
                                    />
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                          <Text
                            style={[
                              styles.drawerTrackStats,
                              { color: isDarkTheme ? "#ccc" : "#64748b" },
                            ]}
                          >
                            {track.totalDistance > 1000
                              ? `${(track.totalDistance / 1000).toFixed(2)} km`
                              : `${Math.round(track.totalDistance)} m`}{" "}
                            • {track.locations.length} points
                          </Text>
                          <Text
                            style={[
                              styles.drawerTrackDate,
                              { color: isDarkTheme ? "#888" : "#94a3b8" },
                            ]}
                          >
                            {new Date(track.createdAt).toLocaleDateString()}
                            {isCurrentlyRecording && (
                              <Text style={{ color: theme.colors.accent }}>
                                {" "}
                                • {isPaused ? "Paused" : "Recording"}
                              </Text>
                            )}
                          </Text>
                        </View>

                        <View style={styles.drawerTrackActions}>
                          {isCurrentlyRecording ? (
                            isPaused ? (
                              <TouchableOpacity
                                style={styles.drawerActionButton}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  resumeTracking();
                                  closeDrawer();
                                }}
                              >
                                <MaterialIcons
                                  name="play-arrow"
                                  size={18}
                                  color={theme.colors.accent}
                                />
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.drawerActionButton}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  pauseTracking();
                                }}
                              >
                                <MaterialIcons
                                  name="pause"
                                  size={18}
                                  color="#f59e0b"
                                />
                              </TouchableOpacity>
                            )
                          ) : (
                            <TouchableOpacity
                              style={styles.drawerActionButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleResumeTrack(track);
                              }}
                            >
                              <MaterialIcons
                                name="play-arrow"
                                size={18}
                                color={theme.colors.accent}
                              />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.drawerActionButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              downloadKML(track);
                            }}
                            disabled={isCurrentlyRecording && !isPaused}
                          >
                            <MaterialIcons
                              name="download"
                              size={18}
                              color={
                                isCurrentlyRecording && !isPaused
                                  ? "#888"
                                  : "#f59e0b"
                              }
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.drawerActionButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              deleteTrack(track.id);
                            }}
                            disabled={isCurrentlyRecording}
                          >
                            <MaterialIcons
                              name="delete"
                              size={18}
                              color={isCurrentlyRecording ? "#888" : "#ef4444"}
                            />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {filteredTracks.length === 0 && (
                    <View style={styles.drawerEmptyState}>
                      <MaterialIcons
                        name="place"
                        size={48}
                        color={isDarkTheme ? "#666" : "#cbd5e1"}
                      />
                      <Text
                        style={[
                          styles.drawerEmptyText,
                          { color: theme.colors.text },
                        ]}
                      >
                        No tracks found
                      </Text>
                      <Text
                        style={[
                          styles.drawerEmptySubtext,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        {searchQuery
                          ? "Try a different search term"
                          : "Start tracking to create your first track!"}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </Animated.View>

              {/* Error Display */}
              {error && (
                <View style={styles.errorOverlay}>
                  <View
                    style={[
                      styles.errorContainer,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                      onPress={() => setError("")}
                      style={styles.errorButton}
                    >
                      <Text style={styles.errorButtonText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Track Name Dialog */}
              <Portal>
                <Modal
                  visible={showTrackNameDialog}
                  onDismiss={() => setShowTrackNameDialog(false)}
                  contentContainerStyle={styles.modalContainer}
                >
                  <View
                    style={[
                      styles.modalContent,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Text
                      style={[styles.modalTitle, { color: theme.colors.text }]}
                    >
                      Name Your Track
                    </Text>
                    <TextInput
                      value={trackNameInput}
                      onChangeText={setTrackNameInput}
                      placeholder="Enter track name..."
                      placeholderTextColor={isDarkTheme ? "#888" : "#64748b"}
                      style={[
                        styles.modalTextInput,
                        {
                          color: theme.colors.text,
                          borderColor: theme.colors.outline,
                        },
                      ]}
                      autoFocus
                    />
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        onPress={() => setShowTrackNameDialog(false)}
                        style={[
                          styles.modalButton,
                          { backgroundColor: isDarkTheme ? "#555" : "#e2e8f0" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalCancelButtonText,
                            { color: isDarkTheme ? "#fff" : theme.colors.text },
                          ]}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleStartTracking(trackNameInput)}
                        disabled={!trackNameInput.trim()}
                        style={[
                          styles.modalButton,
                          { backgroundColor: theme.colors.accent },
                          !trackNameInput.trim() && styles.modalButtonDisabled,
                        ]}
                      >
                        <Text style={styles.modalConfirmButtonText}>
                          Start Tracking
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>

                {/* About Dialog */}
                <Modal
                  visible={showAboutDialog}
                  onDismiss={() => setShowAboutDialog(false)}
                  contentContainerStyle={styles.modalContainer}
                >
                  <View
                    style={[
                      styles.modalContent,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <View style={styles.aboutHeader}>
                      <MaterialIcons
                        name="place"
                        size={32}
                        color={theme.colors.primary}
                      />
                      <Text
                        style={[
                          styles.modalTitle,
                          { color: theme.colors.text },
                        ]}
                      >
                        GPS Tracker Pro
                      </Text>
                    </View>

                    <View style={styles.aboutContent}>
                      <Text
                        style={[styles.aboutText, { color: theme.colors.text }]}
                      >
                        Professional GPS tracking application with dynamic
                        satellite monitoring, multi-constellation GNSS support,
                        and intelligent GPS management.
                      </Text>

                      <View style={styles.aboutSection}>
                        <Text
                          style={[
                            styles.aboutSectionTitle,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Advanced GPS Features
                        </Text>
                        <Text
                          style={[
                            styles.aboutTechText,
                            { color: isDarkTheme ? "#ccc" : "#64748b" },
                          ]}
                        >
                          • Dynamic satellite count calculation{"\n"}•
                          Multi-constellation GNSS support{"\n"}• GPS warmup and
                          recovery systems{"\n"}• Real-time accuracy monitoring
                          {"\n"}• Intelligent fallback mechanisms{"\n"}•
                          Background location tracking{"\n"}• Comprehensive
                          error handling
                        </Text>
                      </View>

                      <View style={styles.aboutSection}>
                        <Text
                          style={[
                            styles.aboutSectionTitle,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Supported Constellations
                        </Text>
                        <Text
                          style={[
                            styles.aboutTechText,
                            { color: isDarkTheme ? "#ccc" : "#64748b" },
                          ]}
                        >
                          • GPS (US) - 31 satellites{"\n"}• GLONASS (Russia) -
                          24 satellites{"\n"}• Galileo (EU) - 28 satellites
                          {"\n"}• BeiDou (China) - 35 satellites{"\n"}• QZSS
                          (Japan) - 7 satellites{"\n"}• IRNSS (India) - 7
                          satellites
                        </Text>
                      </View>

                      <View style={styles.aboutSection}>
                        <Text
                          style={[
                            styles.aboutSectionTitle,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Developer
                        </Text>
                        <Text
                          style={[
                            styles.aboutText,
                            { color: theme.colors.text },
                          ]}
                        >
                          Kuldeep Sahoo
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalButtons}>
                      {selectedTracks.length > 0 && (
                        <TouchableOpacity
                          onPress={clearAllTracks}
                          style={[
                            styles.modalButton,
                            { backgroundColor: "#ef4444" },
                          ]}
                        >
                          <Text style={styles.modalConfirmButtonText}>
                            Clear All Tracks
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => setShowAboutDialog(false)}
                        style={[
                          styles.modalButton,
                          { backgroundColor: theme.colors.primary },
                        ]}
                      >
                        <Text style={styles.modalConfirmButtonText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </Portal>
            </SafeAreaView>
          </SafeAreaProvider>
        </PaperProvider>
      </CrashGuard>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // Map View Styles
  mapViewContainer: {
    flex: 1,
    position: "relative",
  },
  fullMapContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  mapTopOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    padding: 8,
  },
  mapHeaderCenter: {
    flex: 1,
    alignItems: "center",
  },
  statisticsButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
  },
  statisticsText: {
    fontSize: 12,
    fontWeight: "600",
  },
  mapHeaderRight: {
    flexDirection: "row",
    gap: 8,
  },
  mapIconButton: {
    padding: 8,
  },
  mapBottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 900,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
  statSubLabel: {
    fontSize: 8,
    marginTop: 1,
    fontWeight: "400",
  },
  gpsStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  additionalStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  additionalStatItem: {
    alignItems: "center",
    flex: 1,
  },
  additionalStatValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  additionalStatLabel: {
    fontSize: 8,
    marginTop: 2,
    fontWeight: "400",
  },
  mapControlButtons: {
    position: "absolute",
    bottom: 100,
    right: 20,
    zIndex: 1100,
  },
  playButton: {
    width: 56,
    height: 56,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // Compact Drawer Styles
  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1500,
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 2000,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  drawerHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  drawerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  closeButton: {
    padding: 8,
  },
  compactControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  compactThemeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  compactActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  currentTrackStatus: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  trackStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  trackStatusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  trackStatusText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  gpsStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  gpsStatusText: {
    fontSize: 8,
    fontWeight: "600",
  },
  trackStatusStats: {
    fontSize: 10,
    marginLeft: 16,
  },
  drawerSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  drawerSearchInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
  },
  trackListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedTracksInfo: {
    fontSize: 11,
    fontWeight: "500",
  },
  drawerTrackList: {
    flex: 1,
  },
  drawerTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  drawerTrackInfo: {
    flex: 1,
  },
  trackNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  drawerTrackName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  trackStatusIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recordingIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  drawerTrackStats: {
    fontSize: 11,
    marginBottom: 2,
    fontWeight: "500",
  },
  drawerTrackDate: {
    fontSize: 10,
    fontWeight: "400",
  },
  drawerTrackActions: {
    flexDirection: "row",
    gap: 4,
  },
  drawerActionButton: {
    padding: 6,
  },
  drawerEmptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  drawerEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
  },
  drawerEmptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "400",
  },

  // Modal Styles
  modalContainer: {
    margin: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  modalButtonDisabled: {
    opacity: 0.5,
    elevation: 0,
  },
  modalCancelButtonText: {
    textAlign: "center",
    fontWeight: "600",
  },
  modalConfirmButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },

  // About Dialog Styles
  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 12,
  },
  aboutContent: {
    marginBottom: 24,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  aboutSection: {
    marginBottom: 16,
  },
  aboutSectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  aboutTechText: {
    fontSize: 12,
    lineHeight: 18,
  },

  // Error Styles
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  errorContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    maxWidth: 300,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  errorButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "center",
    elevation: 2,
  },
  errorButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});

export default App;
