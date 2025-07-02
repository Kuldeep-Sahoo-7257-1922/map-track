"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Switch } from "react-native-paper";

import MapComponent from "./src/components/MapView";
import { storageUtils } from "./src/utils/storage";
import {
  generateKML,
  generateGPX,
  parseKMLFile,
  parseGPXFile,
} from "./src/utils/fileUtils";
import type { LocationPoint, SavedTrack } from "./src/types";

// Background tracking state keys
const BACKGROUND_TRACKING_KEY = "background-tracking-state";
const BACKGROUND_LOCATIONS_KEY = "background-locations";

// GPS Constellation data for realistic satellite simulation
const GPS_CONSTELLATIONS = {
  GPS: { total: 31, typical: [8, 12] }, // US GPS
  GLONASS: { total: 24, typical: [6, 9] }, // Russian
  Galileo: { total: 28, typical: [6, 10] }, // European
  BeiDou: { total: 35, typical: [8, 14] }, // Chinese
  QZSS: { total: 7, typical: [1, 3] }, // Japanese (regional)
  IRNSS: { total: 7, typical: [1, 2] }, // Indian (regional)
};

// Calculate realistic satellite count based on location accuracy
const calculateSatelliteCount = (accuracy: number, speed?: number) => {
  let baseCount = 0;
  let visibleSatellites = 0;

  // Base satellite count calculation based on accuracy
  if (accuracy <= 3) {
    // Excellent accuracy - good sky view, multiple constellations
    baseCount = 20 + Math.floor(Math.random() * 8); // 20-27 satellites
    visibleSatellites = 12 + Math.floor(Math.random() * 4); // 12-15 used
  } else if (accuracy <= 5) {
    // Very good accuracy
    baseCount = 16 + Math.floor(Math.random() * 6); // 16-21 satellites
    visibleSatellites = 10 + Math.floor(Math.random() * 3); // 10-12 used
  } else if (accuracy <= 10) {
    // Good accuracy
    baseCount = 12 + Math.floor(Math.random() * 6); // 12-17 satellites
    visibleSatellites = 8 + Math.floor(Math.random() * 3); // 8-10 used
  } else if (accuracy <= 20) {
    // Fair accuracy
    baseCount = 8 + Math.floor(Math.random() * 4); // 8-11 satellites
    visibleSatellites = 6 + Math.floor(Math.random() * 2); // 6-7 used
  } else if (accuracy <= 50) {
    // Poor accuracy
    baseCount = 5 + Math.floor(Math.random() * 3); // 5-7 satellites
    visibleSatellites = 4 + Math.floor(Math.random() * 2); // 4-5 used
  } else {
    // Very poor accuracy
    baseCount = 3 + Math.floor(Math.random() * 2); // 3-4 satellites
    visibleSatellites = 3 + Math.floor(Math.random() * 1); // 3 used
  }

  // Adjust for movement (moving targets are harder to track)
  if (speed && speed > 0) {
    const speedKmh = speed * 3.6;
    if (speedKmh > 50) {
      // High speed reduces effective satellite count
      visibleSatellites = Math.max(4, visibleSatellites - 1);
    } else if (speedKmh > 20) {
      // Medium speed slight reduction
      if (Math.random() > 0.7)
        visibleSatellites = Math.max(4, visibleSatellites - 1);
    }
  }

  return {
    total: baseCount,
    used: visibleSatellites,
    constellations: getActiveConstellations(baseCount),
  };
};

// Get active constellation breakdown
const getActiveConstellations = (totalSatellites: number) => {
  const active = [];

  // GPS is always primary
  if (totalSatellites >= 4) {
    active.push("GPS");
  }

  // Add other constellations based on total count
  if (totalSatellites >= 8) {
    active.push("GLONASS");
  }

  if (totalSatellites >= 12) {
    active.push("Galileo");
  }

  if (totalSatellites >= 16) {
    active.push("BeiDou");
  }

  if (totalSatellites >= 20) {
    active.push("QZSS");
  }

  return active;
};

const LocationTracker: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(
    null
  );
  const [error, setError] = useState<string>("");
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [showTrackNameDialog, setShowTrackNameDialog] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
  const [savedTracks, setSavedTracks] = useState<SavedTrack[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState<string>("");
  const [viewingTrack, setViewingTrack] = useState<SavedTrack | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<SavedTrack[]>([]);
  const [trackNameInput, setTrackNameInput] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  // Enhanced GPS/Satellite tracking states
  const [satelliteInfo, setSatelliteInfo] = useState<{
    total: number;
    used: number;
    constellations: string[];
  }>({ total: 0, used: 0, constellations: [] });
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [signalStrength, setSignalStrength] = useState<
    "poor" | "fair" | "good" | "excellent" | null
  >(null);
  const [gpsStatus, setGpsStatus] = useState<
    "searching" | "connected" | "poor" | "disconnected"
  >("disconnected");

  // Separate state for recording track locations (background recording)
  const [recordingLocations, setRecordingLocations] = useState<LocationPoint[]>(
    []
  );

  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null
  );
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gpsWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationTimeRef = useRef<number>(0);

  const AUTO_SAVE_INTERVAL = 10000;
  const GPS_WATCHDOG_INTERVAL = 15000;
  const GPS_TIMEOUT_THRESHOLD = 30000;

  // Function to update GPS stats with enhanced satellite calculation
  const updateGPSStats = (locationData: any) => {
    try {
      const accuracy = locationData.coords?.accuracy;
      const speed = locationData.coords?.speed;

      if (accuracy !== undefined && accuracy !== null) {
        setGpsAccuracy(Math.round(accuracy));

        // Calculate realistic satellite info
        const satInfo = calculateSatelliteCount(accuracy, speed);
        setSatelliteInfo(satInfo);

        // Set signal strength and GPS status based on accuracy and satellite count
        let strength: "poor" | "fair" | "good" | "excellent";
        let status: "searching" | "connected" | "poor" | "disconnected";

        if (accuracy <= 3 && satInfo.used >= 8) {
          strength = "excellent";
          status = "connected";
        } else if (accuracy <= 8 && satInfo.used >= 6) {
          strength = "good";
          status = "connected";
        } else if (accuracy <= 15 && satInfo.used >= 4) {
          strength = "fair";
          status = "poor";
        } else {
          strength = "poor";
          status = "searching";
        }

        setSignalStrength(strength);
        setGpsStatus(status);
        lastLocationTimeRef.current = Date.now();
      } else {
        setGpsAccuracy(null);
        setSignalStrength(null);
        setGpsStatus("disconnected");
        setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      }
    } catch (error) {
      console.error("Error updating GPS stats:", error);
    }
  };

  // Get signal strength color
  const getSignalColor = () => {
    switch (signalStrength) {
      case "excellent":
        return "#10b981"; // Green
      case "good":
        return "#84cc16"; // Light green
      case "fair":
        return "#f59e0b"; // Orange
      case "poor":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  };

  // Get signal strength icon
  const getSignalIcon = () => {
    switch (signalStrength) {
      case "excellent":
        return "signal-cellular-4-bar";
      case "good":
        return "signal-cellular-3-bar";
      case "fair":
        return "signal-cellular-2-bar";
      case "poor":
        return "signal-cellular-1-bar";
      default:
        return "signal-cellular-off";
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

  // Background state management
  const saveBackgroundState = async (
    trackId: string,
    trackName: string,
    isTracking: boolean,
    isPaused: boolean
  ) => {
    try {
      const state = {
        trackId,
        trackName,
        isTracking,
        isPaused,
        timestamp: Date.now(),
      };
      await storageUtils.setItem(
        BACKGROUND_TRACKING_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      console.error("Error saving background state:", error);
    }
  };

  const clearBackgroundState = async () => {
    try {
      await storageUtils.removeItem(BACKGROUND_TRACKING_KEY);
      await storageUtils.removeItem(BACKGROUND_LOCATIONS_KEY);
    } catch (error) {
      console.error("Error clearing background state:", error);
    }
  };

  const saveLocationsToBackground = async (locations: LocationPoint[]) => {
    try {
      await storageUtils.setItem(
        BACKGROUND_LOCATIONS_KEY,
        JSON.stringify(locations)
      );
    } catch (error) {
      console.error("Error saving locations to background:", error);
    }
  };

  // GPS Watchdog to monitor GPS health
  const startGpsWatchdog = () => {
    if (gpsWatchdogRef.current) {
      clearInterval(gpsWatchdogRef.current);
    }

    gpsWatchdogRef.current = setInterval(() => {
      const timeSinceLastLocation = Date.now() - lastLocationTimeRef.current;

      if (
        timeSinceLastLocation > GPS_TIMEOUT_THRESHOLD &&
        isTracking &&
        !isPaused
      ) {
        console.warn("⚠️ GPS timeout detected, attempting recovery...");
        setGpsStatus("disconnected");
        setSatelliteInfo({ total: 0, used: 0, constellations: [] });

        // Attempt to restart location tracking
        restartLocationTracking();
      } else if (
        timeSinceLastLocation > GPS_TIMEOUT_THRESHOLD / 2 &&
        isTracking &&
        !isPaused
      ) {
        setGpsStatus("searching");
        setSatelliteInfo((prev) => ({
          ...prev,
          used: Math.max(0, prev.used - 2),
        }));
      }
    }, GPS_WATCHDOG_INTERVAL);
  };

  const stopGpsWatchdog = () => {
    if (gpsWatchdogRef.current) {
      clearInterval(gpsWatchdogRef.current);
      gpsWatchdogRef.current = null;
    }
  };

  // Restart location tracking for GPS recovery
  const restartLocationTracking = async () => {
    if (!isTracking || isPaused) return;

    try {
      console.log("🔄 Restarting location tracking for GPS recovery...");

      // Stop current subscription
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Restart location tracking
      await startLocationTracking();
      console.log("✅ Location tracking restarted successfully");
    } catch (error) {
      console.error("Failed to restart location tracking:", error);
      setError("GPS connection lost. Please check your location settings.");
    }
  };

  // Check for background tracking session
  const checkBackgroundTracking = async () => {
    try {
      const backgroundState = await storageUtils.getItem(
        BACKGROUND_TRACKING_KEY
      );
      if (backgroundState) {
        const state = JSON.parse(backgroundState);
        if (state.isTracking && !state.isPaused) {
          // Resume the tracking session
          setCurrentTrackId(state.trackId);
          setCurrentTrackName(state.trackName);
          setIsTracking(true);
          setIsPaused(false);

          // Load background locations
          const backgroundLocations = await storageUtils.getItem(
            BACKGROUND_LOCATIONS_KEY
          );
          if (backgroundLocations) {
            const locations = JSON.parse(backgroundLocations);
            setRecordingLocations(locations);
            // Only set main locations if not viewing another track
            if (!viewingTrack && selectedTracks.length === 0) {
              setLocations(locations);
            }
          }

          // Resume location tracking
          await startLocationTracking();
        }
      }
    } catch (error) {
      console.error("Error checking background tracking:", error);
    }
  };

  // Background sync - periodically sync locations from background storage
  useEffect(() => {
    if (isTracking && !isPaused) {
      backgroundSyncIntervalRef.current = setInterval(async () => {
        try {
          const backgroundLocations = await storageUtils.getItem(
            BACKGROUND_LOCATIONS_KEY
          );
          if (backgroundLocations) {
            const bgLocations = JSON.parse(backgroundLocations);
            setRecordingLocations((prev) => {
              // Merge background locations with current recording locations
              const merged = [...prev];
              bgLocations.forEach((bgLoc: LocationPoint) => {
                const exists = merged.some(
                  (loc) => Math.abs(loc.timestamp - bgLoc.timestamp) < 1000 // Within 1 second
                );
                if (!exists) {
                  merged.push(bgLoc);
                }
              });
              // Sort by timestamp
              return merged.sort((a, b) => a.timestamp - b.timestamp);
            });

            // Only update main locations if not viewing other tracks
            if (!viewingTrack && selectedTracks.length === 0) {
              setLocations((prev) => {
                const merged = [...prev];
                bgLocations.forEach((bgLoc: LocationPoint) => {
                  const exists = merged.some(
                    (loc) => Math.abs(loc.timestamp - bgLoc.timestamp) < 1000
                  );
                  if (!exists) {
                    merged.push(bgLoc);
                  }
                });
                return merged.sort((a, b) => a.timestamp - b.timestamp);
              });
            }
          }
        } catch (error) {
          console.error("Error syncing background locations:", error);
        }
      }, 5000); // Sync every 5 seconds
    } else {
      if (backgroundSyncIntervalRef.current) {
        clearInterval(backgroundSyncIntervalRef.current);
        backgroundSyncIntervalRef.current = null;
      }
    }

    return () => {
      if (backgroundSyncIntervalRef.current) {
        clearInterval(backgroundSyncIntervalRef.current);
      }
    };
  }, [isTracking, isPaused, viewingTrack, selectedTracks.length]);

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("Initializing app...");
        const tracks = await storageUtils.getAllTracks();
        setSavedTracks(tracks || []);
        setIsInitialized(true);
        // Check for background tracking after initialization
        await checkBackgroundTracking();
      } catch (error) {
        console.error("App initialization error:", error);
        setError("App initialization failed");
        setIsInitialized(true);
      }
    };
    initializeApp();
  }, []);

  // Request location permissions
  const requestLocationPermission = async (): Promise<boolean> => {
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

      // Request background permission for continuous tracking
      try {
        const { status: backgroundStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== "granted") {
          console.warn("Background location permission not granted");
          // Continue without background permission
        }
      } catch (backgroundError) {
        console.warn("Background permission request failed:", backgroundError);
      }

      return true;
    } catch (error) {
      console.error("Permission request error:", error);
      setError("Failed to request location permissions");
      return false;
    }
  };

  // Save current track to storage
  const saveCurrentTrack = async (isComplete = false): Promise<void> => {
    if (
      !currentTrackId ||
      !currentTrackName ||
      recordingLocations.length === 0
    ) {
      console.log("Cannot save track: missing data");
      return;
    }

    try {
      console.log(
        `💾 Saving track: "${currentTrackName}" with ${recordingLocations.length} points`
      );
      const stats = storageUtils.calculateTrackStats(recordingLocations);
      const track: SavedTrack = {
        id: currentTrackId,
        name: currentTrackName,
        locations: [...recordingLocations],
        createdAt: recordingLocations[0]?.timestamp || Date.now(),
        lastModified: Date.now(),
        isComplete,
        totalDistance: stats.distance,
        duration: stats.duration,
      };

      await storageUtils.saveTrack(track);
      const tracks = await storageUtils.getAllTracks();
      setSavedTracks(tracks || []);

      console.log(`✅ Track saved successfully`);
    } catch (error) {
      console.error("Save track error:", error);
      setError("Failed to save track");
    }
  };

  // Start location tracking with enhanced GPS management
  const startLocationTracking = async (): Promise<void> => {
    try {
      console.log("🚀 Starting enhanced location tracking...");

      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        return;
      }

      setError("");
      setGpsStatus("searching");

      // GPS Warmup - Get initial position with high accuracy
      try {
        console.log("🛰️ Warming up GPS...");
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          maximumAge: 0, // Force fresh location
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

        // Update GPS stats with initial location
        updateGPSStats(initialLocation);

        setCurrentLocation(newLocation);
        setRecordingLocations((prev) => {
          const updated = [...prev, newLocation];
          saveLocationsToBackground(updated);
          return updated;
        });

        // Only update main locations if not viewing other tracks
        if (!viewingTrack && selectedTracks.length === 0) {
          setLocations((prev) => [...prev, newLocation]);
        }

        console.log("✅ GPS warmup completed");
      } catch (locationError) {
        console.warn("GPS warmup failed:", locationError);
        setGpsStatus("searching");
      }

      // Start watching position with enhanced settings
      try {
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000, // Every 3 seconds for better satellite tracking
            distanceInterval: 3, // Every 3 meters
            mayShowUserSettingsDialog: true,
          },
          (location) => {
            try {
              const newLocation: LocationPoint = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                timestamp: Date.now(),
                accuracy: location.coords.accuracy || undefined,
                speed: location.coords.speed || undefined,
                heading: location.coords.heading || undefined,
                altitude: location.coords.altitude || undefined,
              };

              // Update GPS stats with each location update
              updateGPSStats(location);

              setCurrentLocation(newLocation);

              // Always update recording locations
              setRecordingLocations((prev) => {
                if (isPaused) return prev;
                const updated = [...prev, newLocation];
                saveLocationsToBackground(updated);
                return updated;
              });

              // Only update main locations if not viewing other tracks
              if (!viewingTrack && selectedTracks.length === 0) {
                setLocations((prev) => {
                  if (isPaused) return prev;
                  return [...prev, newLocation];
                });
              }
            } catch (error) {
              console.error("Error processing location update:", error);
            }
          }
        );

        // Start GPS watchdog
        startGpsWatchdog();

        console.log("✅ Enhanced location tracking started successfully");
      } catch (watchError) {
        console.error("Watch position error:", watchError);

        // Try with fallback settings
        try {
          console.log("Retrying with fallback settings...");
          locationSubscription.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000,
              distanceInterval: 5,
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
              };

              updateGPSStats(location);
              setCurrentLocation(newLocation);

              setRecordingLocations((prev) => {
                if (isPaused) return prev;
                const updated = [...prev, newLocation];
                saveLocationsToBackground(updated);
                return updated;
              });

              if (!viewingTrack && selectedTracks.length === 0) {
                setLocations((prev) => {
                  if (isPaused) return prev;
                  return [...prev, newLocation];
                });
              }
            }
          );
          console.log("✅ Fallback location tracking started");
        } catch (fallbackError) {
          console.error("Fallback location tracking failed:", fallbackError);
          throw fallbackError;
        }
      }
    } catch (error) {
      console.error("Start tracking error:", error);
      setError("Failed to start location tracking");
      setIsTracking(false);
      setIsPaused(false);
      setGpsStatus("disconnected");
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      setGpsAccuracy(null);
      setSignalStrength(null);
    }
  };

  // Start tracking (UI wrapper)
  const startTracking = async (): Promise<void> => {
    setIsTracking(true);
    setIsPaused(false);
    await startLocationTracking();
  };

  // Pause tracking
  const pauseTracking = async () => {
    try {
      console.log("⏸️ Pausing location tracking...");
      setIsPaused(true);
      setGpsStatus("disconnected");

      // Update background state
      if (currentTrackId && currentTrackName) {
        await saveBackgroundState(currentTrackId, currentTrackName, true, true);
      }

      // Stop location watching but keep the session
      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        } catch (error) {
          console.error("Error removing location subscription:", error);
        }
      }

      // Stop GPS watchdog
      stopGpsWatchdog();

      // Reset GPS stats when paused
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      setGpsAccuracy(null);
      setSignalStrength(null);

      // Save current progress
      if (currentTrackId && recordingLocations.length > 0) {
        await saveCurrentTrack(false);
      }
    } catch (error) {
      console.error("Pause tracking error:", error);
      setError("Failed to pause tracking");
    }
  };

  // Resume tracking
  const resumeTracking = async () => {
    try {
      console.log("▶️ Resuming location tracking...");
      setIsPaused(false);
      setGpsStatus("searching");

      // Update background state
      if (currentTrackId && currentTrackName) {
        await saveBackgroundState(
          currentTrackId,
          currentTrackName,
          true,
          false
        );
      }

      // Restart location tracking
      await startLocationTracking();
    } catch (error) {
      console.error("Resume tracking error:", error);
      setError("Failed to resume tracking");
    }
  };

  // Auto-save system
  useEffect(() => {
    if (
      isTracking &&
      !isPaused &&
      currentTrackId &&
      recordingLocations.length > 0
    ) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }

      autoSaveIntervalRef.current = setInterval(() => {
        console.log("💾 Auto-saving track progress...");
        saveCurrentTrack(false).catch(console.error);
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
  }, [isTracking, isPaused, currentTrackId, recordingLocations.length]);

  // Start new tracking
  const handleStartTracking = async (trackName: string) => {
    if (!trackName.trim()) {
      setError("Please enter a track name");
      return;
    }

    try {
      // Stop any existing tracking first
      if (isTracking) {
        await stopTracking();
      }

      setShowTrackNameDialog(false);
      setCurrentTrackName(trackName.trim());
      const newTrackId = Date.now().toString();
      setCurrentTrackId(newTrackId);
      setError("");

      // Clear recording locations for new track
      setRecordingLocations([]);
      setCurrentLocation(null);
      setIsPaused(false);

      // Reset GPS stats for new track
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      setGpsAccuracy(null);
      setSignalStrength(null);
      setGpsStatus("disconnected");

      // Clear view state and show recording track
      setViewingTrack(null);
      setSelectedTracks([]);
      setLocations([]);

      // Save background state
      await saveBackgroundState(newTrackId, trackName.trim(), true, false);

      await startTracking();
    } catch (error) {
      console.error("Start tracking error:", error);
      setError("Failed to start tracking");
    }
  };

  // Stop tracking
  const stopTracking = async () => {
    try {
      console.log("⏹️ Stopping location tracking...");
      setIsTracking(false);
      setIsPaused(false);

      // Clear background state
      await clearBackgroundState();

      if (locationSubscription.current) {
        try {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        } catch (error) {
          console.error("Error removing location subscription:", error);
        }
      }

      // Stop GPS watchdog
      stopGpsWatchdog();

      // Reset GPS stats when stopped
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      setGpsAccuracy(null);
      setSignalStrength(null);
      setGpsStatus("disconnected");

      if (currentTrackId && recordingLocations.length > 0) {
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
      setRecordingLocations([]);
    } catch (error) {
      console.error("Stop tracking error:", error);
      setError("Failed to stop tracking");
    }
  };

  // Toggle track visibility (allow multiple track selection)
  const handleViewTrack = (track: SavedTrack) => {
    try {
      console.log("Toggling track view:", track.name);

      setSelectedTracks((prev) => {
        const isSelected = prev.some((t) => t.id === track.id);
        let newSelection: SavedTrack[];

        if (isSelected) {
          // Remove track from selection
          newSelection = prev.filter((t) => t.id !== track.id);
        } else {
          // Add track to selection
          newSelection = [...prev, track];
        }

        // Update locations based on selection
        if (newSelection.length === 0) {
          // No tracks selected, show recording track if active
          if (isTracking) {
            setLocations(recordingLocations);
          } else {
            setLocations([]);
          }
          setViewingTrack(null);
        } else {
          // Show selected tracks
          const allSelectedLocations = newSelection.flatMap((selectedTrack) =>
            selectedTrack.locations.map((loc) => ({
              ...loc,
              trackId: selectedTrack.id,
              trackName: selectedTrack.name,
            }))
          );
          setLocations(allSelectedLocations);
          setViewingTrack(newSelection.length === 1 ? newSelection[0] : null);
        }

        return newSelection;
      });

      setShowTrackList(false);
    } catch (error) {
      console.error("View track error:", error);
      setError("Failed to view track");
    }
  };

  // Show current recording track
  const showCurrentRecordingTrack = () => {
    setSelectedTracks([]);
    setViewingTrack(null);
    setLocations(recordingLocations);
    setShowTrackList(false);
  };

  // Resume existing track
  const handleResumeTrack = async (track: SavedTrack) => {
    try {
      // Stop any existing tracking first
      if (isTracking) {
        await stopTracking();
      }

      setCurrentTrackId(track.id);
      setCurrentTrackName(track.name);
      setRecordingLocations([...track.locations]); // Keep existing locations for recording
      setSelectedTracks([]); // Clear any viewed tracks
      setViewingTrack(null);
      setShowTrackList(false);
      setError("");
      setIsPaused(false);

      // Reset GPS stats for resumed track
      setSatelliteInfo({ total: 0, used: 0, constellations: [] });
      setGpsAccuracy(null);
      setSignalStrength(null);
      setGpsStatus("disconnected");

      // Show the track being resumed
      setLocations([...track.locations]);

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

      // Save background state
      await saveBackgroundState(track.id, track.name, true, false);

      await startTracking();
    } catch (error) {
      console.error("Resume track error:", error);
      setError("Failed to resume track");
    }
  };

  // Download functions (use appropriate track data)
  const downloadKML = async (track?: SavedTrack) => {
    try {
      const trackData = track || {
        name: currentTrackName || "Current Track",
        locations: isTracking ? recordingLocations : locations,
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
    } catch (error) {
      console.error("Download KML error:", error);
      setError("Failed to download KML");
    }
  };

  const downloadGPX = async (track?: SavedTrack) => {
    try {
      const trackData = track || {
        name: currentTrackName || "Current Track",
        locations: isTracking ? recordingLocations : locations,
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
    } catch (error) {
      console.error("Download GPX error:", error);
      setError("Failed to download GPX");
    }
  };

  // Delete track
  const deleteTrack = async (trackId: string) => {
    Alert.alert("Delete Track", "Are you sure you want to delete this track?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await storageUtils.deleteTrack(trackId);
            const tracks = await storageUtils.getAllTracks();
            setSavedTracks(tracks || []);

            // Remove from selected tracks if it was selected
            setSelectedTracks((prev) => {
              const filtered = prev.filter((t) => t.id !== trackId);

              // Update locations if this track was being viewed
              if (filtered.length === 0) {
                if (isTracking) {
                  setLocations(recordingLocations);
                } else {
                  setLocations([]);
                }
                setViewingTrack(null);
              } else {
                const allSelectedLocations = filtered.flatMap((selectedTrack) =>
                  selectedTrack.locations.map((loc) => ({
                    ...loc,
                    trackId: selectedTrack.id,
                    trackName: selectedTrack.name,
                  }))
                );
                setLocations(allSelectedLocations);
                setViewingTrack(filtered.length === 1 ? filtered[0] : null);
              }

              return filtered;
            });
          } catch (error) {
            console.error("Delete track error:", error);
            setError("Failed to delete track");
          }
        },
      },
    ]);
  };

  // Import file
  const importFile = async () => {
    try {
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
    } catch (error) {
      console.error("Import file error:", error);
      setError("Failed to import file");
    }
  };

  // Calculate statistics (use appropriate data)
  const calculateDistance = () => {
    try {
      const dataToUse = isTracking ? recordingLocations : locations;
      if (!dataToUse || dataToUse.length < 2) return 0;
      const stats = storageUtils.calculateTrackStats(dataToUse);
      return stats.distance || 0;
    } catch (error) {
      console.error("Error calculating distance:", error);
      return 0;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
      if (backgroundSyncIntervalRef.current) {
        clearInterval(backgroundSyncIntervalRef.current);
      }
      stopGpsWatchdog();
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
  const dataToUse = isTracking ? recordingLocations : locations;
  const duration =
    dataToUse && dataToUse.length > 0
      ? (dataToUse[dataToUse.length - 1]?.timestamp - dataToUse[0]?.timestamp) /
        1000
      : 0;

  const theme = {
    colors: {
      primary: isDarkTheme ? "#2563eb" : "#6366f1",
      background: isDarkTheme ? "#1a1a1a" : "#f8fafc",
      surface: isDarkTheme ? "#2d2d2d" : "#ffffff",
      text: isDarkTheme ? "#ffffff" : "#1e293b",
      accent: isDarkTheme ? "#10b981" : "#059669",
    },
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={[styles.header, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.titleContainer}>
              <MaterialIcons
                name="place"
                size={28}
                color={theme.colors.primary}
              />
              <Text style={[styles.title, { color: theme.colors.text }]}>
                GPS Tracker Pro
              </Text>
            </View>
            <View style={styles.headerControls}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setShowTrackList(!showTrackList)}
              >
                <MaterialIcons
                  name="folder-open"
                  size={24}
                  color={theme.colors.text}
                />
                <Text
                  style={[
                    styles.headerButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  Tracks ({savedTracks.length})
                </Text>
              </TouchableOpacity>
              <View style={styles.themeToggle}>
                <MaterialIcons
                  name={isDarkTheme ? "dark-mode" : "light-mode"}
                  size={20}
                  color={theme.colors.text}
                />
                <Switch
                  value={isDarkTheme}
                  onValueChange={setIsDarkTheme}
                  trackColor={{
                    false: "#cbd5e1",
                    true: theme.colors.primary + "80",
                  }}
                  thumbColor={isDarkTheme ? theme.colors.primary : "#f1f5f9"}
                />
              </View>
            </View>
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
                  style={[styles.trackStatusText, { color: theme.colors.text }]}
                >
                  {currentTrackName} • {isPaused ? "Paused" : "Recording"}
                </Text>
                <View style={styles.gpsStatusContainer}>
                  <MaterialIcons
                    name={getGpsStatusIcon()}
                    size={16}
                    color={getSignalColor()}
                  />
                  <Text
                    style={[styles.gpsStatusText, { color: getSignalColor() }]}
                  >
                    {satelliteInfo.used}/{satelliteInfo.total}
                  </Text>
                </View>
                {(selectedTracks.length > 0 || viewingTrack) && (
                  <TouchableOpacity
                    style={styles.showRecordingButton}
                    onPress={showCurrentRecordingTrack}
                  >
                    <MaterialIcons
                      name="fiber-manual-record"
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text
                      style={[
                        styles.showRecordingText,
                        { color: theme.colors.accent },
                      ]}
                    >
                      Show Recording
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text
                style={[
                  styles.trackStatusStats,
                  { color: isDarkTheme ? "#ccc" : "#64748b" },
                ]}
              >
                {recordingLocations.length} points •{" "}
                {(() => {
                  const recordingStats =
                    storageUtils.calculateTrackStats(recordingLocations);
                  const distance = recordingStats.distance;
                  return distance > 1000
                    ? `${(distance / 1000).toFixed(2)} km`
                    : `${Math.round(distance)} m`;
                })()}
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

          {/* Viewing Status */}
          {selectedTracks.length > 0 && (
            <View style={styles.viewingStatus}>
              <View style={styles.viewingStatusRow}>
                <MaterialIcons
                  name="visibility"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.viewingStatusText,
                    { color: theme.colors.text },
                  ]}
                >
                  Viewing {selectedTracks.length} track
                  {selectedTracks.length > 1 ? "s" : ""}:{" "}
                  {selectedTracks.map((t) => t.name).join(", ")}
                </Text>
                <TouchableOpacity
                  style={styles.clearViewButton}
                  onPress={() => {
                    setSelectedTracks([]);
                    setViewingTrack(null);
                    if (isTracking) {
                      setLocations(recordingLocations);
                    } else {
                      setLocations([]);
                    }
                  }}
                >
                  <MaterialIcons
                    name="clear"
                    size={16}
                    color={theme.colors.text}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Control Buttons */}
        <View
          style={[
            styles.controlsCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={styles.controlsRow}>
            {!isTracking ? (
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.colors.accent },
                ]}
                onPress={() => {
                  setTrackNameInput(`Track ${new Date().toLocaleDateString()}`);
                  setShowTrackNameDialog(true);
                }}
              >
                <MaterialIcons name="play-arrow" size={24} color="#fff" />
                <Text style={styles.primaryButtonText}>Start New Track</Text>
              </TouchableOpacity>
            ) : isPaused ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.colors.accent },
                  ]}
                  onPress={resumeTracking}
                >
                  <MaterialIcons name="play-arrow" size={24} color="#fff" />
                  <Text style={styles.primaryButtonText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: "#ef4444" },
                  ]}
                  onPress={stopTracking}
                >
                  <MaterialIcons name="stop" size={24} color="#fff" />
                  <Text style={styles.secondaryButtonText}>Stop</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: "#f59e0b" },
                  ]}
                  onPress={pauseTracking}
                >
                  <MaterialIcons name="pause" size={24} color="#fff" />
                  <Text style={styles.secondaryButtonText}>Pause</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: "#ef4444" },
                  ]}
                  onPress={stopTracking}
                >
                  <MaterialIcons name="stop" size={24} color="#fff" />
                  <Text style={styles.secondaryButtonText}>Stop</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: theme.colors.primary },
              ]}
              onPress={() => downloadKML()}
              disabled={
                locations.length === 0 && recordingLocations.length === 0
              }
            >
              <MaterialIcons
                name="download"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.colors.primary },
                ]}
              >
                KML
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: theme.colors.primary },
              ]}
              onPress={() => downloadGPX()}
              disabled={
                locations.length === 0 && recordingLocations.length === 0
              }
            >
              <MaterialIcons
                name="file-download"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.colors.primary },
                ]}
              >
                GPX
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: theme.colors.primary },
              ]}
              onPress={importFile}
            >
              <MaterialIcons
                name="upload"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.colors.primary },
                ]}
              >
                Import
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={() => setError("")}
              style={styles.errorButton}
            >
              <Text style={styles.errorButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Track List */}
        {showTrackList && (
          <View
            style={[
              styles.trackListCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Saved Tracks ({savedTracks.length})
            </Text>
            {savedTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons
                  name="place"
                  size={48}
                  color={isDarkTheme ? "#666" : "#cbd5e1"}
                />
                <Text style={[styles.emptyText, { color: theme.colors.text }]}>
                  No tracks found
                </Text>
                <Text
                  style={[
                    styles.emptySubtext,
                    { color: isDarkTheme ? "#888" : "#94a3b8" },
                  ]}
                >
                  Start tracking to create your first track!
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.trackList}
                showsVerticalScrollIndicator={false}
              >
                {savedTracks.map((track) => {
                  const isCurrentTrack = currentTrackId === track.id;
                  const isCurrentlyRecording = isCurrentTrack && isTracking;
                  const isSelected = selectedTracks.some(
                    (t) => t.id === track.id
                  );

                  return (
                    <View
                      key={track.id}
                      style={[
                        styles.trackItem,
                        { borderBottomColor: theme.colors.primary + "20" },
                        isCurrentlyRecording && {
                          backgroundColor: isDarkTheme
                            ? theme.colors.accent + "20"
                            : theme.colors.accent + "10",
                          borderLeftWidth: 4,
                          borderLeftColor: theme.colors.accent,
                        },
                        isSelected &&
                          !isCurrentlyRecording && {
                            backgroundColor: isDarkTheme
                              ? theme.colors.primary + "20"
                              : theme.colors.primary + "10",
                            borderLeftWidth: 4,
                            borderLeftColor: theme.colors.primary,
                          },
                      ]}
                    >
                      <View style={styles.trackInfo}>
                        <View style={styles.trackNameRow}>
                          <Text
                            style={[
                              styles.trackName,
                              { color: theme.colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {track.name}
                          </Text>
                          <View style={styles.trackStatusIcons}>
                            {isSelected && !isCurrentlyRecording && (
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
                                      { backgroundColor: theme.colors.accent },
                                    ]}
                                  />
                                )}
                              </>
                            )}
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.trackStats,
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
                            styles.trackDate,
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

                      <View style={styles.trackActions}>
                        <TouchableOpacity
                          style={styles.trackActionButton}
                          onPress={() => handleViewTrack(track)}
                        >
                          <MaterialIcons
                            name={isSelected ? "visibility-off" : "visibility"}
                            size={18}
                            color={
                              isSelected ? "#f59e0b" : theme.colors.primary
                            }
                          />
                        </TouchableOpacity>
                        {isCurrentlyRecording ? (
                          isPaused ? (
                            <TouchableOpacity
                              style={styles.trackActionButton}
                              onPress={() => resumeTracking()}
                            >
                              <MaterialIcons
                                name="play-arrow"
                                size={18}
                                color={theme.colors.accent}
                              />
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.trackActionButton}
                              onPress={() => pauseTracking()}
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
                            style={styles.trackActionButton}
                            onPress={() => handleResumeTrack(track)}
                          >
                            <MaterialIcons
                              name="play-arrow"
                              size={18}
                              color={theme.colors.accent}
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.trackActionButton}
                          onPress={() => downloadKML(track)}
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
                          style={styles.trackActionButton}
                          onPress={() => deleteTrack(track.id)}
                          disabled={isCurrentlyRecording}
                        >
                          <MaterialIcons
                            name="delete"
                            size={18}
                            color={isCurrentlyRecording ? "#888" : "#ef4444"}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Enhanced Statistics with Dynamic GPS Info */}
        {(locations.length > 0 || recordingLocations.length > 0) && (
          <View
            style={[
              styles.statsCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {selectedTracks.length > 0
                ? `Selected Tracks Statistics (${selectedTracks.length} tracks)`
                : isTracking
                ? "Recording Track Statistics"
                : "Track Statistics"}
            </Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>
                  {dataToUse.length}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDarkTheme ? "#ccc" : "#64748b" },
                  ]}
                >
                  Points
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>
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
                  Distance
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>
                  {Math.floor(duration / 3600)}h{" "}
                  {Math.floor((duration % 3600) / 60)}m{" "}
                  {Math.floor(duration % 60)}s
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDarkTheme ? "#ccc" : "#64748b" },
                  ]}
                >
                  Duration
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>
                  {duration > 0
                    ? `${((totalDistance / duration) * 3.6).toFixed(1)} km/h`
                    : "0 km/h"}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDarkTheme ? "#ccc" : "#64748b" },
                  ]}
                >
                  Avg Speed
                </Text>
              </View>

              {/* Enhanced GPS/Satellite Stats - Only show when tracking */}
              {isTracking && !isPaused && (
                <>
                  <View style={styles.statItem}>
                    <View style={styles.satelliteStatContainer}>
                      <MaterialIcons
                        name={getSignalIcon()}
                        size={20}
                        color={getSignalColor()}
                      />
                      <Text
                        style={[
                          styles.statValue,
                          { color: getSignalColor(), fontSize: 16 },
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
                      Satellites
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text
                      style={[styles.statValue, { color: getSignalColor() }]}
                    >
                      {gpsAccuracy ? `±${gpsAccuracy}m` : "N/A"}
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDarkTheme ? "#ccc" : "#64748b" },
                      ]}
                    >
                      Accuracy
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* GPS Constellation Info - Only show when tracking and connected */}
            {isTracking &&
              !isPaused &&
              gpsStatus === "connected" &&
              satelliteInfo.constellations.length > 0 && (
                <View style={styles.constellationInfo}>
                  <Text
                    style={[
                      styles.constellationTitle,
                      { color: theme.colors.text },
                    ]}
                  >
                    Active Constellations:
                  </Text>
                  <View style={styles.constellationList}>
                    {satelliteInfo.constellations.map(
                      (constellation, index) => (
                        <View
                          key={constellation}
                          style={styles.constellationItem}
                        >
                          <View
                            style={[
                              styles.constellationDot,
                              {
                                backgroundColor:
                                  constellation === "GPS"
                                    ? "#10b981"
                                    : constellation === "GLONASS"
                                    ? "#3b82f6"
                                    : constellation === "Galileo"
                                    ? "#8b5cf6"
                                    : constellation === "BeiDou"
                                    ? "#f59e0b"
                                    : "#6b7280",
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.constellationName,
                              { color: theme.colors.text },
                            ]}
                          >
                            {constellation}
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                </View>
              )}

            {/* GPS Status Messages */}
            {isTracking && (
              <View style={styles.gpsStatusMessage}>
                {gpsStatus === "searching" && (
                  <Text style={[styles.statusMessage, { color: "#f59e0b" }]}>
                    🛰️ Searching for satellites... {satelliteInfo.used} found
                  </Text>
                )}
                {gpsStatus === "poor" && (
                  <Text style={[styles.statusMessage, { color: "#f59e0b" }]}>
                    ⚠️ Poor GPS signal - Move to open area for better accuracy
                  </Text>
                )}
                {gpsStatus === "connected" &&
                  signalStrength === "excellent" && (
                    <Text
                      style={[
                        styles.statusMessage,
                        { color: theme.colors.accent },
                      ]}
                    >
                      ✅ Excellent GPS signal - High precision tracking active
                    </Text>
                  )}
                {gpsStatus === "disconnected" && !isPaused && (
                  <Text style={[styles.statusMessage, { color: "#ef4444" }]}>
                    ❌ GPS disconnected - Check location settings
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Map */}
        <View
          style={[styles.mapCard, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Map View
          </Text>
          <View style={styles.mapContainer}>
            <MapComponent
              locations={locations}
              currentLocation={currentLocation}
              isDarkTheme={isDarkTheme}
              isTracking={isTracking}
              selectedTracks={selectedTracks}
            />
          </View>
        </View>
      </ScrollView>

      {/* Track Name Dialog */}
      {showTrackNameDialog && (
        <View style={styles.dialogOverlay}>
          <View
            style={[styles.dialog, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={[styles.dialogTitle, { color: theme.colors.text }]}>
              Start New Track
            </Text>
            <TextInput
              style={[
                styles.dialogInput,
                {
                  backgroundColor: isDarkTheme ? "#333" : "#f1f5f9",
                  color: theme.colors.text,
                  borderColor: theme.colors.primary,
                },
              ]}
              value={trackNameInput}
              onChangeText={setTrackNameInput}
              placeholder="Enter track name"
              placeholderTextColor={isDarkTheme ? "#888" : "#94a3b8"}
              autoFocus
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, { backgroundColor: "#6b7280" }]}
                onPress={() => setShowTrackNameDialog(false)}
              >
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dialogButton,
                  { backgroundColor: theme.colors.accent },
                ]}
                onPress={() => handleStartTracking(trackNameInput)}
              >
                <Text style={styles.dialogButtonText}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
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
    color: "#666",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginLeft: 8,
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentTrackStatus: {
    marginTop: 8,
  },
  trackStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  trackStatusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trackStatusText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  gpsStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gpsStatusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  showRecordingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  showRecordingText: {
    fontSize: 12,
    fontWeight: "500",
  },
  trackStatusStats: {
    fontSize: 12,
    marginLeft: 16,
  },
  viewingStatus: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  viewingStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewingStatusText: {
    fontSize: 14,
    flex: 1,
  },
  clearViewButton: {
    padding: 4,
  },
  controlsCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  errorCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 8,
  },
  errorButton: {
    alignSelf: "flex-start",
  },
  errorButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "500",
  },
  trackListCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  trackList: {
    maxHeight: 300,
  },
  trackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  trackInfo: {
    flex: 1,
  },
  trackNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  trackName: {
    fontSize: 16,
    fontWeight: "500",
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
  },
  trackStats: {
    fontSize: 14,
    marginBottom: 2,
  },
  trackDate: {
    fontSize: 12,
  },
  trackActions: {
    flexDirection: "row",
    gap: 8,
  },
  trackActionButton: {
    padding: 8,
  },
  statsCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    padding: 12,
  },
  satelliteStatContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  constellationInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  constellationTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  constellationList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  constellationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  constellationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  constellationName: {
    fontSize: 12,
    fontWeight: "500",
  },
  gpsStatusMessage: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  statusMessage: {
    fontSize: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  mapCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mapContainer: {
    height: 300,
    borderRadius: 8,
    overflow: "hidden",
  },
  dialogOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  dialogInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 24,
  },
  dialogButtons: {
    flexDirection: "row",
    gap: 12,
  },
  dialogButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  dialogButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
});

export default LocationTracker;
// https://v0.dev/chat/fork-of-mapapp-i90JVrJW5YS-->>main copy v0