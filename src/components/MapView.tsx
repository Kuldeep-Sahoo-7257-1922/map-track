"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { View, StyleSheet } from "react-native"
import { WebView } from "react-native-webview"
import type { LocationPoint } from "../types"

interface Props {
  locations: LocationPoint[]
  currentLocation: LocationPoint | null
  isTracking: boolean
  isDarkTheme?: boolean
  style?: any
  showLayerSelector?: boolean
  isFullscreen?: boolean
  onExitFullscreen?: () => void
}

const MapComponent: React.FC<Props> = ({
  locations,
  currentLocation,
  isTracking,
  isDarkTheme = false,
  style,
  showLayerSelector = true,
  isFullscreen = false,
  onExitFullscreen,
}) => {
  const webViewRef = useRef<WebView>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)

  // Generate HTML for Leaflet map with error handling
  const generateMapHTML = () => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Location Tracker Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      background-color: ${isDarkTheme ? "#1f2937" : "#f3f4f6"};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }
    #map { 
      height: 100vh; 
      width: 100vw; 
      background-color: ${isDarkTheme ? "#1f2937" : "#f3f4f6"};
    }
    .layer-control {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      min-width: 150px;
    }
    .layer-control select {
      border: 1px solid #ccc;
      background: white;
      font-size: 14px;
      padding: 6px;
      border-radius: 4px;
      width: 100%;
    }
    .exit-fullscreen {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .exit-fullscreen:hover {
      background: rgba(240, 240, 240, 0.95);
    }
    .error-message {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.95);
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      text-align: center;
      z-index: 1001;
      display: none;
    }
    .current-location-marker {
      animation: pulse-recording 2s infinite;
    }

    @keyframes pulse-recording {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.1);
        opacity: 0.8;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .current-location-marker svg {
      transition: transform 0.3s ease;
    }
    ${
      isDarkTheme
        ? `
    .layer-control {
      background: rgba(0, 0, 0, 0.9);
      color: white;
    }
    .layer-control select {
      color: white;
      background: rgba(0, 0, 0, 0.8);
      border-color: #555;
    }
    .exit-fullscreen {
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-color: #555;
    }
    .exit-fullscreen:hover {
      background: rgba(40, 40, 40, 0.9);
    }
    .error-message {
      background: rgba(0, 0, 0, 0.9);
      color: white;
    }
    `
        : ""
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="errorMessage" class="error-message">
    <h3>Map Loading Error</h3>
    <p>Failed to load the map. Please check your internet connection.</p>
    <button onclick="retryMap()">Retry</button>
  </div>
  
  ${
    isFullscreen
      ? `
  <button class="exit-fullscreen" onclick="exitFullscreen()">
    ← Exit Fullscreen
  </button>
  `
      : ""
  }
  
  ${
    showLayerSelector
      ? `
  <div class="layer-control">
    <select id="layerSelect" onchange="changeLayer()">
      <option value="osm">🗺️ Street Map</option>
      <option value="satellite" ${isDarkTheme ? "" : "selected"}>🛰️ Satellite</option>
      <option value="terrain">🏔️ Terrain</option>
      <option value="dark" ${isDarkTheme ? "selected" : ""}>🌙 Dark</option>
      <option value="light">☀️ Light</option>
    </select>
  </div>
  `
      : ""
  }

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // Global error handling
    window.addEventListener('error', function(e) {
      console.error('Map error:', e.error);
      window.showErrorMessage();
    });

    window.addEventListener('unhandledrejection', function(e) {
      console.error('Map promise rejection:', e.reason);
      window.showErrorMessage();
    });

    window.showErrorMessage = function() {
      const errorDiv = document.getElementById('errorMessage');
      if (errorDiv) {
        errorDiv.style.display = 'block';
      }
    }

    window.hideErrorMessage = function() {
      const errorDiv = document.getElementById('errorMessage');
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    }

    window.retryMap = function() {
      window.hideErrorMessage();
      window.initializeMap();
    }

    let map = null;
    let currentTileLayer = null;
    let trackLayerGroup = null;

    // Map layers with fallback
    const mapLayers = {
      osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          timeout: 10000
        }
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
          attribution: '© Esri, © DigitalGlobe',
          maxZoom: 19,
          timeout: 10000
        }
      },
      terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: {
          attribution: '© OpenTopoMap contributors',
          maxZoom: 17,
          timeout: 10000
        }
      },
      dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: {
          attribution: '© OpenStreetMap contributors © CARTO',
          maxZoom: 19,
          timeout: 10000
        }
      },
      light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: {
          attribution: '© OpenStreetMap contributors © CARTO',
          maxZoom: 19,
          timeout: 10000
        }
      }
    };

    window.initializeMap = function() {
      try {
        // Clear any existing map
        if (map) {
          map.remove();
          map = null;
        }

        // Fix for default markers
        if (typeof window.L !== 'undefined' && window.L.Icon && window.L.Icon.Default) {
          delete window.L.Icon.Default.prototype._getIconUrl;
          window.L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          });
        }

        // Initialize map
        map = window.L.map('map', {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true // Better performance for many markers
        }).setView([0, 0], 13);

        trackLayerGroup = window.L.layerGroup().addTo(map);

        // Set initial layer
        const initialLayer = ${isDarkTheme ? "'dark'" : "'satellite'"};
        const layerConfig = mapLayers[initialLayer];
        currentTileLayer = window.L.tileLayer(layerConfig.url, layerConfig.options);
        currentTileLayer.addTo(map);

        // Handle tile loading errors
        currentTileLayer.on('tileerror', function(e) {
          console.warn('Tile loading error:', e);
        });

        window.hideErrorMessage();
        
        // Signal that map is ready
        setTimeout(() => {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'mapReady'
            }));
          }
        }, 500);

      } catch (error) {
        console.error('Map initialization error:', error);
        window.showErrorMessage();
      }
    }

    // Change layer function
    window.changeLayer = function() {
      try {
        const selectedLayer = document.getElementById('layerSelect').value;
        if (currentTileLayer && map) {
          map.removeLayer(currentTileLayer);
        }
        const layerConfig = mapLayers[selectedLayer];
        currentTileLayer = window.L.tileLayer(layerConfig.url, layerConfig.options);
        currentTileLayer.addTo(map);

        // Handle tile loading errors
        currentTileLayer.on('tileerror', function(e) {
          console.warn('Tile loading error:', e);
        });
      } catch (error) {
        console.error('Layer change error:', error);
      }
    }

    // Exit fullscreen function
    window.exitFullscreen = function() {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'exitFullscreen'
          }));
        }
      } catch (error) {
        console.error('Exit fullscreen error:', error);
      }
    }

    // Get speed color
    window.getSpeedColor = function(speed) {
      if (speed < 1) return '#10b981';
      if (speed < 5) return '#f59e0b';
      if (speed < 10) return '#f97316';
      return '#ef4444';
    }

    // Calculate bearing between two points
    window.calculateBearing = function(lat1, lng1, lat2, lng2) {
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

    // Update map with locations
    window.updateMapData = function(locations, currentLocation, isTracking) {
      try {
        if (!map || !trackLayerGroup) {
          console.warn('Map not ready for update');
          return;
        }

        // Clear existing track
        trackLayerGroup.clearLayers();

        if (!locations || locations.length === 0) return;

        // Create track polylines with speed colors
        if (locations.length > 1) {
          for (let i = 1; i < locations.length; i++) {
            const prev = locations[i - 1];
            const curr = locations[i];
            
            if (!prev || !curr || !prev.latitude || !prev.longitude || !curr.latitude || !curr.longitude) {
              continue;
            }

            const speed = curr.speed || 0;
            const color = window.getSpeedColor(speed);

            const segment = window.L.polyline([
              [prev.latitude, prev.longitude],
              [curr.latitude, curr.longitude]
            ], {
              color: color,
              weight: 4,
              opacity: 0.8
            });

            // Add click popup for segment details
            const distance = map.distance([prev.latitude, prev.longitude], [curr.latitude, curr.longitude]);
            const timeDiff = Math.max(1, (curr.timestamp - prev.timestamp) / 1000);
            const avgSpeed = Math.max(0, (distance / timeDiff) * 3.6);

            segment.bindPopup(\`
              <div style="min-width: 200px;">
                <h4 style="margin: 0 0 8px 0; font-weight: bold;">📊 Segment Details</h4>
                <div style="font-size: 12px; line-height: 1.4;">
                  <div><strong>Time:</strong> \${new Date(prev.timestamp).toLocaleTimeString()} - \${new Date(curr.timestamp).toLocaleTimeString()}</div>
                  <div><strong>Distance:</strong> \${distance.toFixed(1)}m</div>
                  <div><strong>Duration:</strong> \${timeDiff.toFixed(1)}s</div>
                  <div><strong>Speed:</strong> \${(speed * 3.6).toFixed(1)} km/h</div>
                  <div><strong>Avg Speed:</strong> \${avgSpeed.toFixed(1)} km/h</div>
                  \${curr.altitude && prev.altitude ? \`<div><strong>Elevation Change:</strong> \${(curr.altitude - prev.altitude).toFixed(1)}m</div>\` : ''}
                  <div><strong>Coordinates:</strong></div>
                  <div>Start: \${prev.latitude.toFixed(6)}, \${prev.longitude.toFixed(6)}</div>
                  <div>End: \${curr.latitude.toFixed(6)}, \${curr.longitude.toFixed(6)}</div>
                </div>
              </div>
            \`);

            trackLayerGroup.addLayer(segment);
          }

          // Fit map to track bounds
          try {
            const allCoords = locations.map(loc => [loc.latitude, loc.longitude]).filter(coord => coord[0] && coord[1]);
            if (allCoords.length > 0) {
              const bounds = window.L.latLngBounds(allCoords);
              map.fitBounds(bounds, { padding: [20, 20] });
            }
          } catch (error) {
            console.warn('Error fitting bounds:', error);
          }
        } else if (locations.length === 1) {
          // Center on single location
          const loc = locations[0];
          if (loc && loc.latitude && loc.longitude) {
            map.setView([loc.latitude, loc.longitude], 15);
          }
        }

        // Add start marker (green)
        if (locations.length > 0) {
          const startLoc = locations[0];
          if (startLoc && startLoc.latitude && startLoc.longitude) {
            const startIcon = window.L.divIcon({
              html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">S</div>',
              className: 'custom-marker',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            const startMarker = window.L.marker([startLoc.latitude, startLoc.longitude], { icon: startIcon })
              .bindPopup(\`
                <div>
                  <h4 style="margin: 0 0 8px 0; font-weight: bold;">🏁 Start Point</h4>
                  <div style="font-size: 12px; line-height: 1.4;">
                    <div><strong>Time:</strong> \${new Date(startLoc.timestamp).toLocaleString()}</div>
                    <div><strong>Coordinates:</strong> \${startLoc.latitude.toFixed(6)}, \${startLoc.longitude.toFixed(6)}</div>
                    <div><strong>Accuracy:</strong> \${startLoc.accuracy ? Math.round(startLoc.accuracy) + 'm' : 'Unknown'}</div>
                    \${startLoc.altitude ? \`<div><strong>Altitude:</strong> \${Math.round(startLoc.altitude)}m</div>\` : ''}
                  </div>
                </div>
              \`);
            trackLayerGroup.addLayer(startMarker);
          }
        }

        // Add end marker (red arrow) if not tracking and multiple points
        if (!isTracking && locations.length > 1) {
          const lastLocation = locations[locations.length - 1];
          const secondLastLocation = locations[locations.length - 2];
          
          if (lastLocation && secondLastLocation && 
              lastLocation.latitude && lastLocation.longitude &&
              secondLastLocation.latitude && secondLastLocation.longitude) {
            
            const bearing = window.calculateBearing(
              secondLastLocation.latitude, secondLastLocation.longitude,
              lastLocation.latitude, lastLocation.longitude
            );

            const endIcon = window.L.divIcon({
              html: \`<div style="transform: rotate(\${bearing}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                       <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                         <path d="M15 2 L25 22 L15 18 L5 22 Z" fill="#ef4444" stroke="white" strokeWidth="2"/>
                       </svg>
                     </div>\`,
              className: 'custom-arrow-marker',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            });

            const endMarker = window.L.marker([lastLocation.latitude, lastLocation.longitude], { icon: endIcon })
              .bindPopup(\`
                <div>
                  <h4 style="margin: 0 0 8px 0; font-weight: bold;">🏁 End Point</h4>
                  <div style="font-size: 12px; line-height: 1.4;">
                    <div><strong>Time:</strong> \${new Date(lastLocation.timestamp).toLocaleString()}</div>
                    <div><strong>Coordinates:</strong> \${lastLocation.latitude.toFixed(6)}, \${lastLocation.longitude.toFixed(6)}</div>
                    <div><strong>Accuracy:</strong> \${lastLocation.accuracy ? Math.round(lastLocation.accuracy) + 'm' : 'Unknown'}</div>
                    \${lastLocation.speed ? \`<div><strong>Final Speed:</strong> \${(lastLocation.speed * 3.6).toFixed(1)} km/h</div>\` : ''}
                    \${lastLocation.altitude ? \`<div><strong>Altitude:</strong> \${Math.round(lastLocation.altitude)}m</div>\` : ''}
                    <div><strong>Direction:</strong> \${bearing.toFixed(0)}°</div>
                  </div>
                </div>
              \`);
            trackLayerGroup.addLayer(endMarker);
          }
        }

        // Add current location marker (red arrow) during active tracking
        if (isTracking && currentLocation && locations.length > 1) {
          const secondLastLocation = locations[locations.length - 2];

          if (secondLastLocation && 
              currentLocation.latitude && currentLocation.longitude &&
              secondLastLocation.latitude && secondLastLocation.longitude) {
            
            // Calculate bearing for arrow direction
            const bearing = window.calculateBearing(
              secondLastLocation.latitude, secondLastLocation.longitude,
              currentLocation.latitude, currentLocation.longitude
            );

            // Use the EXACT coordinates from the last location in the locations array
            // This ensures the arrow is positioned exactly at the end of the track line
            const lastTrackLocation = locations[locations.length - 1];

            const currentIcon = window.L.divIcon({
              html: \`<div style="transform: rotate(\${bearing}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                       <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
                         <path d="M16 2 L26 24 L16 20 L6 24 Z" fill="#ef4444" stroke="white" strokeWidth="2"/>
                         <circle cx="16" cy="16" r="3" fill="white" stroke="#ef4444" strokeWidth="1"/>
                       </svg>
                     </div>\`,
              className: 'current-location-marker',
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            });

            // Position the marker at the EXACT end of the track line
            const currentMarker = window.L.marker([lastTrackLocation.latitude, lastTrackLocation.longitude], { icon: currentIcon })
              .bindPopup(\`
                <div>
                  <h4 style="margin: 0 0 8px 0; font-weight: bold;">📍 Current Position</h4>
                  <div style="font-size: 12px; line-height: 1.4;">
                    <div><strong>Time:</strong> \${new Date(lastTrackLocation.timestamp).toLocaleString()}</div>
                    <div><strong>Coordinates:</strong> \${lastTrackLocation.latitude.toFixed(6)}, \${lastTrackLocation.longitude.toFixed(6)}</div>
                    <div><strong>Accuracy:</strong> \${lastTrackLocation.accuracy ? Math.round(lastTrackLocation.accuracy) + 'm' : 'Unknown'}</div>
                    \${lastTrackLocation.speed ? \`<div><strong>Current Speed:</strong> \${(lastTrackLocation.speed * 3.6).toFixed(1)} km/h</div>\` : ''}
                    \${lastTrackLocation.altitude ? \`<div><strong>Altitude:</strong> \${Math.round(lastTrackLocation.altitude)}m</div>\` : ''}
                    <div><strong>Direction:</strong> \${bearing.toFixed(0)}°</div>
                    <div style="margin-top: 8px; padding: 4px; background: #ef4444; color: white; border-radius: 4px; text-align: center; font-weight: bold;">
                      🔴 RECORDING
                    </div>
                  </div>
                </div>
              \`);
            trackLayerGroup.addLayer(currentMarker);
          }
        } else if (isTracking && currentLocation && locations.length === 1) {
          // For the very first location point during tracking
          const currentIcon = window.L.divIcon({
            html: \`<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                     <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
                       <circle cx="16" cy="16" r="12" fill="#ef4444" stroke="white" strokeWidth="3"/>
                       <circle cx="16" cy="16" r="6" fill="white"/>
                       <circle cx="16" cy="16" r="3" fill="#ef4444"/>
                     </svg>
                   </div>\`,
            className: 'current-location-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const currentMarker = window.L.marker([currentLocation.latitude, currentLocation.longitude], { icon: currentIcon })
            .bindPopup(\`
              <div>
                <h4 style="margin: 0 0 8px 0; font-weight: bold;">🎯 Starting Position</h4>
                <div style="font-size: 12px; line-height: 1.4;">
                  <div><strong>Time:</strong> \${new Date(currentLocation.timestamp).toLocaleString()}</div>
                  <div><strong>Coordinates:</strong> \${currentLocation.latitude.toFixed(6)}, \${currentLocation.longitude.toFixed(6)}</div>
                  <div><strong>Accuracy:</strong> \${currentLocation.accuracy ? Math.round(currentLocation.accuracy) + 'm' : 'Unknown'}</div>
                  \${currentLocation.speed ? \`<div><strong>Current Speed:</strong> \${(currentLocation.speed * 3.6).toFixed(1)} km/h</div>\` : ''}
                  \${currentLocation.altitude ? \`<div><strong>Altitude:</strong> \${Math.round(currentLocation.altitude)}m</div>\` : ''}
                  <div style="margin-top: 8px; padding: 4px; background: #ef4444; color: white; border-radius: 4px; text-align: center; font-weight: bold;">
                    🔴 RECORDING
                  </div>
                </div>
              </div>
            \`);
          trackLayerGroup.addLayer(currentMarker);
        }

      } catch (error) {
        console.error('Map update error:', error);
        window.showErrorMessage();
      }
    }

    // Initialize map when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', window.initializeMap);
    } else {
      window.initializeMap();
    }
  </script>
</body>
</html>
    `
  }

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)

      if (data.type === "exitFullscreen" && onExitFullscreen) {
        onExitFullscreen()
      } else if (data.type === "mapReady") {
        console.log("Map is ready")
        setIsMapLoaded(true)
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error)
    }
  }

  // Handle WebView errors
  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent
    console.error("WebView error:", nativeEvent)
  }

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent
    console.error("WebView HTTP error:", nativeEvent)
  }

  // Update map data with throttling to prevent excessive updates
  const lastUpdateRef = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (isMapLoaded && webViewRef.current && now - lastUpdateRef.current > 1000) {
      // Throttle to max 1 update per second
      lastUpdateRef.current = now

      const updateScript = `
        (function() {
          try {
            if (typeof window.updateMapData === 'function') {
              window.updateMapData(
                ${JSON.stringify(locations)},
                ${JSON.stringify(currentLocation)},
                ${isTracking}
              );
            }
          } catch (error) {
            console.error('Update script error:', error);
          }
        })();
        true;
      `

      webViewRef.current.injectJavaScript(updateScript)
    }
  }, [locations, currentLocation, isTracking, isMapLoaded])

  // Only reload for theme changes or fullscreen changes
  useEffect(() => {
    if (webViewRef.current) {
      console.log("Reloading WebView for theme/fullscreen change")
      setIsMapLoaded(false)
      webViewRef.current.reload()
    }
  }, [isDarkTheme, isFullscreen, showLayerSelector])

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: generateMapHTML() }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        scrollEnabled={true}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleHttpError}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => {
          console.log("WebView load ended")
          // Fallback in case message doesn't work
          setTimeout(() => {
            if (!isMapLoaded) {
              setIsMapLoaded(true)
            }
          }, 3000)
        }}
        onLoadStart={() => {
          console.log("WebView load started")
        }}
        renderError={(errorDomain, errorCode, errorDesc) => (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Map failed to load</Text>
            <Text style={styles.errorDetails}>{errorDesc}</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#dc2626",
    marginBottom: 8,
  },
  errorDetails: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
})

export default MapComponent
