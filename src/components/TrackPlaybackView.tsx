"use client";

import type React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import type { SavedTrack } from "../types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props {
  track: SavedTrack;
  isDarkTheme?: boolean;
  onExit: () => void;
}

interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  playbackSpeed: number;
  currentTime: number;
  totalDuration: number;
  showDynamicInfo: boolean;
}

const TrackPlaybackView: React.FC<Props> = ({
  track,
  isDarkTheme = false,
  onExit,
}) => {
  const webViewRef = useRef<WebView>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentIndex: 0,
    playbackSpeed: 1,
    currentTime: 0,
    totalDuration: 0,
    showDynamicInfo: false,
  });

  const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 6, 8, 10, 12, 16, 24, 32, 48, 64, 80, 100];

  // Calculate total duration and setup initial state
  useEffect(() => {
    if (track.locations.length > 1) {
      const firstTime = track.locations[0].timestamp;
      const lastTime = track.locations[track.locations.length - 1].timestamp;
      const duration = (lastTime - firstTime) / 1000; // in seconds

      setPlaybackState((prev) => ({
        ...prev,
        totalDuration: duration,
      }));
    }
  }, [track]);

  // Playback logic
  const startPlayback = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    const intervalMs = 100; // Update every 100ms for smooth animation
    const speedMultiplier = playbackState.playbackSpeed;

    playbackIntervalRef.current = setInterval(() => {
      setPlaybackState((prev) => {
        if (prev.currentIndex >= track.locations.length - 1) {
          // Reached end, stop playback
          return { ...prev, isPlaying: false };
        }

        const currentLocation = track.locations[prev.currentIndex];
        const nextLocation = track.locations[prev.currentIndex + 1];

        if (!currentLocation || !nextLocation) {
          return { ...prev, isPlaying: false };
        }

        // Calculate time progression
        const timeDiff =
          (nextLocation.timestamp - currentLocation.timestamp) / 1000; // seconds
        const progressIncrement = (intervalMs / 1000) * speedMultiplier;

        let newCurrentTime = prev.currentTime + progressIncrement;
        let newIndex = prev.currentIndex;

        // Check if we should move to next point
        const currentPointTime =
          (currentLocation.timestamp - track.locations[0].timestamp) / 1000;
        if (newCurrentTime >= currentPointTime + timeDiff) {
          newIndex = prev.currentIndex + 1;
          newCurrentTime =
            newIndex < track.locations.length
              ? (track.locations[newIndex].timestamp -
                  track.locations[0].timestamp) /
                1000
              : prev.totalDuration;
        }

        return {
          ...prev,
          currentIndex: newIndex,
          currentTime: newCurrentTime,
        };
      });
    }, intervalMs);
  }, [playbackState.playbackSpeed, track.locations]);

  const stopPlayback = useCallback(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, []);

  // Handle play/pause
  const togglePlayback = useCallback(() => {
    setPlaybackState((prev) => {
      const newIsPlaying = !prev.isPlaying;
      if (newIsPlaying) {
        startPlayback();
      } else {
        stopPlayback();
      }
      return { ...prev, isPlaying: newIsPlaying };
    });
  }, [startPlayback, stopPlayback]);

  // Handle speed change
  const changeSpeed = useCallback(() => {
    setPlaybackState((prev) => {
      const currentSpeedIndex = PLAYBACK_SPEEDS.indexOf(prev.playbackSpeed);
      const nextSpeedIndex = (currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
      const newSpeed = PLAYBACK_SPEEDS[nextSpeedIndex];

      return { ...prev, playbackSpeed: newSpeed };
    });
  }, []);

  // Handle timeline scrub
  const handleTimelineChange = useCallback(
    (value: number) => {
      const newTime = (value / 100) * playbackState.totalDuration;

      // Find the closest location index for this time
      let newIndex = 0;
      for (let i = 0; i < track.locations.length; i++) {
        const locationTime =
          (track.locations[i].timestamp - track.locations[0].timestamp) / 1000;
        if (locationTime <= newTime) {
          newIndex = i;
        } else {
          break;
        }
      }

      setPlaybackState((prev) => ({
        ...prev,
        currentIndex: newIndex,
        currentTime: newTime,
      }));
    },
    [playbackState.totalDuration, track.locations]
  );

  // Restart playback
  const restartPlayback = useCallback(() => {
    setPlaybackState((prev) => ({
      ...prev,
      currentIndex: 0,
      currentTime: 0,
      isPlaying: false,
    }));
    stopPlayback();
  }, [stopPlayback]);

  // Toggle dynamic info display
  const toggleDynamicInfo = useCallback(() => {
    setPlaybackState((prev) => ({
      ...prev,
      showDynamicInfo: !prev.showDynamicInfo,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Update map when playback state changes
  useEffect(() => {
    if (isMapLoaded && webViewRef.current) {
      const currentLocation = track.locations[playbackState.currentIndex];
      const currentSpeed = currentLocation?.speed || 0;

      const updateScript = `
        (function() {
          try {
            if (typeof window.updatePlaybackPosition === 'function') {
              window.updatePlaybackPosition(
                ${playbackState.currentIndex},
                ${JSON.stringify(currentLocation)},
                ${currentSpeed * 3.6}, // Convert to km/h
                ${playbackState.currentTime},
                ${playbackState.totalDuration},
                ${playbackState.showDynamicInfo}
              );
            }
          } catch (error) {
            console.error('Playback update error:', error);
          }
        })();
        true;
      `;

      webViewRef.current.injectJavaScript(updateScript);
    }
  }, [
    isMapLoaded,
    playbackState.currentIndex,
    playbackState.currentTime,
    playbackState.showDynamicInfo,
    track.locations,
  ]);

  // Generate HTML for playback map
  const generatePlaybackMapHTML = () => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Track Playback</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      background-color: ${isDarkTheme ? "#0f172a" : "#f8fafc"};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      overflow: hidden;
    }
    #map { 
      height: 100vh; 
      width: 100vw; 
      background-color: ${isDarkTheme ? "#0f172a" : "#f8fafc"};
    }
    .playback-marker {
      animation: pulse-playback 2s infinite;
      z-index: 1000;
    }
    @keyframes pulse-playback {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }
    .track-line-completed {
      stroke: #1e40af;
      stroke-width: 5;
      stroke-opacity: 0.9;
    }
    .track-line-remaining {
      stroke: #94a3b8;
      stroke-width: 3;
      stroke-opacity: 0.4;
    }
    .direction-arrow {
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .direction-arrow:hover {
      transform: scale(1.1);
    }
    .dynamic-info-popup {
      background: ${
        isDarkTheme ? "rgba(15, 23, 42, 0.95)" : "rgba(248, 250, 252, 0.95)"
      };
      color: ${isDarkTheme ? "#f1f5f9" : "#0f172a"};
      border: 2px solid #1e40af;
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 8px 25px rgba(30, 64, 175, 0.3);
      backdrop-filter: blur(10px);
      min-width: 180px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      padding: 2px 0;
      border-bottom: 1px solid rgba(30, 64, 175, 0.2);
    }
    .info-row:last-child {
      border-bottom: none;
      margin-top: 8px;
      font-weight: 700;
      color: #1e40af;
    }
    .info-label {
      opacity: 0.8;
    }
    .info-value {
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map = null;
    let trackLayerGroup = null;
    let currentMarker = null;
    let directionArrow = null;
    let completedPath = null;
    let remainingPath = null;
    let dynamicInfoPopup = null;
    
    const trackData = ${JSON.stringify(track.locations)};
    const trackColor = '#1e40af'; // Dark blue

    window.initializePlaybackMap = function() {
      try {
        // Initialize map
        map = window.L.map('map', {
          zoomControl: true,
          attributionControl: true,
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          boxZoom: false,
          keyboard: true,
          tap: true
        });

        // Add tile layer
        const tileLayer = window.L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            attribution: '© Esri',
            maxZoom: 18,
            minZoom: 2
          }
        );
        tileLayer.addTo(map);

        trackLayerGroup = window.L.layerGroup().addTo(map);

        // Draw initial track
        if (trackData.length > 1) {
          const trackCoords = trackData.map(loc => [loc.latitude, loc.longitude]);
          
          // Remaining path (full track in light gray)
          remainingPath = window.L.polyline(trackCoords, {
            color: '#94a3b8',
            weight: 3,
            opacity: 0.4,
            className: 'track-line-remaining'
          });
          trackLayerGroup.addLayer(remainingPath);

          // Completed path (initially empty, dark blue)
          completedPath = window.L.polyline([], {
            color: '#1e40af',
            weight: 5,
            opacity: 0.9,
            className: 'track-line-completed'
          });
          trackLayerGroup.addLayer(completedPath);

          // Fit map to track bounds
          const bounds = window.L.latLngBounds(trackCoords);
          map.fitBounds(bounds, { padding: [50, 50] });

          // Create initial marker with modern design
          const startLocation = trackData[0];
          const markerIcon = window.L.divIcon({
            html: \`<div style="
              background: linear-gradient(135deg, #1e40af, #3b82f6);
              width: 24px; 
              height: 24px; 
              border-radius: 50%; 
              border: 3px solid white; 
              box-shadow: 0 4px 15px rgba(30, 64, 175, 0.4);
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <div style="
                width: 8px;
                height: 8px;
                background: white;
                border-radius: 50%;
              "></div>
              <div style="
                position: absolute;
                top: -6px;
                left: -6px;
                width: 36px;
                height: 36px;
                border: 2px solid #1e40af;
                border-radius: 50%;
                opacity: 0.3;
                animation: pulse-playback 2s infinite;
              "></div>
            </div>\`,
            className: 'playback-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          currentMarker = window.L.marker([startLocation.latitude, startLocation.longitude], {
            icon: markerIcon,
            zIndexOffset: 1000
          });
          trackLayerGroup.addLayer(currentMarker);

          // Create direction arrow (initially hidden)
          createDirectionArrow(startLocation, startLocation);
        }

        // Signal ready
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'playbackMapReady'
          }));
        }

      } catch (error) {
        console.error('Playback map initialization error:', error);
      }
    }

    // Create direction arrow with click handler
    function createDirectionArrow(currentLocation, previousLocation) {
      if (directionArrow) {
        trackLayerGroup.removeLayer(directionArrow);
      }

      // Calculate bearing
      const bearing = calculateBearing(
        previousLocation.latitude, 
        previousLocation.longitude, 
        currentLocation.latitude, 
        currentLocation.longitude
      );

      const arrowIcon = window.L.divIcon({
        html: \`<div style="transform: rotate(\${bearing}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                 <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 3px 6px rgba(30, 64, 175, 0.4));">
                   <path d="M16 4 L26 24 L16 20 L6 24 Z" fill="#1e40af" stroke="white" strokeWidth="2"/>
                   <circle cx="16" cy="16" r="2" fill="white"/>
                 </svg>
               </div>\`,
        className: "direction-arrow",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      directionArrow = window.L.marker([currentLocation.latitude, currentLocation.longitude], { 
        icon: arrowIcon,
        zIndexOffset: 1001
      });

      // Add click handler for dynamic info
      directionArrow.on('click', function() {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'arrowClicked'
          }));
        }
      });

      trackLayerGroup.addLayer(directionArrow);
    }

    // Calculate bearing between two points
    function calculateBearing(lat1, lng1, lat2, lng2) {
      try {
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const lat1Rad = (lat1 * Math.PI) / 180;
        const lat2Rad = (lat2 * Math.PI) / 180;
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        const bearing = (Math.atan2(y, x) * 180) / Math.PI;
        return (bearing + 360) % 360;
      } catch (error) {
        console.error('Bearing calculation error:', error);
        return 0;
      }
    }

    window.updatePlaybackPosition = function(currentIndex, currentLocation, currentSpeed, currentTime, totalDuration, showDynamicInfo) {
      try {
        if (!map || !trackLayerGroup || !currentLocation) return;

        // Update marker position
        if (currentMarker) {
          currentMarker.setLatLng([currentLocation.latitude, currentLocation.longitude]);
        }

        // Update direction arrow with previous location for bearing calculation
        if (currentIndex > 0) {
          const previousLocation = trackData[currentIndex - 1];
          createDirectionArrow(currentLocation, previousLocation);
        }

        // Update completed path
        if (completedPath && currentIndex > 0) {
          const completedCoords = trackData.slice(0, currentIndex + 1).map(loc => [loc.latitude, loc.longitude]);
          completedPath.setLatLngs(completedCoords);
        }

        // Show/hide dynamic info popup
        if (showDynamicInfo && directionArrow) {
          const progress = ((currentTime / totalDuration) * 100).toFixed(1);
          const timeStr = new Date(currentLocation.timestamp).toLocaleTimeString();
          
          const popupContent = \`
            <div class="dynamic-info-popup">
              <div class="info-row">
                <span class="info-label">Speed:</span>
                <span class="info-value">\${currentSpeed.toFixed(1)} km/h</span>
              </div>
              <div class="info-row">
                <span class="info-label">Time:</span>
                <span class="info-value">\${timeStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Progress:</span>
                <span class="info-value">\${progress}%</span>
              </div>
              <div class="info-row">
                <span class="info-label">Altitude:</span>
                <span class="info-value">\${currentLocation.altitude ? Math.round(currentLocation.altitude) + 'm' : 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-value">📍 Live Tracking</span>
              </div>
            </div>
          \`;

          if (dynamicInfoPopup) {
            map.closePopup(dynamicInfoPopup);
          }

          dynamicInfoPopup = window.L.popup({
            closeButton: false,
            autoClose: false,
            closeOnClick: false,
            className: 'dynamic-info-popup-container'
          })
          .setLatLng([currentLocation.latitude, currentLocation.longitude])
          .setContent(popupContent)
          .openOn(map);
        } else if (dynamicInfoPopup) {
          map.closePopup(dynamicInfoPopup);
          dynamicInfoPopup = null;
        }

        // Center map on current position (smooth pan)
        map.panTo([currentLocation.latitude, currentLocation.longitude], {
          animate: true,
          duration: 0.5
        });

      } catch (error) {
        console.error('Position update error:', error);
      }
    }

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", window.initializePlaybackMap);
    } else {
      window.initializePlaybackMap();
    }
  </script>
</body>
</html>
    `;
  };

  // Handle WebView messages
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "playbackMapReady") {
        setIsMapLoaded(true);
      } else if (data.type === "arrowClicked") {
        toggleDynamicInfo();
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Format date and time
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return { dateStr, timeStr };
  };

  // Get current location data
  const currentLocation = track.locations[playbackState.currentIndex];
  const currentSpeed = currentLocation?.speed ? currentLocation.speed * 3.6 : 0;

  return (
    <View style={styles.container}>
      {/* Fullscreen Map */}
      <WebView
        ref={webViewRef}
        source={{ html: generatePlaybackMapHTML() }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        bounces={false}
      />

      {/* Compact Modern UI Controls - Always Visible */}
      <View
        style={[
          styles.modernControlsContainer,
          { backgroundColor: isDarkTheme ? "#0f172a" : "#ffffff" },
        ]}
      >
        {/* Compact Top Header */}
        <View
          style={[
            styles.compactHeader,
            { borderBottomColor: isDarkTheme ? "#334155" : "#e2e8f0" },
          ]}
        >
          <TouchableOpacity
            onPress={onExit}
            style={[styles.compactExitButton, { backgroundColor: "#ef4444" }]}
          >
            <MaterialIcons name="close" size={16} color="#fff" />
          </TouchableOpacity>

          <View style={styles.compactTrackInfo}>
            <Text
              style={[
                styles.compactTrackTitle,
                { color: isDarkTheme ? "#f1f5f9" : "#0f172a" },
              ]}
              numberOfLines={1}
            >
              {track.name}
            </Text>
            <Text
              style={[
                styles.compactTrackSubtitle,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              {playbackState.showDynamicInfo ? "Live Info ON" : "Playback Mode"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={changeSpeed}
            style={[styles.compactSpeedButton, { backgroundColor: "#1e40af" }]}
          >
            <Text style={styles.compactSpeedText}>
              {playbackState.playbackSpeed}×
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Data Cards - 5 boxes */}
        <View style={styles.compactDataContainer}>
          {/* Speed Card */}
          <View
            style={[
              styles.compactDataCard,
              { backgroundColor: isDarkTheme ? "#1e293b" : "#f8fafc" },
            ]}
          >
            <MaterialIcons name="speed" size={14} color="#1e40af" />
            <Text
              style={[
                styles.compactDataValue,
                { color: isDarkTheme ? "#f1f5f9" : "#0f172a" },
              ]}
            >
              {currentSpeed.toFixed(0)}
            </Text>
            <Text
              style={[
                styles.compactDataLabel,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              km/h
            </Text>
          </View>

          {/* Altitude Card */}
          <View
            style={[
              styles.compactDataCard,
              { backgroundColor: isDarkTheme ? "#1e293b" : "#f8fafc" },
            ]}
          >
            <MaterialIcons name="terrain" size={14} color="#059669" />
            <Text
              style={[
                styles.compactDataValue,
                { color: isDarkTheme ? "#f1f5f9" : "#0f172a" },
              ]}
            >
              {currentLocation?.altitude
                ? Math.round(currentLocation.altitude)
                : 0}
            </Text>
            <Text
              style={[
                styles.compactDataLabel,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              m
            </Text>
          </View>

          {/* Progress Card */}
          <View
            style={[
              styles.compactDataCard,
              { backgroundColor: isDarkTheme ? "#1e293b" : "#f8fafc" },
            ]}
          >
            <MaterialIcons name="timeline" size={14} color="#7c3aed" />
            <Text
              style={[
                styles.compactDataValue,
                { color: isDarkTheme ? "#f1f5f9" : "#0f172a" },
              ]}
            >
              {(
                (playbackState.currentTime / playbackState.totalDuration) *
                100
              ).toFixed(0)}
            </Text>
            <Text
              style={[
                styles.compactDataLabel,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              %
            </Text>
          </View>

          {/* Time Card */}
          <View
            style={[
              styles.compactDataCard,
              { backgroundColor: isDarkTheme ? "#1e293b" : "#f8fafc" },
            ]}
          >
            <MaterialIcons name="access-time" size={14} color="#f59e0b" />
            <Text
              style={[
                styles.compactDataValue,
                { color: isDarkTheme ? "#f1f5f9" : "#0f172a", fontSize: 11 },
              ]}
            >
              {formatTime(playbackState.currentTime)}
            </Text>
            <Text
              style={[
                styles.compactDataLabel,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              TIME
            </Text>
          </View>

          {/* Date/Time Card - 5th box */}
          <TouchableOpacity
            style={[
              styles.compactDataCard,
              styles.clickableCard,
              {
                backgroundColor: playbackState.showDynamicInfo
                  ? isDarkTheme
                    ? "#1e40af"
                    : "#3b82f6"
                  : isDarkTheme
                  ? "#1e293b"
                  : "#f8fafc",
              },
            ]}
            onPress={toggleDynamicInfo}
          >
            <MaterialIcons
              name="event"
              size={14}
              color={
                playbackState.showDynamicInfo
                  ? "#fff"
                  : isDarkTheme
                  ? "#94a3b8"
                  : "#64748b"
              }
            />
            <Text
              style={[
                styles.compactDataValue,
                {
                  color: playbackState.showDynamicInfo
                    ? "#fff"
                    : isDarkTheme
                    ? "#f1f5f9"
                    : "#0f172a",
                  fontSize: 9,
                },
              ]}
            >
              {currentLocation
                ? formatDateTime(currentLocation.timestamp).dateStr
                : "N/A"}
            </Text>
            <Text
              style={[
                styles.compactDataLabel,
                {
                  color: playbackState.showDynamicInfo
                    ? "#fff"
                    : isDarkTheme
                    ? "#94a3b8"
                    : "#64748b",
                  fontSize: 7,
                },
              ]}
            >
              {currentLocation
                ? formatDateTime(currentLocation.timestamp).timeStr
                : "LIVE"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Timeline Controls */}
        <View
          style={[
            styles.compactTimelineSection,
            { borderTopColor: isDarkTheme ? "#334155" : "#e2e8f0" },
          ]}
        >
          <View style={styles.compactTimelineContainer}>
            <Text
              style={[
                styles.compactTimeText,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              {formatTime(playbackState.currentTime)}
            </Text>

            <Slider
              style={styles.compactTimeline}
              value={
                (playbackState.currentTime / playbackState.totalDuration) * 100
              }
              onValueChange={handleTimelineChange}
              minimumValue={0}
              maximumValue={100}
              minimumTrackTintColor="#1e40af"
              maximumTrackTintColor={isDarkTheme ? "#475569" : "#cbd5e1"}
              thumbStyle={{ backgroundColor: "#1e40af", width: 16, height: 16 }}
            />

            <Text
              style={[
                styles.compactTimeText,
                { color: isDarkTheme ? "#94a3b8" : "#64748b" },
              ]}
            >
              {formatTime(playbackState.totalDuration)}
            </Text>
          </View>

          {/* Compact Playback Controls */}
          <View style={styles.compactPlaybackControls}>
            <TouchableOpacity
              onPress={restartPlayback}
              style={[
                styles.compactControlButton,
                styles.compactSecondaryButton,
              ]}
            >
              <MaterialIcons
                name="replay"
                size={20}
                color={isDarkTheme ? "#f1f5f9" : "#0f172a"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlayback}
              style={[
                styles.compactControlButton,
                styles.compactPrimaryButton,
                { backgroundColor: "#1e40af" },
              ]}
            >
              <MaterialIcons
                name={playbackState.isPlaying ? "pause" : "play-arrow"}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const nextIndex = Math.min(
                  playbackState.currentIndex + 10,
                  track.locations.length - 1
                );
                const nextTime =
                  nextIndex < track.locations.length
                    ? (track.locations[nextIndex].timestamp -
                        track.locations[0].timestamp) /
                      1000
                    : playbackState.totalDuration;
                setPlaybackState((prev) => ({
                  ...prev,
                  currentIndex: nextIndex,
                  currentTime: nextTime,
                }));
              }}
              style={[
                styles.compactControlButton,
                styles.compactSecondaryButton,
              ]}
            >
              <MaterialIcons
                name="fast-forward"
                size={20}
                color={isDarkTheme ? "#f1f5f9" : "#0f172a"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  webview: {
    flex: 1,
  },
  modernControlsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },

  // Compact Header Styles
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  compactExitButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  compactTrackInfo: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 12,
  },
  compactTrackTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 1,
  },
  compactTrackSubtitle: {
    fontSize: 10,
    textAlign: "center",
    fontWeight: "500",
  },
  compactSpeedButton: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  compactSpeedText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },

  // Compact Data Cards Styles
  compactDataContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  compactDataCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    minHeight: 60,
    justifyContent: "center",
  },
  clickableCard: {
    elevation: 2,
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  compactDataValue: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 2,
    marginBottom: 1,
    textAlign: "center",
  },
  compactDataLabel: {
    fontSize: 8,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },

  // Compact Timeline Styles
  compactTimelineSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  compactTimelineContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  compactTimeline: {
    flex: 1,
    height: 30,
  },
  compactTimeText: {
    fontSize: 10,
    fontWeight: "600",
    minWidth: 35,
    textAlign: "center",
  },
  compactPlaybackControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  compactControlButton: {
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  compactPrimaryButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  compactSecondaryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(148, 163, 184, 0.2)",
  },
});

export default TrackPlaybackView;
