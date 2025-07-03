"use client";

import type React from "react";
import { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  BackHandler,
  TextInput,
  Animated,
  Dimensions,
  FlatList,
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
import TrackPlaybackView from "./src/components/TrackPlaybackView";
import ShareDownloadDialog from "./src/components/ShareDownloadDialog";
import { Platform } from "react-native";
import { styles } from "./styles/App.styles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

// Enhanced satellite interface
interface SatelliteInfo {
  id: number;
  name: string;
  constellation: string;
  elevation: number;
  azimuth: number;
  snr: number; // Signal-to-noise ratio
  used: boolean;
  prn: number; // Pseudo-random noise code
}

interface EnhancedSatelliteData {
  total: number;
  used: number;
  constellations: string[];
  satellites: SatelliteInfo[];
  lastUpdate: number;
}

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
  const [showSatelliteDialog, setShowSatelliteDialog] =
    useAsyncSafeState(false);
  
  // NEW: Share/Download Dialog States
  const [showShareDownloadDialog, setShowShareDownloadDialog] = useAsyncSafeState(false);
  const [shareDownloadFileType, setShareDownloadFileType] = useAsyncSafeState<"kml" | "gpx" | null>(null);
  const [shareDownloadTrack, setShareDownloadTrack] = useAsyncSafeState<SavedTrack | null>(null);
  
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

  // States for overlay visibility
  const [areOverlaysVisible, setAreOverlaysVisible] = useAsyncSafeState(true);
  const overlayAnim = useRef(new Animated.Value(1)).current;
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const OVERLAY_TIMEOUT = 15000; // 15 seconds

  // States for playback mode
  const [playbackTrack, setPlaybackTrack] = useAsyncSafeState<SavedTrack | null>(null);

  // Enhanced GPS Status states
  const [gpsStatus, setGpsStatus] = useAsyncSafeState<
    "searching" | "connected" | "poor" | "disconnected"
  >("searching");
  const [satelliteInfo, setSatelliteInfo] =
    useAsyncSafeState<EnhancedSatelliteData>({
      total: 0,
      used: 0,
      constellations: [],
      satellites: [],
      lastUpdate: 0,
    });
  const [lastLocationTime, setLastLocationTime] = useAsyncSafeState<number>(0);

  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const satelliteUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { executeAsync } = useAsyncOperation();
  const isUnmountedRef = useRef(false);
  const drawerAnimation = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const locationService = useRef(LocationService.getInstance());

  const AUTO_SAVE_INTERVAL = 10000;
  const SATELLITE_UPDATE_INTERVAL = 2000;

  // Reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Only set timer if overlays are visible
    if (areOverlaysVisible) {
      inactivityTimerRef.current = setTimeout(() => {
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setAreOverlaysVisible(false));
      }, OVERLAY_TIMEOUT);
    }
  }, [areOverlaysVisible, overlayAnim, setAreOverlaysVisible]);

  // Show overlays and reset timer
  const showOverlays = useCallback(() => {
    if (areOverlaysVisible) return;

    setAreOverlaysVisible(true);
    Animated.timing(overlayAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    resetInactivityTimer();
  }, [
    areOverlaysVisible,
    overlayAnim,
    resetInactivityTimer,
    setAreOverlaysVisible,
  ]);

  // Initialize/reset timer when overlays become visible
  useEffect(() => {
    if (areOverlaysVisible) {
      resetInactivityTimer();
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [areOverlaysVisible, resetInactivityTimer]);

  // Show overlays when important UI elements are open
  useEffect(() => {
    if (
      showTrackNameDialog ||
      showAboutDialog ||
      showSatelliteDialog ||
      showShareDownloadDialog || // NEW: Include share dialog
      isDrawerOpen
    ) {
      showOverlays();
    }
  }, [
    showTrackNameDialog,
    showAboutDialog,
    showSatelliteDialog,
    showShareDownloadDialog, // NEW: Include share dialog
    isDrawerOpen,
    showOverlays,
  ]);

  // Constellation data mapping
  const CONSTELLATION_DATA = {
    GPS: { name: "GPS (US)", maxSatellites: 31, color: "#10b981" },
    GLONASS: { name: "GLONASS (Russia)", maxSatellites: 24, color: "#3b82f6" },
    GALILEO: { name: "Galileo (EU)", maxSatellites: 28, color: "#8b5cf6" },
    BEIDOU: { name: "BeiDou (China)", maxSatellites: 35, color: "#f59e0b" },
    QZSS: { name: "QZSS (Japan)", maxSatellites: 7, color: "#ef4444" },
    IRNSS: { name: "IRNSS (India)", maxSatellites: 7, color: "#06b6d4" },
  };

  // Generate mock satellite data (in real implementation, this would come from native GPS module)
  const generateSatelliteData = useCallback((): SatelliteInfo[] => {
    const satellites: SatelliteInfo[] = [];
    const constellations = Object.keys(CONSTELLATION_DATA);

    // Generate realistic satellite data
    constellations.forEach((constellation, constIndex) => {
      const maxSats =
        CONSTELLATION_DATA[constellation as keyof typeof CONSTELLATION_DATA]
          .maxSatellites;
      const visibleSats = Math.floor(Math.random() * Math.min(12, maxSats)) + 4;

      for (let i = 0; i < visibleSats; i++) {
        const prnBase = constIndex * 100 + i + 1;
        const elevation = Math.random() * 90;
        const azimuth = Math.random() * 360;
        const snr = Math.random() * 50 + 10;
        const used = elevation > 15 && snr > 25;

        satellites.push({
          id: prnBase,
          name: `${constellation}-${String(i + 1).padStart(2, "0")}`,
          constellation,
          elevation: Math.round(elevation),
          azimuth: Math.round(azimuth),
          snr: Math.round(snr),
          used,
          prn: prnBase,
        });
      }
    });

    return satellites.sort((a, b) => b.snr - a.snr);
  }, []);

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

      // Generate enhanced satellite data
      const satellites = generateSatelliteData();
      const usedSatellites = satellites.filter((sat) => sat.used);
      const constellations = [
        ...new Set(satellites.map((sat) => sat.constellation)),
      ];

      const enhancedSatInfo: EnhancedSatelliteData = {
        total: satellites.length,
        used: usedSatellites.length,
        constellations,
        satellites,
        lastUpdate: now,
      };

      setSatelliteInfo(enhancedSatInfo);

      const accuracy = location.accuracy || 999;
      const usedCount = usedSatellites.length;

      // Determine GPS status based on accuracy and satellite count
      if (accuracy <= 5 && usedCount >= 8) {
        setGpsStatus("connected");
      } else if (accuracy <= 20 && usedCount >= 4) {
        setGpsStatus("poor");
      } else if (usedCount >= 3) {
        setGpsStatus("searching");
      } else {
        setGpsStatus("searching");
      }
    },
    [setGpsStatus, setSatelliteInfo, setLastLocationTime, generateSatelliteData]
  );

  // Monitor GPS status and update satellite data
  useEffect(() => {
    if (!isTracking) {
      setSatelliteInfo({
        total: 0,
        used: 0,
        constellations: [],
        satellites: [],
        lastUpdate: 0,
      });
      if (satelliteUpdateIntervalRef.current) {
        clearInterval(satelliteUpdateIntervalRef.current);
        satelliteUpdateIntervalRef.current = null;
      }
      return;
    }

    // Update satellite data periodically
    satelliteUpdateIntervalRef.current = setInterval(() => {
      if (isTracking && !isPaused) {
        const satellites = generateSatelliteData();
        const usedSatellites = satellites.filter((sat) => sat.used);
        const constellations = [
          ...new Set(satellites.map((sat) => sat.constellation)),
        ];

        setSatelliteInfo((prev) => ({
          ...prev,
          total: satellites.length,
          used: usedSatellites.length,
          constellations,
          satellites,
          lastUpdate: Date.now(),
        }));
      }
    }, SATELLITE_UPDATE_INTERVAL);

    const statusInterval = setInterval(() => {
      const timeSinceLastLocation = Date.now() - lastLocationTime;

      if (timeSinceLastLocation > 30000) {
        // No location for 30 seconds
        setSatelliteInfo((prev) => ({
          ...prev,
          used: 0,
          satellites: prev.satellites.map((sat) => ({ ...sat, used: false })),
        }));
      } else if (timeSinceLastLocation > 15000) {
        // No location for 15 seconds
        setGpsStatus("searching");
        setSatelliteInfo((prev) => ({
          ...prev,
          used: Math.max(0, prev.used - 2),
        }));
      }
    }, 5000);

    return () => {
      clearInterval(statusInterval);
      if (satelliteUpdateIntervalRef.current) {
        clearInterval(satelliteUpdateIntervalRef.current);
        satelliteUpdateIntervalRef.current = null;
      }
    };
  }, [
    isTracking,
    isPaused,
    lastLocationTime,
    setGpsStatus,
    setSatelliteInfo,
    generateSatelliteData,
  ]);

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
            setSatelliteInfo({
              total: 0,
              used: 0,
              constellations: [],
              satellites: [],
              lastUpdate: 0,
            });
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
        setSatelliteInfo({
          total: 0,
          used: 0,
          constellations: ["GPS"],
          satellites: [],
          lastUpdate: Date.now(),
        });

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
      setSatelliteInfo({
        total: 0,
        used: 0,
        constellations: [],
        satellites: [],
        lastUpdate: 0,
      });

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
      setSatelliteInfo((prev) => ({
        ...prev,
        used: 0,
        satellites: prev.satellites.map((sat) => ({ ...sat, used: false })),
      }));

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
      setSatelliteInfo((prev) => ({
        ...prev,
        constellations: ["GPS"],
        lastUpdate: Date.now(),
      }));

      // Restart location service
      const success = await locationService.current.startTracking();
      if (success) {
        console.log("✅ Tracking resumed successfully");
      } else {
        setError(
          "Failed to resume GPS tracking. Please check your location settings."
        );
        setIsPaused(true);
        setSatelliteInfo({
          total: 0,
          used: 0,
          constellations: [],
          satellites: [],
          lastUpdate: 0,
        });
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
          setSatelliteInfo({
            total: 0,
            used: 0,
            constellations: ["GPS"],
            satellites: [],
            lastUpdate: Date.now(),
          });

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

  // Enter playback mode
  const handlePlaybackTrack = useCallback(
    (track: SavedTrack) => {
      try {
        console.log("Entering playback mode for track:", track.name);
        setPlaybackTrack(track);
        closeDrawer();
      } catch (error) {
        console.error("Playback mode error:", error);
        handleError(error, "Enter playback mode");
      }
    },
    [setPlaybackTrack, closeDrawer, handleError]
  );

  // Exit playback mode
  const exitPlaybackMode = useCallback(() => {
    setPlaybackTrack(null);
  }, [setPlaybackTrack]);

  // NEW: Show share/download dialog
  const showShareDownloadDialogForTrack = useCallback(
    (fileType: "kml" | "gpx", track?: SavedTrack) => {
      setShareDownloadFileType(fileType);
      setShareDownloadTrack(track || null);
      setShowShareDownloadDialog(true);
    },
    [setShareDownloadFileType, setShareDownloadTrack, setShowShareDownloadDialog]
  );

  // NEW: Handle share action from dialog
  const handleShareFromDialog = useCallback(async () => {
    if (!shareDownloadFileType) return;

    await safeAsync(async () => {
      const trackData = shareDownloadTrack || {
        name: currentTrackName || "Current Track",
        locations,
      };
      
      if (!trackData.locations || trackData.locations.length === 0) {
        setError("No location data to share");
        return;
      }

      const content = shareDownloadFileType === "kml" 
        ? generateKML(trackData.locations, trackData.name)
        : generateGPX(trackData.locations, trackData.name);
      
      const extension = shareDownloadFileType;
      const filename = `${(trackData.name || "track").replace(
        /[^a-z0-9]/gi,
        "_"
      )}_${new Date().toISOString().split("T")[0]}.${extension}`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: shareDownloadFileType === "kml" 
            ? "application/vnd.google-earth.kml+xml" 
            : "application/gpx+xml",
          dialogTitle: `Share ${shareDownloadFileType.toUpperCase()} Track`,
        });
      } else {
        Alert.alert("Success", `${shareDownloadFileType.toUpperCase()} file saved to: ${fileUri}`);
      }

      setShowShareDownloadDialog(false);
    }, `Share ${shareDownloadFileType.toUpperCase()}`);
  }, [
    shareDownloadFileType,
    shareDownloadTrack,
    currentTrackName,
    locations,
    setError,
    safeAsync,
    setShowShareDownloadDialog,
  ]);

 // NEW: Handle download action from dialog
const handleDownloadFromDialog = useCallback(async () => {
  if (!shareDownloadFileType) return;

  await safeAsync(async () => {
    const trackData = shareDownloadTrack || {
      name: currentTrackName || "Current Track",
      locations,
    };
    
    if (!trackData.locations || trackData.locations.length === 0) {
      setError("No location data to download");
      return;
    }

    const content = shareDownloadFileType === "kml" 
      ? generateKML(trackData.locations, trackData.name)
      : generateGPX(trackData.locations, trackData.name);
    
    const extension = shareDownloadFileType;
    const filename = `${(trackData.name || "track").replace(
      /[^a-z0-9]/gi,
      "_"
    )}_${new Date().toISOString().split("T")[0]}.${extension}`;

    try {
      // For Android - save to Downloads folder
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        
        if (permissions.granted) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            shareDownloadFileType === "kml" 
              ? "application/vnd.google-earth.kml+xml" 
              : "application/gpx+xml"
          );
          
          await FileSystem.writeAsStringAsync(fileUri, content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          
          Alert.alert(
            "Success", 
            `${shareDownloadFileType.toUpperCase()} file saved to Downloads folder: ${filename}`
          );
        } else {
          throw new Error("Storage permission denied");
        }
      } else {
        // For iOS - save to Documents directory (accessible via Files app)
        const documentsDir = FileSystem.documentDirectory;
        const fileUri = `${documentsDir}${filename}`;
        
        await FileSystem.writeAsStringAsync(fileUri, content);
        
        Alert.alert(
          "Success", 
          `${shareDownloadFileType.toUpperCase()} file saved: ${filename}\n\nYou can find it in Files app under "On My iPhone" > "GPS Tracker"`
        );
      }
    } catch (error) {
      console.error("Error saving file:", error);
      // Fallback to sharing if direct save fails
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, content);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: shareDownloadFileType === "kml" 
            ? "application/vnd.google-earth.kml+xml" 
            : "application/gpx+xml",
          dialogTitle: `Save ${shareDownloadFileType.toUpperCase()} Track`,
        });
      } else {
        Alert.alert(
          "File Created", 
          `${shareDownloadFileType.toUpperCase()} file created. Please use a file manager to access it.`
        );
      }
    }
    
    setShowShareDownloadDialog(false);
  }, `Download ${shareDownloadFileType.toUpperCase()}`);
}, [
  shareDownloadFileType,
  shareDownloadTrack,
  currentTrackName,
  locations,
  setError,
  safeAsync,
  setShowShareDownloadDialog,
]);

  // Updated download functions to use the dialog
  const downloadKML = useCallback(
    async (track?: SavedTrack) => {
      showShareDownloadDialogForTrack("kml", track);
    },
    [showShareDownloadDialogForTrack]
  );

  const downloadGPX = useCallback(
    async (track?: SavedTrack) => {
      showShareDownloadDialogForTrack("gpx", track);
    },
    [showShareDownloadDialogForTrack]
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
          if (showTrackNameDialog || showAboutDialog || showSatelliteDialog || showShareDownloadDialog) {
            setShowTrackNameDialog(false);
            setShowAboutDialog(false);
            setShowSatelliteDialog(false);
            setShowShareDownloadDialog(false); // NEW: Close share dialog
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
    showSatelliteDialog,
    showShareDownloadDialog, // NEW: Include share dialog
    isTracking,
    closeDrawer,
    setShowTrackNameDialog,
    setShowAboutDialog,
    setShowSatelliteDialog,
    setShowShareDownloadDialog, // NEW: Include share dialog
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
      if (satelliteUpdateIntervalRef.current) {
        clearInterval(satelliteUpdateIntervalRef.current);
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
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

  // Render satellite item
  const renderSatelliteItem = ({ item }: { item: SatelliteInfo }) => {
    const constellation =
      CONSTELLATION_DATA[item.constellation as keyof typeof CONSTELLATION_DATA];
    const signalStrength = Math.min(item.snr / 50, 1);

    return (
      <View
        style={[
          styles.satelliteItem,
          {
            backgroundColor: isDarkTheme ? "#2d2d2d" : "#f8fafc",
            borderLeftColor: constellation?.color || "#6b7280",
          },
        ]}
      >
        <View style={styles.satelliteHeader}>
          <View style={styles.satelliteNameContainer}>
            <Text
              style={[
                styles.satelliteName,
                { color: isDarkTheme ? "#fff" : "#1e293b" },
              ]}
            >
              {item.name}
            </Text>
            <View
              style={[
                styles.satelliteStatusBadge,
                {
                  backgroundColor: item.used
                    ? (constellation?.color || "#10b981") + "20"
                    : "#6b728020",
                },
              ]}
            >
              <Text
                style={[
                  styles.satelliteStatusText,
                  {
                    color: item.used
                      ? constellation?.color || "#10b981"
                      : "#6b7280",
                  },
                ]}
              >
                {item.used ? "USED" : "VISIBLE"}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.satelliteConstellation,
              { color: constellation?.color || "#6b7280" },
            ]}
          >
            {constellation?.name || item.constellation}
          </Text>
        </View>

        <View style={styles.satelliteDetails}>
          <View style={styles.satelliteDetailRow}>
            <View style={styles.satelliteDetailItem}>
              <Text
                style={[
                  styles.satelliteDetailLabel,
                  { color: isDarkTheme ? "#ccc" : "#64748b" },
                ]}
              >
                PRN
              </Text>
              <Text
                style={[
                  styles.satelliteDetailValue,
                  { color: isDarkTheme ? "#fff" : "#1e293b" },
                ]}
              >
                {item.prn}
              </Text>
            </View>

            <View style={styles.satelliteDetailItem}>
              <Text
                style={[
                  styles.satelliteDetailLabel,
                  { color: isDarkTheme ? "#ccc" : "#64748b" },
                ]}
              >
                ELEVATION
              </Text>
              <Text
                style={[
                  styles.satelliteDetailValue,
                  { color: isDarkTheme ? "#fff" : "#1e293b" },
                ]}
              >
                {item.elevation}°
              </Text>
            </View>

            <View style={styles.satelliteDetailItem}>
              <Text
                style={[
                  styles.satelliteDetailLabel,
                  { color: isDarkTheme ? "#ccc" : "#64748b" },
                ]}
              >
                AZIMUTH
              </Text>
              <Text
                style={[
                  styles.satelliteDetailValue,
                  { color: isDarkTheme ? "#fff" : "#1e293b" },
                ]}
              >
                {item.azimuth}°
              </Text>
            </View>

            <View style={styles.satelliteDetailItem}>
              <Text
                style={[
                  styles.satelliteDetailLabel,
                  { color: isDarkTheme ? "#ccc" : "#64748b" },
                ]}
              >
                SNR
              </Text>
              <Text
                style={[
                  styles.satelliteDetailValue,
                  { color: isDarkTheme ? "#fff" : "#1e293b" },
                ]}
              >
                {item.snr} dB
              </Text>
            </View>
          </View>

          <View style={styles.signalStrengthContainer}>
            <Text
              style={[
                styles.signalStrengthLabel,
                { color: isDarkTheme ? "#ccc" : "#64748b" },
              ]}
            >
              Signal Strength
            </Text>
            <View
              style={[
                styles.signalStrengthBar,
                { backgroundColor: isDarkTheme ? "#404040" : "#e2e8f0" },
              ]}
            >
              <View
                style={[
                  styles.signalStrengthFill,
                  {
                    width: `${signalStrength * 100}%`,
                    backgroundColor: item.used
                      ? constellation?.color || "#10b981"
                      : "#6b7280",
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.signalStrengthValue,
                { color: isDarkTheme ? "#fff" : "#1e293b" },
              ]}
            >
              {Math.round(signalStrength * 100)}%
            </Text>
          </View>
        </View>
      </View>
    );
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
              onTouchStart={showOverlays}
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
                      onTouch={resetInactivityTimer}
                    />
                  </CrashGuard>
                </View>

                {/* Top Overlay - Header with Enhanced GPS Status */}
                <Animated.View
                  style={[
                    styles.mapTopOverlay,
                    {
                      backgroundColor: isDarkTheme
                        ? "rgba(0, 0, 0, 0.85)"
                        : "rgba(255, 255, 255, 0.95)",
                      borderBottomColor: isDarkTheme
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.1)",
                      opacity: overlayAnim,
                      transform: [
                        {
                          translateY: overlayAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-100, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  pointerEvents={areOverlaysVisible ? "auto" : "none"}
                >
                  <TouchableOpacity
                    onPress={() => {
                      resetInactivityTimer();
                      openDrawer();
                    }}
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
                      onPress={() => {
                        resetInactivityTimer();
                        setShowSatelliteDialog(true);
                      }}
                    >
                      <MaterialIcons
                        name={getGpsStatusIcon()}
                        size={20}
                        color={getGpsStatusColor()}
                      />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
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
                          : "GPS Tracker"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.mapHeaderRight}>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={() => {
                        resetInactivityTimer();
                        downloadKML();
                      }}
                    >
                      <MaterialIcons
                        name="download"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={() => {
                        resetInactivityTimer();
                        downloadGPX();
                      }}
                    >
                      <MaterialIcons
                        name="file-download"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.mapIconButton}
                      onPress={() => {
                        resetInactivityTimer();
                        importFile();
                      }}
                    >
                      <MaterialIcons
                        name="upload"
                        size={24}
                        color={isDarkTheme ? "#fff" : theme.colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                </Animated.View>

                {/* Bottom Overlay - Enhanced Statistics with Dynamic GPS Info */}
                <Animated.View
                  style={[
                    styles.mapBottomOverlay,
                    {
                      backgroundColor: isDarkTheme
                        ? "rgba(0, 0, 0, 0.6)"
                        : "rgba(255, 255, 255, 0.7)",
                      opacity: overlayAnim,
                      transform: [
                        {
                          translateY: overlayAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [100, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  pointerEvents={areOverlaysVisible ? "auto" : "none"}
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

                    <TouchableOpacity
                      style={styles.statItem}
                      onPress={() => {
                        resetInactivityTimer();
                        setShowSatelliteDialog(true);
                      }}
                    >
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
                    </TouchableOpacity>

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
                        {currentLocation?.latitude
                          ? `${currentLocation.latitude.toFixed(5)}°`
                          : "0.00000°"}
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
                        {currentLocation?.longitude
                          ? `${currentLocation.longitude.toFixed(5)}°`
                          : "0.00000°"}
                      </Text>
                      <Text
                        style={[
                          styles.additionalStatLabel,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        LONGITUDE
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
                </Animated.View>

                {/* Control Buttons - Over Stats */}
                <Animated.View
                  style={[
                    styles.mapControlButtons,
                    {
                      opacity: overlayAnim,
                    },
                  ]}
                >
                  {!isTracking ? (
                    <FAB
                      icon="play"
                      style={[
                        styles.playButton,
                        { backgroundColor: theme.colors.accent },
                      ]}
                      onPress={() => {
                        resetInactivityTimer();
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
                      onPress={() => {
                        resetInactivityTimer();
                        resumeTracking();
                      }}
                    />
                  ) : (
                    <FAB
                      icon="pause"
                      style={[
                        styles.playButton,
                        { backgroundColor: "#f59e0b" },
                      ]}
                      onPress={() => {
                        resetInactivityTimer();
                        pauseTracking();
                      }}
                    />
                  )}
                </Animated.View>
                <Animated.View
                  style={[
                    styles.mapControlButtons1,
                    {
                      opacity: overlayAnim,
                    },
                  ]}
                >
                  {!isTracking ? (
                    <></>
                  ) : (
                    <FAB
                      icon="stop"
                      style={[
                        styles.playButton,
                        { backgroundColor: "#ef4444" },
                      ]}
                      onPress={() => {
                        resetInactivityTimer();
                        stopTracking();
                      }}
                    />
                  )}
                </Animated.View>
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
                        { backgroundColor: "#10b981" },
                      ]}
                      onPress={() => setShowSatelliteDialog(true)}
                    >
                      <MaterialIcons name="satellite" size={16} color="#fff" />
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
                        <TouchableOpacity
                          style={styles.gpsStatusBadge}
                          onPress={() => setShowSatelliteDialog(true)}
                        >
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
                        </TouchableOpacity>
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
                          <TouchableOpacity
                            style={styles.drawerActionButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              handlePlaybackTrack(track);
                            }}
                            disabled={isCurrentlyRecording}
                          >
                            <MaterialIcons
                              name="play-circle-outline"
                              size={18}
                              color={isCurrentlyRecording ? "#888" : "#8b5cf6"}
                            />
                          </TouchableOpacity>
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

                {/* NEW: Share/Download Dialog */}
                <ShareDownloadDialog
                  visible={showShareDownloadDialog}
                  onDismiss={() => setShowShareDownloadDialog(false)}
                  onShare={handleShareFromDialog}
                  onDownload={handleDownloadFromDialog}
                  fileType={shareDownloadFileType}
                  isDarkTheme={isDarkTheme}
                  theme={theme}
                />

                {/* Satellite Information Dialog */}
                <Modal
                  visible={showSatelliteDialog}
                  onDismiss={() => setShowSatelliteDialog(false)}
                  contentContainerStyle={styles.modalContainer}
                >
                  <View
                    style={[
                      styles.satelliteModalContent,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <View style={styles.satelliteModalHeader}>
                      <View style={styles.satelliteModalTitleContainer}>
                        <MaterialIcons
                          name="satellite"
                          size={28}
                          color={theme.colors.primary}
                        />
                        <Text
                          style={[
                            styles.modalTitle,
                            { color: theme.colors.text },
                          ]}
                        >
                          Satellite Information
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setShowSatelliteDialog(false)}
                        style={styles.satelliteModalCloseButton}
                      >
                        <MaterialIcons
                          name="close"
                          size={24}
                          color={theme.colors.text}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Satellite Summary */}
                    <View style={styles.satelliteSummary}>
                      <View style={styles.satelliteSummaryRow}>
                        <View style={styles.satelliteSummaryItem}>
                          <Text
                            style={[
                              styles.satelliteSummaryValue,
                              { color: "#10b981" },
                            ]}
                          >
                            {satelliteInfo.used}
                          </Text>
                          <Text
                            style={[
                              styles.satelliteSummaryLabel,
                              { color: isDarkTheme ? "#ccc" : "#64748b" },
                            ]}
                          >
                            USED
                          </Text>
                        </View>
                        <View style={styles.satelliteSummaryItem}>
                          <Text
                            style={[
                              styles.satelliteSummaryValue,
                              {
                                color: isDarkTheme ? "#fff" : theme.colors.text,
                              },
                            ]}
                          >
                            {satelliteInfo.total}
                          </Text>
                          <Text
                            style={[
                              styles.satelliteSummaryLabel,
                              { color: isDarkTheme ? "#ccc" : "#64748b" },
                            ]}
                          >
                            VISIBLE
                          </Text>
                        </View>
                        <View style={styles.satelliteSummaryItem}>
                          <Text
                            style={[
                              styles.satelliteSummaryValue,
                              { color: getGpsStatusColor() },
                            ]}
                          >
                            {gpsStatus.toUpperCase()}
                          </Text>
                          <Text
                            style={[
                              styles.satelliteSummaryLabel,
                              { color: isDarkTheme ? "#ccc" : "#64748b" },
                            ]}
                          >
                            STATUS
                          </Text>
                        </View>
                        <View style={styles.satelliteSummaryItem}>
                          <Text
                            style={[
                              styles.satelliteSummaryValue,
                              {
                                color: isDarkTheme ? "#fff" : theme.colors.text,
                              },
                            ]}
                          >
                            {satelliteInfo.constellations.length}
                          </Text>
                          <Text
                            style={[
                              styles.satelliteSummaryLabel,
                              { color: isDarkTheme ? "#ccc" : "#64748b" },
                            ]}
                          >
                            SYSTEMS
                          </Text>
                        </View>
                      </View>

                      {/* Constellation Breakdown */}
                      <View style={styles.constellationBreakdown}>
                        {Object.entries(CONSTELLATION_DATA).map(
                          ([key, data]) => {
                            const constellationSats =
                              satelliteInfo.satellites.filter(
                                (sat) => sat.constellation === key
                              );
                            const usedSats = constellationSats.filter(
                              (sat) => sat.used
                            );

                            if (constellationSats.length === 0) return null;

                            return (
                              <View key={key} style={styles.constellationItem}>
                                <View
                                  style={[
                                    styles.constellationIndicator,
                                    { backgroundColor: data.color },
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.constellationName,
                                    {
                                      color: isDarkTheme
                                        ? "#fff"
                                        : theme.colors.text,
                                    },
                                  ]}
                                >
                                  {key}
                                </Text>
                                <Text
                                  style={[
                                    styles.constellationCount,
                                    { color: data.color },
                                  ]}
                                >
                                  {usedSats.length}/{constellationSats.length}
                                </Text>
                              </View>
                            );
                          }
                        )}
                      </View>
                    </View>

                    {/* Satellite List */}
                    <View style={styles.satelliteListContainer}>
                      <Text
                        style={[
                          styles.satelliteListTitle,
                          { color: theme.colors.text },
                        ]}
                      >
                        Individual Satellites ({satelliteInfo.satellites.length}
                        )
                      </Text>

                      {satelliteInfo.satellites.length > 0 ? (
                        <FlatList
                          data={satelliteInfo.satellites}
                          renderItem={renderSatelliteItem}
                          keyExtractor={(item) => item.id.toString()}
                          style={styles.satelliteList}
                          showsVerticalScrollIndicator={false}
                          ItemSeparatorComponent={() => (
                            <View style={styles.satelliteItemSeparator} />
                          )}
                        />
                      ) : (
                        <View style={styles.noSatellitesContainer}>
                          <MaterialIcons
                            name="satellite-alt"
                            size={48}
                            color={isDarkTheme ? "#666" : "#cbd5e1"}
                          />
                          <Text
                            style={[
                              styles.noSatellitesText,
                              { color: isDarkTheme ? "#888" : "#94a3b8" },
                            ]}
                          >
                            No satellites detected
                          </Text>
                          <Text
                            style={[
                              styles.noSatellitesSubtext,
                              { color: isDarkTheme ? "#666" : "#cbd5e1" },
                            ]}
                          >
                            Start tracking to view satellite information
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.satelliteModalFooter}>
                      <Text
                        style={[
                          styles.satelliteLastUpdate,
                          { color: isDarkTheme ? "#888" : "#94a3b8" },
                        ]}
                      >
                        Last updated:{" "}
                        {satelliteInfo.lastUpdate > 0
                          ? new Date(
                              satelliteInfo.lastUpdate
                            ).toLocaleTimeString()
                          : "Never"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowSatelliteDialog(false)}
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
                          error handling{"\n"}• Live satellite information
                          viewer{"\n"}• Auto-hide UI with inactivity timer
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

              {/* Track Playback Mode */}
              {playbackTrack && (
                <View style={styles.playbackContainer}>
                  <TrackPlaybackView
                    track={playbackTrack}
                    isDarkTheme={isDarkTheme}
                    onExit={exitPlaybackMode}
                  />
                </View>
              )}
            </SafeAreaView>
          </SafeAreaProvider>
        </PaperProvider>
      </CrashGuard>
    </ErrorBoundary>
  );
};

export default App;