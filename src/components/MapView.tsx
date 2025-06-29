"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { LocationPoint } from "../types";

interface Props {
  locations: LocationPoint[];
  currentLocation: LocationPoint | null;
  isTracking: boolean;
  isDarkTheme?: boolean;
  style?: any;
  showLayerSelector?: boolean;
  isFullscreen?: boolean;
  onExitFullscreen?: () => void;
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
  const webViewRef = useRef<WebView>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Generate HTML for Leaflet map
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
        `
            : ""
        }
    </style>
</head>
<body>
    <div id="map"></div>
    
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
            <option value="satellite" ${
              isDarkTheme ? "" : "selected"
            }>🛰️ Satellite</option>
            <option value="terrain">🏔️ Terrain</option>
            <option value="dark" ${
              isDarkTheme ? "selected" : ""
            }>🌙 Dark</option>
            <option value="light">☀️ Light</option>
        </select>
    </div>
    `
        : ""
    }

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Fix for default markers
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Initialize map
        const map = L.map('map').setView([0, 0], 13);
        let currentTileLayer = null;
        let trackLayerGroup = L.layerGroup().addTo(map);

        // Map layers
        const mapLayers = {
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri, © DigitalGlobe',
                maxZoom: 19
            }),
            terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap contributors',
                maxZoom: 17
            }),
            dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                maxZoom: 19
            }),
            light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                maxZoom: 19
            })
        };

        // Set initial layer
        const initialLayer = ${isDarkTheme ? "'dark'" : "'satellite'"};
        currentTileLayer = mapLayers[initialLayer];
        currentTileLayer.addTo(map);

        // Change layer function
        function changeLayer() {
            const selectedLayer = document.getElementById('layerSelect').value;
            if (currentTileLayer) {
                map.removeLayer(currentTileLayer);
            }
            currentTileLayer = mapLayers[selectedLayer];
            currentTileLayer.addTo(map);
        }

        // Exit fullscreen function
        function exitFullscreen() {
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
        function getSpeedColor(speed) {
            if (speed < 1) return '#10b981';
            if (speed < 5) return '#f59e0b';
            if (speed < 10) return '#f97316';
            return '#ef4444';
        }

        // Calculate bearing between two points
        function calculateBearing(lat1, lng1, lat2, lng2) {
            const dLng = ((lng2 - lng1) * Math.PI) / 180;
            const lat1Rad = (lat1 * Math.PI) / 180;
            const lat2Rad = (lat2 * Math.PI) / 180;
            const y = Math.sin(dLng) * Math.cos(lat2Rad);
            const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
            const bearing = (Math.atan2(y, x) * 180) / Math.PI;
            return (bearing + 360) % 360;
        }

        // Update map with locations
        function updateMapData(locations, currentLocation, isTracking) {
            try {
                // Clear existing track
                trackLayerGroup.clearLayers();

                if (!locations || locations.length === 0) return;

                // Create track polylines with speed colors
                if (locations.length > 1) {
                    for (let i = 1; i < locations.length; i++) {
                        const prev = locations[i - 1];
                        const curr = locations[i];
                        const speed = curr.speed || 0;
                        const color = getSpeedColor(speed);

                        const segment = L.polyline([
                            [prev.latitude, prev.longitude],
                            [curr.latitude, curr.longitude]
                        ], {
                            color: color,
                            weight: 4,
                            opacity: 0.8
                        });

                        // Add click popup for segment details
                        const distance = map.distance([prev.latitude, prev.longitude], [curr.latitude, curr.longitude]);
                        const timeDiff = (curr.timestamp - prev.timestamp) / 1000;
                        const avgSpeed = (distance / timeDiff) * 3.6;

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
                    const allCoords = locations.map(loc => [loc.latitude, loc.longitude]);
                    const bounds = L.latLngBounds(allCoords);
                    map.fitBounds(bounds, { padding: [20, 20] });
                } else if (locations.length === 1) {
                    // Center on single location
                    map.setView([locations[0].latitude, locations[0].longitude], 15);
                }

                // Add start marker (green)
                if (locations.length > 0) {
                    const startIcon = L.divIcon({
                        html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">S</div>',
                        className: 'custom-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    const startLoc = locations[0];
                    const startMarker = L.marker([startLoc.latitude, startLoc.longitude], { icon: startIcon })
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

                // Add end marker (red arrow) if not tracking and multiple points
                if (!isTracking && locations.length > 1) {
                    const lastLocation = locations[locations.length - 1];
                    const secondLastLocation = locations[locations.length - 2];
                    const bearing = calculateBearing(
                        secondLastLocation.latitude, secondLastLocation.longitude,
                        lastLocation.latitude, lastLocation.longitude
                    );

                    const endIcon = L.divIcon({
                        html: \`<div style="transform: rotate(\${bearing}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                                 <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                                   <path d="M15 2 L25 22 L15 18 L5 22 Z" fill="#ef4444" stroke="white" strokeWidth="2"/>
                                 </svg>
                               </div>\`,
                        className: 'custom-arrow-marker',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    });

                    const endMarker = L.marker([lastLocation.latitude, lastLocation.longitude], { icon: endIcon })
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
            } catch (error) {
                console.error('Map update error:', error);
            }
        }

        // Make functions globally available
        window.updateMapData = updateMapData;
        window.exitFullscreen = exitFullscreen;

        // Signal that map is ready
        setTimeout(() => {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'mapReady'
                }));
            }
        }, 1000);
    </script>
</body>
</html>
    `;
  };

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "exitFullscreen" && onExitFullscreen) {
        onExitFullscreen();
      } else if (data.type === "mapReady") {
        setIsMapLoaded(true);
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };

  // Update map data dynamically without reloading
  useEffect(() => {
    if (isMapLoaded && webViewRef.current) {
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
      `;

      webViewRef.current.injectJavaScript(updateScript);
    }
  }, [locations, currentLocation, isTracking, isMapLoaded]);

  // Only reload for theme changes
  useEffect(() => {
    if (webViewRef.current) {
      setIsMapLoaded(false);
      webViewRef.current.reload();
    }
  }, [isDarkTheme, isFullscreen, showLayerSelector]);

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
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => {
          // Fallback in case message doesn't work
          setTimeout(() => setIsMapLoaded(true), 2000);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export default MapComponent;
