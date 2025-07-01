import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { storageUtils } from "../utils/storage";
import type { LocationPoint } from "../types";

const BACKGROUND_LOCATION_TASK = "background-location-task";
const LOCATION_UPDATE_INTERVAL = 3000; // 3 seconds
const LOCATION_DISTANCE_INTERVAL = 5; // 5 meters

// GPS Constellation data for realistic satellite simulation
const GPS_CONSTELLATIONS = {
  GPS: { total: 31, typical: 8 - 12 }, // US GPS
  GLONASS: { total: 24, typical: 6 - 9 }, // Russian
  Galileo: { total: 28, typical: 6 - 10 }, // European
  BeiDou: { total: 35, typical: 8 - 14 }, // Chinese
  QZSS: { total: 7, typical: 1 - 3 }, // Japanese (regional)
  IRNSS: { total: 7, typical: 1 - 2 }, // Indian (regional)
};

// Calculate realistic satellite count based on location accuracy
const calculateSatelliteCount = (accuracy: number, speed?: number): any => {
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

// Enhanced location service with proper GPS management
export class LocationService {
  private static instance: LocationService;
  private currentSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private lastKnownLocation: LocationPoint | null = null;
  private locationCallbacks: ((
    location: LocationPoint,
    satelliteInfo: any
  ) => void)[] = [];
  private errorCallbacks: ((error: string) => void)[] = [];
  private gpsWarmupTimer: NodeJS.Timeout | null = null;
  private locationWatchdog: NodeJS.Timeout | null = null;
  private lastLocationTime = 0;
  private currentSatelliteInfo = { total: 0, used: 0, constellations: [] };

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  // Add location update callback with satellite info
  addLocationCallback(
    callback: (location: LocationPoint, satelliteInfo: any) => void
  ) {
    this.locationCallbacks.push(callback);
  }

  // Remove location update callback
  removeLocationCallback(
    callback: (location: LocationPoint, satelliteInfo: any) => void
  ) {
    this.locationCallbacks = this.locationCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  // Add error callback
  addErrorCallback(callback: (error: string) => void) {
    this.errorCallbacks.push(callback);
  }

  // Remove error callback
  removeErrorCallback(callback: (error: string) => void) {
    this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
  }

  // Emit location update to all callbacks with satellite info
  private emitLocationUpdate(location: LocationPoint) {
    this.lastKnownLocation = location;
    this.lastLocationTime = Date.now();

    // Calculate realistic satellite info
    const satelliteInfo = calculateSatelliteCount(
      location.accuracy || 999,
      location.speed || 0
    );
    this.currentSatelliteInfo = satelliteInfo;

    this.locationCallbacks.forEach((callback) => {
      try {
        callback(location, satelliteInfo);
      } catch (error) {
        console.error("Error in location callback:", error);
      }
    });
  }

  // Emit error to all callbacks
  private emitError(error: string) {
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (err) {
        console.error("Error in error callback:", err);
      }
    });
  }

  // Enhanced permission request with detailed error handling
  async requestPermissions(): Promise<boolean> {
    try {
      console.log("🔐 Requesting location permissions...");

      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        this.emitError(
          "Location services are disabled. Please enable GPS/Location services in your device settings."
        );
        return false;
      }

      // Request foreground permission first
      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      console.log("Foreground permission status:", foregroundStatus);

      if (foregroundStatus !== "granted") {
        this.emitError(
          "Location permission denied. Please grant location access in app settings."
        );
        return false;
      }

      // Request background permission for continuous tracking
      try {
        const { status: backgroundStatus } =
          await Location.requestBackgroundPermissionsAsync();
        console.log("Background permission status:", backgroundStatus);

        if (backgroundStatus !== "granted") {
          console.warn(
            "Background location permission not granted - tracking may be limited when app is in background"
          );
          // Continue anyway - foreground tracking will still work
        }
      } catch (backgroundError) {
        console.warn("Background permission request failed:", backgroundError);
        // Continue anyway
      }

      return true;
    } catch (error) {
      console.error("Permission request error:", error);
      this.emitError("Failed to request location permissions");
      return false;
    }
  }

  // GPS warmup - helps establish better satellite connection
  private async warmupGPS(): Promise<void> {
    return new Promise((resolve) => {
      console.log("🛰️ Warming up GPS and acquiring satellites...");

      // Clear any existing warmup
      if (this.gpsWarmupTimer) {
        clearTimeout(this.gpsWarmupTimer);
      }

      // Start getting location updates to warm up GPS
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 0, // Force fresh location
      })
        .then((location) => {
          const accuracy = location.coords.accuracy || 999;
          const satelliteInfo = calculateSatelliteCount(accuracy);
          console.log(
            `GPS warmup complete: ${accuracy}m accuracy, ${satelliteInfo.used}/${satelliteInfo.total} satellites`
          );
          this.currentSatelliteInfo = satelliteInfo;
          resolve();
        })
        .catch((error) => {
          console.warn("GPS warmup failed:", error);
          // Set minimal satellite info for failed warmup
          this.currentSatelliteInfo = { total: 0, used: 0, constellations: [] };
          resolve(); // Continue anyway
        });

      // Timeout after 15 seconds
      this.gpsWarmupTimer = setTimeout(() => {
        console.log(
          "GPS warmup timeout - continuing with available satellites"
        );
        resolve();
      }, 15000);
    });
  }

  // Start location watchdog to detect GPS issues
  private startLocationWatchdog() {
    if (this.locationWatchdog) {
      clearInterval(this.locationWatchdog);
    }

    this.locationWatchdog = setInterval(() => {
      const timeSinceLastLocation = Date.now() - this.lastLocationTime;

      // If no location update in 30 seconds, try to restart GPS
      if (timeSinceLastLocation > 30000 && this.isTracking) {
        console.warn(
          "⚠️ No location updates for 30 seconds - attempting GPS restart"
        );
        this.restartLocationTracking();
      }
    }, 15000); // Check every 15 seconds
  }

  // Stop location watchdog
  private stopLocationWatchdog() {
    if (this.locationWatchdog) {
      clearInterval(this.locationWatchdog);
      this.locationWatchdog = null;
    }
  }

  // Restart location tracking (for GPS recovery)
  private async restartLocationTracking() {
    if (!this.isTracking) return;

    console.log("🔄 Restarting location tracking for GPS recovery...");

    try {
      // Stop current tracking
      if (this.currentSubscription) {
        this.currentSubscription.remove();
        this.currentSubscription = null;
      }

      // Reset satellite info during restart
      this.currentSatelliteInfo = {
        total: 0,
        used: 0,
        constellations: ["GPS"],
      };

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Restart with fresh GPS warmup
      await this.warmupGPS();
      await this.startLocationWatching();

      console.log("✅ Location tracking restarted successfully");
    } catch (error) {
      console.error("Failed to restart location tracking:", error);
      this.emitError(
        "GPS connection lost. Please check your location settings."
      );
    }
  }

  // Enhanced location watching with multiple accuracy attempts
  private async startLocationWatching(): Promise<void> {
    try {
      console.log("📍 Starting enhanced location watching...");

      // Try high accuracy first
      try {
        this.currentSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: LOCATION_UPDATE_INTERVAL,
            distanceInterval: LOCATION_DISTANCE_INTERVAL,
            mayShowUserSettingsDialog: true, // Allow system to show GPS settings
          },
          (location) => {
            this.handleLocationUpdate(location);
          }
        );
        console.log("✅ High accuracy location watching started");
        return;
      } catch (highAccuracyError) {
        console.warn(
          "High accuracy failed, trying balanced accuracy:",
          highAccuracyError
        );
      }

      // Fallback to balanced accuracy
      try {
        this.currentSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: LOCATION_UPDATE_INTERVAL * 2, // Longer interval for balanced
            distanceInterval: LOCATION_DISTANCE_INTERVAL * 2,
            mayShowUserSettingsDialog: true,
          },
          (location) => {
            this.handleLocationUpdate(location);
          }
        );
        console.log("✅ Balanced accuracy location watching started");
        return;
      } catch (balancedAccuracyError) {
        console.warn(
          "Balanced accuracy failed, trying low accuracy:",
          balancedAccuracyError
        );
      }

      // Final fallback to low accuracy
      this.currentSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Low,
          timeInterval: LOCATION_UPDATE_INTERVAL * 3,
          distanceInterval: LOCATION_DISTANCE_INTERVAL * 3,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          this.handleLocationUpdate(location);
        }
      );
      console.log("✅ Low accuracy location watching started (fallback)");
    } catch (error) {
      console.error("All location watching attempts failed:", error);
      throw error;
    }
  }

  // Handle location updates with validation and satellite calculation
  private handleLocationUpdate(location: Location.LocationObject) {
    try {
      // Validate location data
      if (!location?.coords?.latitude || !location?.coords?.longitude) {
        console.warn("Invalid location data received:", location);
        return;
      }

      // Check for reasonable coordinates
      const { latitude, longitude } = location.coords;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn("Invalid coordinates received:", latitude, longitude);
        return;
      }

      // Check accuracy - reject very poor accuracy readings
      const accuracy = location.coords.accuracy;
      if (accuracy && accuracy > 1000) {
        // More than 1km accuracy
        console.warn("Very poor accuracy, skipping:", accuracy);
        return;
      }

      const locationPoint: LocationPoint = {
        latitude,
        longitude,
        timestamp: Date.now(),
        accuracy: accuracy || undefined,
        speed: location.coords.speed || undefined,
        heading: location.coords.heading || undefined,
        altitude: location.coords.altitude || undefined,
      };

      // Emit the location update with satellite info
      this.emitLocationUpdate(locationPoint);

      const satelliteInfo = this.currentSatelliteInfo;
      console.log(
        `📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(
          6
        )} (±${Math.round(accuracy || 0)}m) | Satellites: ${
          satelliteInfo.used
        }/${
          satelliteInfo.total
        } | Constellations: ${satelliteInfo.constellations.join(", ")}`
      );
    } catch (error) {
      console.error("Error handling location update:", error);
    }
  }

  // Start location tracking with comprehensive setup
  async startTracking(): Promise<boolean> {
    try {
      if (this.isTracking) {
        console.log("Location tracking already active");
        return true;
      }

      console.log("🚀 Starting comprehensive location tracking...");

      // Request permissions
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        return false;
      }

      // Warm up GPS for better initial fix
      await this.warmupGPS();

      // Start location watching
      await this.startLocationWatching();

      // Start watchdog to monitor GPS health
      this.startLocationWatchdog();

      this.isTracking = true;
      console.log("✅ Location tracking started successfully");
      return true;
    } catch (error) {
      console.error("Failed to start location tracking:", error);
      this.emitError(
        "Failed to start GPS tracking. Please check your location settings."
      );
      return false;
    }
  }

  // Stop location tracking
  async stopTracking(): Promise<void> {
    try {
      console.log("⏹️ Stopping location tracking...");

      this.isTracking = false;

      // Stop watchdog
      this.stopLocationWatchdog();

      // Clear GPS warmup timer
      if (this.gpsWarmupTimer) {
        clearTimeout(this.gpsWarmupTimer);
        this.gpsWarmupTimer = null;
      }

      // Stop location subscription
      if (this.currentSubscription) {
        this.currentSubscription.remove();
        this.currentSubscription = null;
      }

      // Reset satellite info
      this.currentSatelliteInfo = { total: 0, used: 0, constellations: [] };

      console.log("✅ Location tracking stopped");
    } catch (error) {
      console.error("Error stopping location tracking:", error);
    }
  }

  // Get current location with retry logic
  async getCurrentLocation(): Promise<LocationPoint | null> {
    try {
      // Return last known location if recent (within 30 seconds)
      if (
        this.lastKnownLocation &&
        Date.now() - this.lastLocationTime < 30000
      ) {
        return this.lastKnownLocation;
      }

      console.log("📍 Getting fresh current location...");

      // Try to get fresh location with multiple accuracy levels
      const accuracyLevels = [
        Location.Accuracy.BestForNavigation,
        Location.Accuracy.Balanced,
        Location.Accuracy.Low,
      ];

      for (const accuracy of accuracyLevels) {
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy,
            maximumAge: 10000, // Accept location up to 10 seconds old
          });

          if (location?.coords?.latitude && location?.coords?.longitude) {
            const locationPoint: LocationPoint = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              timestamp: Date.now(),
              accuracy: location.coords.accuracy || undefined,
              speed: location.coords.speed || undefined,
              heading: location.coords.heading || undefined,
              altitude: location.coords.altitude || undefined,
            };

            this.lastKnownLocation = locationPoint;
            this.lastLocationTime = Date.now();

            // Update satellite info
            this.currentSatelliteInfo = calculateSatelliteCount(
              location.coords.accuracy || 999,
              location.coords.speed || 0
            );

            return locationPoint;
          }
        } catch (error) {
          console.warn(
            `Failed to get location with ${accuracy} accuracy:`,
            error
          );
          continue;
        }
      }

      throw new Error("All location accuracy attempts failed");
    } catch (error) {
      console.error("Failed to get current location:", error);
      return this.lastKnownLocation; // Return last known location as fallback
    }
  }

  // Check if tracking is active
  isTrackingActive(): boolean {
    return this.isTracking;
  }

  // Get last known location
  getLastKnownLocation(): LocationPoint | null {
    return this.lastKnownLocation;
  }

  // Get current satellite info
  getCurrentSatelliteInfo() {
    return this.currentSatelliteInfo;
  }

  // Force GPS refresh
  async refreshGPS(): Promise<void> {
    if (this.isTracking) {
      await this.restartLocationTracking();
    }
  }
}

// Background task definition with enhanced error handling
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    return;
  }

  if (data) {
    try {
      const { locations } = data as any;
      console.log(
        "📍 Background location received:",
        locations?.length || 0,
        "locations"
      );

      if (!locations || locations.length === 0) {
        console.log("No locations received in background task");
        return;
      }

      // Get current tracking info from storage
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo();
      if (!currentTrackInfo || !currentTrackInfo.isTracking) {
        console.log("No active tracking session, stopping background location");
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        return;
      }

      // Process each location with validation
      for (const location of locations) {
        try {
          if (!location?.coords?.latitude || !location?.coords?.longitude) {
            console.warn("Invalid background location data:", location);
            continue;
          }

          // Validate coordinates
          const { latitude, longitude } = location.coords;
          if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            console.warn(
              "Invalid background coordinates:",
              latitude,
              longitude
            );
            continue;
          }

          const locationPoint: LocationPoint = {
            latitude,
            longitude,
            timestamp: Date.now(),
            accuracy: location.coords.accuracy || undefined,
            speed: location.coords.speed || undefined,
            heading: location.coords.heading || undefined,
            altitude: location.coords.altitude || undefined,
          };

          // Save location to current track
          await storageUtils.addLocationToCurrentTrack(locationPoint);

          const satelliteInfo = calculateSatelliteCount(
            location.coords.accuracy || 999,
            location.coords.speed || 0
          );

          console.log(
            `📍 Background location saved: ${latitude.toFixed(
              6
            )}, ${longitude.toFixed(6)} | Satellites: ${satelliteInfo.used}/${
              satelliteInfo.total
            }`
          );
        } catch (locationError) {
          console.error(
            "Error processing individual background location:",
            locationError
          );
        }
      }
    } catch (error) {
      console.error("Error processing background location:", error);
    }
  }
});

// Enhanced background location service
export const BackgroundLocationService = {
  async startBackgroundLocationTracking(
    trackId: string,
    trackName: string
  ): Promise<boolean> {
    try {
      console.log("🌍 Starting enhanced background location tracking...");

      if (!trackId || !trackName) {
        console.error("Invalid track ID or name");
        return false;
      }

      // Check if already running
      const isAlreadyRunning = await this.isBackgroundLocationRunning();
      if (isAlreadyRunning) {
        console.log("Background location already running");
        return true;
      }

      // Request background permission
      try {
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== "granted") {
          console.error("Background location permission denied");
          return false;
        }
      } catch (permissionError) {
        console.error(
          "Error requesting background permission:",
          permissionError
        );
        return false;
      }

      // Save current tracking info
      await storageUtils.setCurrentTrackInfo({
        trackId,
        trackName,
        isTracking: true,
        startTime: Date.now(),
      });

      // Start background location updates with enhanced settings
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: LOCATION_UPDATE_INTERVAL,
          distanceInterval: LOCATION_DISTANCE_INTERVAL,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
        });
        console.log("✅ Enhanced background location tracking started");
        return true;
      } catch (locationError) {
        console.error(
          "Error starting background location updates:",
          locationError
        );

        // Try with fallback settings
        try {
          console.log("Retrying with fallback settings...");
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: LOCATION_UPDATE_INTERVAL * 2,
            distanceInterval: LOCATION_DISTANCE_INTERVAL * 2,
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
          });
          console.log(
            "✅ Background location tracking started with fallback settings"
          );
          return true;
        } catch (fallbackError) {
          console.error(
            "Fallback background location settings also failed:",
            fallbackError
          );
          return false;
        }
      }
    } catch (error) {
      console.error("Error starting background location tracking:", error);
      return false;
    }
  },

  async stopBackgroundLocationTracking(): Promise<void> {
    try {
      console.log("⏹️ Stopping background location tracking...");

      const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_LOCATION_TASK
      );
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log("Background location updates stopped");
      }

      await storageUtils.clearCurrentTrackInfo();
      console.log("✅ Background location tracking stopped");
    } catch (error) {
      console.error("Error stopping background location tracking:", error);
    }
  },

  async isBackgroundLocationRunning(): Promise<boolean> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_LOCATION_TASK
      );
      const currentTrackInfo = await storageUtils.getCurrentTrackInfo();
      return isRegistered && currentTrackInfo?.isTracking === true;
    } catch (error) {
      console.error("Error checking background location status:", error);
      return false;
    }
  },
};

export default LocationService;
