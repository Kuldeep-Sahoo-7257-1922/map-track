import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LocationPoint, SavedTrack, TrackStats } from "../types";

export interface CurrentTrackInfo {
  trackId: string;
  trackName: string;
  isTracking: boolean;
  startTime: number;
}

export interface AppMetadata {
  version: string;
  lastSync: number;
  totalTracks: number;
  totalSize: number;
  settings: {
    autoSync: boolean;
    compressionEnabled: boolean;
    maxTrackSize: number;
  };
}

export class PersistentStorageService {
  private static instance: PersistentStorageService;
  private appFolderPath: string;
  private tracksFolderPath: string;
  private metadataFolderPath: string;
  private exportsFolderPath: string;
  private isInitialized = false;
  private syncQueue: Array<{ trackId: string; action: "save" | "delete" }> = [];
  private isSyncing = false;

  private constructor() {
    // Save to Documents/GPSTracker/ folder
    this.appFolderPath = `${FileSystem.documentDirectory}GPSTracker/`;
    this.tracksFolderPath = `${this.appFolderPath}tracks/`;
    this.metadataFolderPath = `${this.appFolderPath}metadata/`;
    this.exportsFolderPath = `${this.appFolderPath}exports/`;
  }

  public static getInstance(): PersistentStorageService {
    if (!PersistentStorageService.instance) {
      PersistentStorageService.instance = new PersistentStorageService();
    }
    return PersistentStorageService.instance;
  }

  // Initialize storage folders and migrate data
  public async initialize(): Promise<void> {
    try {
      console.log("🔧 Initializing Persistent Storage Service...");
      console.log("📁 App folder path:", this.appFolderPath);

      // Create folder structure
      await this.createFolderStructure();

      // Check if migration is needed
      const needsMigration = await this.checkMigrationNeeded();
      if (needsMigration) {
        console.log("📦 Migrating data from AsyncStorage to file system...");
        await this.migrateFromAsyncStorage();
      }

      // Initialize metadata
      await this.initializeMetadata();

      this.isInitialized = true;
      console.log("✅ Persistent Storage Service initialized successfully");
      console.log("📂 Files will be saved to Documents/GPSTracker/");
    } catch (error) {
      console.error(
        "❌ Failed to initialize Persistent Storage Service:",
        error
      );
      throw error;
    }
  }

  // Create folder structure
  private async createFolderStructure(): Promise<void> {
    try {
      const folders = [
        this.appFolderPath,
        this.tracksFolderPath,
        this.metadataFolderPath,
        this.exportsFolderPath,
      ];

      for (const folder of folders) {
        const folderInfo = await FileSystem.getInfoAsync(folder);
        if (!folderInfo.exists) {
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
          console.log(`📁 Created folder: ${folder}`);
        }
      }
    } catch (error) {
      console.error("❌ Error creating folder structure:", error);
      throw error;
    }
  }

  // Check if migration from AsyncStorage is needed
  private async checkMigrationNeeded(): Promise<boolean> {
    try {
      const metadataPath = `${this.metadataFolderPath}app_metadata.json`;
      const metadataExists = await FileSystem.getInfoAsync(metadataPath);

      if (metadataExists.exists) {
        return false; // Already migrated
      }

      // Check if AsyncStorage has data
      const asyncStorageData = await AsyncStorage.getItem(
        "location-tracker-tracks"
      );
      return asyncStorageData !== null;
    } catch (error) {
      console.error("❌ Error checking migration status:", error);
      return false;
    }
  }

  // Migrate data from AsyncStorage to file system
  private async migrateFromAsyncStorage(): Promise<void> {
    try {
      const asyncStorageData = await AsyncStorage.getItem(
        "location-tracker-tracks"
      );
      if (!asyncStorageData) return;

      const tracks: SavedTrack[] = JSON.parse(asyncStorageData);
      console.log(`📦 Migrating ${tracks.length} tracks from AsyncStorage...`);

      for (const track of tracks) {
        await this.saveTrackToFile(track);
      }

      // Create tracks index
      await this.updateTracksIndex();

      console.log("✅ Migration completed successfully");
    } catch (error) {
      console.error("❌ Error during migration:", error);
      throw error;
    }
  }

  // Initialize metadata file
  private async initializeMetadata(): Promise<void> {
    try {
      const metadataPath = `${this.metadataFolderPath}app_metadata.json`;
      const metadataExists = await FileSystem.getInfoAsync(metadataPath);

      if (!metadataExists.exists) {
        const metadata: AppMetadata = {
          version: "1.0.0",
          lastSync: Date.now(),
          totalTracks: 0,
          totalSize: 0,
          settings: {
            autoSync: true,
            compressionEnabled: false,
            maxTrackSize: 10 * 1024 * 1024, // 10MB
          },
        };

        await FileSystem.writeAsStringAsync(
          metadataPath,
          JSON.stringify(metadata, null, 2)
        );
        console.log("📄 Created app metadata file");
      }
    } catch (error) {
      console.error("❌ Error initializing metadata:", error);
      throw error;
    }
  }

  // Save track to file system
  private async saveTrackToFile(track: SavedTrack): Promise<void> {
    try {
      const trackPath = `${this.tracksFolderPath}track_${track.id}.json`;
      const trackData = {
        ...track,
        savedAt: Date.now(),
        fileVersion: "1.0",
      };

      await FileSystem.writeAsStringAsync(
        trackPath,
        JSON.stringify(trackData, null, 2)
      );
      console.log(`💾 Saved track to file: ${track.name}`);
    } catch (error) {
      console.error(`❌ Error saving track ${track.id}:`, error);
      throw error;
    }
  }

  // Load track from file system
  private async loadTrackFromFile(trackId: string): Promise<SavedTrack | null> {
    try {
      const trackPath = `${this.tracksFolderPath}track_${trackId}.json`;
      const trackExists = await FileSystem.getInfoAsync(trackPath);

      if (!trackExists.exists) {
        return null;
      }

      const trackData = await FileSystem.readAsStringAsync(trackPath);
      const track = JSON.parse(trackData);

      // Remove file-specific metadata
      delete track.savedAt;
      delete track.fileVersion;

      return track as SavedTrack;
    } catch (error) {
      console.error(`❌ Error loading track ${trackId}:`, error);
      return null;
    }
  }

  // Update tracks index
  private async updateTracksIndex(): Promise<void> {
    try {
      const tracks = await this.getAllTracksFromFiles();
      const tracksIndex = {
        totalTracks: tracks.length,
        tracks: tracks.map((track) => ({
          id: track.id,
          name: track.name,
          createdAt: track.createdAt,
          lastModified: track.lastModified,
          isComplete: track.isComplete,
          totalDistance: track.totalDistance,
          duration: track.duration,
          locationCount: track.locations.length,
        })),
        lastUpdated: Date.now(),
      };

      const indexPath = `${this.metadataFolderPath}tracks_index.json`;
      await FileSystem.writeAsStringAsync(
        indexPath,
        JSON.stringify(tracksIndex, null, 2)
      );
      console.log(`📊 Updated tracks index with ${tracks.length} tracks`);
    } catch (error) {
      console.error("❌ Error updating tracks index:", error);
      throw error;
    }
  }

  // Get all tracks from files
  private async getAllTracksFromFiles(): Promise<SavedTrack[]> {
    try {
      const tracksFolder = await FileSystem.readDirectoryAsync(
        this.tracksFolderPath
      );
      const trackFiles = tracksFolder.filter(
        (file) => file.startsWith("track_") && file.endsWith(".json")
      );

      const tracks: SavedTrack[] = [];

      for (const file of trackFiles) {
        const trackId = file.replace("track_", "").replace(".json", "");
        const track = await this.loadTrackFromFile(trackId);
        if (track) {
          tracks.push(track);
        }
      }

      return tracks.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error("❌ Error getting all tracks from files:", error);
      return [];
    }
  }

  // Public API methods
  public async getAllTracks(): Promise<SavedTrack[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.getAllTracksFromFiles();
    } catch (error) {
      console.error("❌ Error loading tracks:", error);
      return [];
    }
  }

  public async saveTrack(track: SavedTrack): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.saveTrackToFile(track);
      await this.updateTracksIndex();

      // Add to sync queue for background sync
      this.syncQueue.push({ trackId: track.id, action: "save" });
      this.processSyncQueue();

      console.log(`✅ Track saved: ${track.name}`);
    } catch (error) {
      console.error("❌ Error saving track:", error);
      throw error;
    }
  }

  public async deleteTrack(trackId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const trackPath = `${this.tracksFolderPath}track_${trackId}.json`;
      const trackExists = await FileSystem.getInfoAsync(trackPath);

      if (trackExists.exists) {
        await FileSystem.deleteAsync(trackPath);
        await this.updateTracksIndex();

        // Add to sync queue
        this.syncQueue.push({ trackId, action: "delete" });
        this.processSyncQueue();

        console.log(`🗑️ Track deleted: ${trackId}`);
      }
    } catch (error) {
      console.error("❌ Error deleting track:", error);
      throw error;
    }
  }

  public async getTrack(trackId: string): Promise<SavedTrack | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.loadTrackFromFile(trackId);
  }

  // Current track management
  public async setCurrentTrackInfo(info: CurrentTrackInfo): Promise<void> {
    try {
      const currentTrackPath = `${this.metadataFolderPath}current_track.json`;
      await FileSystem.writeAsStringAsync(
        currentTrackPath,
        JSON.stringify(info, null, 2)
      );
      console.log(`📍 Current track info saved: ${info.trackName}`);
    } catch (error) {
      console.error("❌ Error saving current track info:", error);
      throw error;
    }
  }

  public async getCurrentTrackInfo(): Promise<CurrentTrackInfo | null> {
    try {
      const currentTrackPath = `${this.metadataFolderPath}current_track.json`;
      const trackExists = await FileSystem.getInfoAsync(currentTrackPath);

      if (!trackExists.exists) {
        return null;
      }

      const trackData = await FileSystem.readAsStringAsync(currentTrackPath);
      return JSON.parse(trackData) as CurrentTrackInfo;
    } catch (error) {
      console.error("❌ Error getting current track info:", error);
      return null;
    }
  }

  public async clearCurrentTrackInfo(): Promise<void> {
    try {
      const currentTrackPath = `${this.metadataFolderPath}current_track.json`;
      const trackExists = await FileSystem.getInfoAsync(currentTrackPath);

      if (trackExists.exists) {
        await FileSystem.deleteAsync(currentTrackPath);
        console.log("🧹 Current track info cleared");
      }
    } catch (error) {
      console.error("❌ Error clearing current track info:", error);
    }
  }

  // Add location to current track
  public async addLocationToCurrentTrack(
    location: LocationPoint
  ): Promise<void> {
    try {
      const currentTrackInfo = await this.getCurrentTrackInfo();
      if (!currentTrackInfo) {
        console.warn("⚠️ No current track info found");
        return;
      }

      const track = await this.loadTrackFromFile(currentTrackInfo.trackId);
      if (!track) {
        console.warn(`⚠️ Current track not found: ${currentTrackInfo.trackId}`);
        return;
      }

      // Add location to track
      track.locations.push(location);
      track.lastModified = Date.now();

      // Recalculate stats
      const stats = this.calculateTrackStats(track.locations);
      track.totalDistance = stats.distance;
      track.duration = stats.duration;

      // Save updated track
      await this.saveTrackToFile(track);
      console.log(
        `📍 Location added to track: ${track.name} (${track.locations.length} points)`
      );
    } catch (error) {
      console.error("❌ Error adding location to current track:", error);
    }
  }

  // Calculate track statistics
  public calculateTrackStats(locations: LocationPoint[]): TrackStats {
    try {
      if (!Array.isArray(locations) || locations.length < 2) {
        return { distance: 0, duration: 0 };
      }

      let totalDistance = 0;
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1];
        const curr = locations[i];

        if (
          !prev ||
          !curr ||
          typeof prev.latitude !== "number" ||
          typeof prev.longitude !== "number" ||
          typeof curr.latitude !== "number" ||
          typeof curr.longitude !== "number"
        ) {
          continue;
        }

        // Haversine formula for distance calculation
        const R = 6371e3; // Earth's radius in meters
        const φ1 = (prev.latitude * Math.PI) / 180;
        const φ2 = (curr.latitude * Math.PI) / 180;
        const Δφ = ((curr.latitude - prev.latitude) * Math.PI) / 180;
        const Δλ = ((curr.longitude - prev.longitude) * Math.PI) / 180;

        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = R * c;
        if (!isNaN(distance) && distance > 0) {
          totalDistance += distance;
        }
      }

      const firstLocation = locations[0];
      const lastLocation = locations[locations.length - 1];

      if (!firstLocation?.timestamp || !lastLocation?.timestamp) {
        return { distance: totalDistance, duration: 0 };
      }

      const duration = Math.max(
        0,
        (lastLocation.timestamp - firstLocation.timestamp) / 1000
      );

      return { distance: totalDistance, duration };
    } catch (error) {
      console.error("❌ Error calculating track stats:", error);
      return { distance: 0, duration: 0 };
    }
  }

  // Background sync processing
  private async processSyncQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    console.log(`🔄 Processing sync queue: ${this.syncQueue.length} items`);

    try {
      while (this.syncQueue.length > 0) {
        const syncItem = this.syncQueue.shift();
        if (syncItem) {
          await this.processSyncItem(syncItem);
        }
      }
    } catch (error) {
      console.error("❌ Error processing sync queue:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async processSyncItem(syncItem: {
    trackId: string;
    action: "save" | "delete";
  }): Promise<void> {
    try {
      if (syncItem.action === "save") {
        // Track is already saved to file, just update metadata
        await this.updateTracksIndex();
      } else if (syncItem.action === "delete") {
        // Track is already deleted, just update metadata
        await this.updateTracksIndex();
      }

      console.log(`✅ Sync completed for track: ${syncItem.trackId}`);
    } catch (error) {
      console.error(`❌ Error syncing track ${syncItem.trackId}:`, error);
    }
  }

  // Storage management
  public async getStorageInfo(): Promise<{
    totalTracks: number;
    totalSize: number;
    availableSpace: number;
    folderPath: string;
  }> {
    try {
      const tracks = await this.getAllTracksFromFiles();
      const folderInfo = await FileSystem.getInfoAsync(this.appFolderPath);

      let totalSize = 0;
      if (folderInfo.exists) {
        const allFiles = await this.getAllFilesRecursive(this.appFolderPath);
        for (const file of allFiles) {
          const fileInfo = await FileSystem.getInfoAsync(file);
          if (fileInfo.exists && !fileInfo.isDirectory) {
            totalSize += fileInfo.size || 0;
          }
        }
      }

      return {
        totalTracks: tracks.length,
        totalSize,
        availableSpace: await this.getAvailableSpace(),
        folderPath: this.appFolderPath,
      };
    } catch (error) {
      console.error("❌ Error getting storage info:", error);
      return {
        totalTracks: 0,
        totalSize: 0,
        availableSpace: 0,
        folderPath: this.appFolderPath,
      };
    }
  }

  private async getAllFilesRecursive(folderPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const items = await FileSystem.readDirectoryAsync(folderPath);

      for (const item of items) {
        const itemPath = `${folderPath}${item}`;
        const itemInfo = await FileSystem.getInfoAsync(itemPath);

        if (itemInfo.isDirectory) {
          const subFiles = await this.getAllFilesRecursive(`${itemPath}/`);
          files.push(...subFiles);
        } else {
          files.push(itemPath);
        }
      }
    } catch (error) {
      console.error("❌ Error reading directory:", error);
    }

    return files;
  }

  private async getAvailableSpace(): Promise<number> {
    try {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      return freeSpace;
    } catch (error) {
      console.error("❌ Error getting available space:", error);
      return 0;
    }
  }

  // Export functionality
  public async exportAllTracks(): Promise<string> {
    try {
      const tracks = await this.getAllTracksFromFiles();
      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        totalTracks: tracks.length,
        tracks,
      };

      const exportPath = `${
        this.exportsFolderPath
      }tracks_export_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(
        exportPath,
        JSON.stringify(exportData, null, 2)
      );

      console.log(`📤 Exported ${tracks.length} tracks to: ${exportPath}`);
      return exportPath;
    } catch (error) {
      console.error("❌ Error exporting tracks:", error);
      throw error;
    }
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check folder structure
      const folders = [
        this.appFolderPath,
        this.tracksFolderPath,
        this.metadataFolderPath,
        this.exportsFolderPath,
      ];
      for (const folder of folders) {
        const folderInfo = await FileSystem.getInfoAsync(folder);
        if (!folderInfo.exists) {
          console.error(`❌ Missing folder: ${folder}`);
          return false;
        }
      }

      // Check tracks index
      const indexPath = `${this.metadataFolderPath}tracks_index.json`;
      const indexInfo = await FileSystem.getInfoAsync(indexPath);
      if (!indexInfo.exists) {
        console.log("⚠️ Tracks index missing, recreating...");
        await this.updateTracksIndex();
      }

      console.log("✅ Persistent storage health check passed");
      return true;
    } catch (error) {
      console.error("❌ Persistent storage health check failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const persistentStorage = PersistentStorageService.getInstance();
