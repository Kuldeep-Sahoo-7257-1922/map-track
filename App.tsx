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
import * as Location from "expo-location";
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
import type { LocationPoint, SavedTrack } from "./src/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

const App: React.FC = () => {
  const [isTracking, setIsTracking] = useAsyncSafeState(false);
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

  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null
  );
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { executeAsync } = useAsyncOperation();
  const isUnmountedRef = useRef(false);
  const drawerAnimation = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

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

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("Initializing app...");
        const tracks = await storageUtils.getAllTracks();
        if (!isUnmountedRef.current) {
          setSavedTracks(tracks || []);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error("App initialization error:", error);
        handleError(error, "App initialization");
        if (!isUnmountedRef.current) {
          setIsInitialized(true);
        }
      }
    };
    initializeApp();
  }, [setSavedTracks, handleError, setIsInitialized]);

  // Request location permissions
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        setError(
          "Location services are disabled. Please enable location services."
        );
        return false;
      }

      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== "granted") {
        setError(
          "Location permission denied. Please grant location permission."
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Permission request error:", error);
      handleError(error, "Location permission request");
      return false;
    }
  }, [setError, handleError]);

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

  // Start tracking location
  const startTracking = useCallback(async (): Promise<void> => {
    try {
      console.log("🚀 Starting location tracking...");

      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        return;
      }

      setError("");
      setIsTracking(true);

      // Get initial position
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 15000,
        });

        const newLocation: LocationPoint = {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
          timestamp: Date.now(),
          accuracy: initialLocation.coords.accuracy || undefined,
          speed: initialLocation.coords.speed || undefined,
          heading: initialLocation.coords.heading || undefined,
          altitude: initialLocation.coords.altitude || undefined,
        };

        if (!isUnmountedRef.current) {
          setCurrentLocation(newLocation);
          setLocations([newLocation]);
        }
      } catch (locationError) {
        console.error("Initial location error:", locationError);
      }

      // Start watching position
      try {
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (location) => {
            try {
              if (isUnmountedRef.current) return;

              const newLocation: LocationPoint = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                timestamp: Date.now(),
                accuracy: location.coords.accuracy || undefined,
                speed: location.coords.speed || undefined,
                heading: location.coords.heading || undefined,
                altitude: location.coords.altitude || undefined,
              };

              setCurrentLocation(newLocation);
              setLocations((prev) => [...prev, newLocation]);
            } catch (error) {
              console.error("Error processing location update:", error);
            }
          }
        );
      } catch (watchError) {
        console.error("Watch position error:", watchError);
        throw watchError;
      }

      console.log("✅ Location tracking started successfully");
    } catch (error) {
      console.error("Start tracking error:", error);
      handleError(error, "Start location tracking");
      if (!isUnmountedRef.current) {
        setIsTracking(false);
      }
    }
  }, [
    requestLocationPermission,
    setError,
    setIsTracking,
    setCurrentLocation,
    setLocations,
    handleError,
  ]);

  // Auto-save system
  useEffect(() => {
    if (isTracking && currentTrackId && locations.length > 0) {
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
  }, [isTracking, currentTrackId, locations.length, safeAsync]);

  // Start new tracking
  const handleStartTracking = useCallback(
    async (trackName: string) => {
      if (!trackName.trim()) {
        setError("Please enter a track name");
        return;
      }

      await safeAsync(async () => {
        setShowTrackNameDialog(false);
        setCurrentTrackName(trackName.trim());
        const newTrackId = Date.now().toString();
        setCurrentTrackId(newTrackId);
        setViewingTrack(null);
        setSelectedTracks([]);
        setError("");
        setLocations([]);
        setCurrentLocation(null);
        await startTracking();
      }, "Start tracking");
    },
    [
      setShowTrackNameDialog,
      setCurrentTrackName,
      setCurrentTrackId,
      setViewingTrack,
      setSelectedTracks,
      setError,
      setLocations,
      setCurrentLocation,
      safeAsync,
    ]
  );

  // Stop tracking
  const stopTracking = useCallback(async () => {
    await safeAsync(async () => {
      console.log("⏹️ Stopping location tracking...");
      setIsTracking(false);

      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        } catch (error) {
          console.error("Error removing location subscription:", error);
        }
      }

      if (currentTrackId && locations.length > 0) {
        try {
          await saveCurrentTrack(true);
          console.log("✅ Final track save completed");
        } catch (error) {
          console.error("Error saving final track:", error);
        }
      }
    }, "Stop tracking");
  }, [setIsTracking, currentTrackId, locations, saveCurrentTrack, safeAsync]);

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
        setCurrentTrackId(null);
        setCurrentTrackName("");
        setIsTracking(false);

        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }
      } catch (error) {
        console.error("Toggle track error:", error);
        handleError(error, "Toggle track");
      }
    },
    [
      setSelectedTracks,
      setViewingTrack,
      setCurrentTrackId,
      setCurrentTrackName,
      setIsTracking,
      handleError,
    ]
  );

  // Resume existing track
  const handleResumeTrack = useCallback(
    async (track: SavedTrack) => {
      await safeAsync(async () => {
        setCurrentTrackId(track.id);
        setCurrentTrackName(track.name);
        setLocations([...track.locations]);
        setViewingTrack(null);
        setSelectedTracks([]);
        setError("");
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

        await startTracking();
      }, "Resume track");
    },
    [
      setCurrentTrackId,
      setCurrentTrackName,
      setLocations,
      setViewingTrack,
      setSelectedTracks,
      setError,
      closeDrawer,
      setCurrentLocation,
      setSavedTracks,
      safeAsync,
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
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove();
        } catch (error) {
          console.error(
            "Error removing location subscription on unmount:",
            error
          );
        }
      }
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
                      isTracking={isTracking}
                      isDarkTheme={isDarkTheme}
                      style={styles.fullMap}
                      showLayerSelector={true}
                      isFullscreen={false}
                    />
                  </CrashGuard>
                </View>

                {/* Top Overlay - Header */}
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
                        name="bar-chart"
                        size={20}
                        color={isDarkTheme ? "#fff" : theme.colors.primary}
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
                          ? currentTrackName
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

                {/* Bottom Overlay - Statistics */}
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
                      <Text
                        style={[
                          styles.statValue,
                          {
                            color: isTracking
                              ? theme.colors.accent
                              : isDarkTheme
                              ? "#fff"
                              : theme.colors.text,
                          },
                        ]}
                      >
                        {isTracking ? "Recording" : "Stopped"}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#64748b" },
                        ]}
                      >
                        STATUS
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
                        {currentLocation?.heading
                          ? `${Math.round(currentLocation.heading)}°`
                          : "0°"}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDarkTheme ? "#ccc" : "#94a3b8" },
                        ]}
                      >
                        BEARING
                      </Text>
                    </View>
                  </View>

                  {/* Additional Stats Row */}
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
                        {currentLocation?.latitude?.toFixed(4) || "0.0000"}°N
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        LATITUDE
                      </Text>
                    </View>

                    <View style={styles.additionalStatItem}>
                      <Text
                        style={[
                          styles.additionalStatValue,
                          { color: isDarkTheme ? "#fff" : theme.colors.text },
                        ]}
                      >
                        {currentLocation?.accuracy
                          ? `${Math.round(currentLocation.accuracy)} m`
                          : "0 m"}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        ACCURACY
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
                  ) : (
                    <FAB
                      icon="pause"
                      style={[
                        styles.playButton,
                        { backgroundColor: "#ef4444" },
                      ]}
                      onPress={stopTracking}
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
                      <MaterialIcons name="play-arrow" size={16} color="#fff" />
                    </TouchableOpacity>

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
                            {isSelected && (
                              <MaterialIcons
                                name="visibility"
                                size={16}
                                color={theme.colors.primary}
                              />
                            )}
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
                          </Text>
                        </View>

                        <View style={styles.drawerTrackActions}>
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
                          <TouchableOpacity
                            style={styles.drawerActionButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              downloadKML(track);
                            }}
                          >
                            <MaterialIcons
                              name="download"
                              size={18}
                              color="#f59e0b"
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.drawerActionButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              deleteTrack(track.id);
                            }}
                          >
                            <MaterialIcons
                              name="delete"
                              size={18}
                              color="#ef4444"
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
                        GPS Tracker
                      </Text>
                    </View>

                    <View style={styles.aboutContent}>
                      <Text
                        style={[styles.aboutText, { color: theme.colors.text }]}
                      >
                        Professional GPS tracking application with real-time
                        location monitoring, track management, and export
                        capabilities.
                      </Text>

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

                      <View style={styles.aboutSection}>
                        <Text
                          style={[
                            styles.aboutSectionTitle,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Tech Stack
                        </Text>
                        <Text
                          style={[
                            styles.aboutTechText,
                            { color: isDarkTheme ? "#ccc" : "#64748b" },
                          ]}
                        >
                          • React Native & Expo{"\n"}• TypeScript{"\n"}• Leaflet
                          Maps{"\n"}• React Native Paper{"\n"}• Expo Location
                          Services{"\n"}• AsyncStorage{"\n"}• KML/GPX Export
                        </Text>
                      </View>

                      <View style={styles.aboutSection}>
                        <Text
                          style={[
                            styles.aboutSectionTitle,
                            { color: theme.colors.primary },
                          ]}
                        >
                          Features
                        </Text>
                        <Text
                          style={[
                            styles.aboutTechText,
                            { color: isDarkTheme ? "#ccc" : "#64748b" },
                          ]}
                        >
                          • Real-time GPS tracking{"\n"}• Multiple map layers
                          {"\n"}• Track import/export{"\n"}• Multi-track viewing
                          {"\n"}• Dark/Light themes{"\n"}• Background tracking
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
