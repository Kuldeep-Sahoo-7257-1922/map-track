"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text } from "react-native";
import { WebView } from "react-native-webview";
import type { LocationPoint } from "../types";
import { Linking } from "react-native";

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
    /* Common style */
    .watermark {
      position: absolute;
      font-size: 12px;
      font-weight: 500;
      color: rgba(0, 0, 0, 0.25);
      user-select: none;
      pointer-events: auto;
      z-index: 1000;
      transform-origin: center;
    }

    /* Individual positions + slight rotation */
    .watermark-1  { top: 10px; left: 10px; transform: rotate(-25deg); }
    .watermark-2  { top: 10px; right: 10px; transform: rotate(-25deg); }
    .watermark-3  { bottom: 10px; left: 10px; transform: rotate(-25deg); }
    .watermark-4  { bottom: 10px; right: 10px; transform: rotate(-25deg); }

    .watermark-5  { top: 50%; left: 10px; transform: translateY(-50%) rotate(-25deg); }
    .watermark-6  { top: 50%; right: 10px; transform: translateY(-50%) rotate(-25deg); }

    .watermark-7  { top: 10px; left: 50%; transform: translateX(-50%) rotate(-25deg); }
    .watermark-8  { bottom: 10px; left: 50%; transform: translateX(-50%) rotate(-25deg); }

    .watermark-9  { top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); }
    .watermark-10 { top: 70%; left: 20%; transform: rotate(-25deg); }

    .watermark-11 { top: 25%; left: 5%; transform: rotate(-25deg); }
    .watermark-12 { top: 70%; right: 5%; transform: rotate(-25deg); }
    .watermark-13 { bottom: 25%; left: 5%; transform: rotate(-25deg); }
    .watermark-14 { bottom: 70%; right: 5%; transform: rotate(-25deg); }

    .watermark-15 { top: 25%; left: 50%; transform: translateX(-50%) rotate(-25deg); }
    .watermark-16 { bottom: 25%; left: 50%; transform: translateX(-50%) rotate(-25deg); }


    .watermark-19 { top: 60%; left: 60%; transform: rotate(-25deg); }
    .watermark-20 { top: 40%; right: 40%; transform: rotate(-25deg); }

    .layer-control {
      position: absolute;
      top: 100px; /* Moved down below header */
      right: 10px;
      z-index: 1000;
      background: ${
        isDarkTheme ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.95)"
      };
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      width: 30px;
      overflow:hidden;
    }
    .layer-control select {
      background: ${isDarkTheme ? "rgba(0, 0, 0, 0.8)" : "white"};
      color: ${isDarkTheme ? "white" : "black"};
      font-size: 14px;
      padding: 6px;
      border-radius: 4px;
      border:none;
    }
    .map-controls {
      position: absolute;
      top: 140px; /* Below layer control */
      right: 10px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .control-button {
      width: 40px;
      height: 40px;
      background: ${
        isDarkTheme ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.95)"
      };
      border: 1px solid ${isDarkTheme ? "#374151" : "#e2e8f0"};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      color: ${isDarkTheme ? "white" : "black"};
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
    }
    .control-button:hover {
      background: ${
        isDarkTheme ? "rgba(40, 40, 40, 0.9)" : "rgba(240, 240, 240, 0.95)"
      };
      transform: scale(1.05);
    }
    .control-button:active {
      transform: scale(0.95);
    }
    .current-location-btn {
      font-size: 16px;
    }
    .exit-fullscreen {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
      background: ${
        isDarkTheme ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.95)"
      };
      color: ${isDarkTheme ? "white" : "black"};
      border: 1px solid ${isDarkTheme ? "#555" : "#ccc"};
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .exit-fullscreen:hover {
      background: ${
        isDarkTheme ? "rgba(40, 40, 40, 0.9)" : "rgba(240, 240, 240, 0.95)"
      };
    }
    .error-message {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${
        isDarkTheme ? "rgba(0, 0, 0, 0.9)" : "rgba(255, 255, 255, 0.95)"
      };
      color: ${isDarkTheme ? "white" : "black"};
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
<div class="watermark-grid">
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-0" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-1" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-2" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-3" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-4" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-5" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-6" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-7" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-8" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" class="watermark watermark-9" target="_blank">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-11">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-12">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-13">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-14">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-15">@kuldeep.dev</a>
  <a href="https://github.com/Kuldeep-Sahoo-7257-1922" target="_blank" class="watermark watermark-16">@kuldeep.dev</a>

</div>




  <div class="layer-control">
    <select id="layerSelect" onchange="changeLayer()">
      <option disabled selected>🛰️</option>
      <option value="satellite">satellite</option>
      <option value="osm">Street Map</option>
      <option value="terrain">Terrain</option>
    </select>
  </div>
  
  <div class="map-controls">
    <button class="control-button" onclick="zoomIn()">+</button>
    <button class="control-button" onclick="zoomOut()">−</button>
    <button class="control-button current-location-btn" onclick="goToCurrentLocation()" id="currentLocationBtn" style="display: none;">📍</button>
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
    let userCurrentLocation = null;

    // Map layers with zoom restrictions
    const mapLayers = {
      osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18, // Restricted from 19 to 18
          minZoom: 2,
          timeout: 10000
        }
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
          attribution: '© Esri, © DigitalGlobe',
          maxZoom: 18, // Restricted from 19 to 18
          minZoom: 2,
          timeout: 10000
        }
      },
      terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: {
          attribution: '© OpenTopoMap contributors',
          maxZoom: 16, // Restricted from 17 to 16
          minZoom: 2,
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

        // Initialize map with zoom restrictions
        map = window.L.map('map', {
          zoomControl: false, // Disable default zoom controls
          attributionControl: true,
          preferCanvas: true, // Better performance for many markers
          maxZoom: 18, // Global max zoom restriction
          minZoom: 2   // Global min zoom restriction
        }).setView([0, 0], 13);

        trackLayerGroup = window.L.layerGroup().addTo(map);

        // Set initial layer to Satellite (default)
        const initialLayer = 'satellite';
        const layerConfig = mapLayers[initialLayer];
        currentTileLayer = window.L.tileLayer(layerConfig.url, layerConfig.options);
        currentTileLayer.addTo(map);

        // Handle tile loading errors
        currentTileLayer.on('tileerror', function(e) {
          console.warn('Tile loading error:', e);
        });

        // Get user's current location and focus on it
        window.getCurrentLocationAndFocus();

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

    // Get current location and focus on it
    window.getCurrentLocationAndFocus = function() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function(position) {
            userCurrentLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            
            // Focus on current location
            if (map && userCurrentLocation) {
              map.setView([userCurrentLocation.lat, userCurrentLocation.lng], 15);
            }
          },
          function(error) {
            console.warn('Could not get current location:', error);
            // Fallback to default view
            if (map) {
              map.setView([0, 0], 2);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      }
    }

    // Go to current location function
    window.goToCurrentLocation = function() {
      if (navigator.geolocation) {
        // Show loading state
        const btn = document.getElementById('currentLocationBtn');
        if (btn) {
          btn.innerHTML = '⌛';
          btn.style.opacity = '0.7';
        }
        
        navigator.geolocation.getCurrentPosition(
          function(position) {
            userCurrentLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            
            if (map && userCurrentLocation) {
              map.setView([userCurrentLocation.lat, userCurrentLocation.lng], 16);
              
              // Add a temporary marker to show current location
              const currentLocationIcon = window.L.divIcon({
                html: '<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); animation: pulse 2s infinite;"></div><style>@keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }</style>',
                className: 'current-location-marker',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              });
              
              const currentMarker = window.L.marker([userCurrentLocation.lat, userCurrentLocation.lng], { 
                icon: currentLocationIcon 
              }).addTo(map);
              
              // Remove the marker after 3 seconds
              setTimeout(() => {
                if (map && currentMarker) {
                  map.removeLayer(currentMarker);
                }
              }, 3000);
            }
            
            // Reset button
            if (btn) {
              btn.innerHTML = '📍';
              btn.style.opacity = '1';
            }
          },
          function(error) {
            console.error('Error getting current location:', error);
            
            // Show error message
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'locationError',
                message: 'Could not get your current location. Please check location permissions.'
              }));
            }
            
            // Reset button
            if (btn) {
              btn.innerHTML = '📍';
              btn.style.opacity = '1';
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          }
        );
      } else {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'locationError',
            message: 'Geolocation is not supported by this browser.'
          }));
        }
      }
    }

    // Zoom functions with restrictions
    window.zoomIn = function() {
      if (map && map.getZoom() < 18) {
        map.zoomIn();
      }
    }

    window.zoomOut = function() {
      if (map && map.getZoom() > 2) {
        map.zoomOut();
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

        // Update map zoom restrictions based on layer
        map.setMaxZoom(layerConfig.options.maxZoom);
        map.setMinZoom(layerConfig.options.minZoom);

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
    window.updateMapData = function(allTracksData, currentLocation, isTracking) {
      try {
        if (!map || !trackLayerGroup) {
          console.warn('Map not ready for update');
          return;
        }

        // Show/hide current location button based on whether there are tracks
        const currentLocationBtn = document.getElementById('currentLocationBtn');
        if (currentLocationBtn) {
          // Always show the current location button
          currentLocationBtn.style.display = 'flex';
        }

        // Clear existing track
        trackLayerGroup.clearLayers();

        if (!allTracksData || allTracksData.length === 0) return;

        // Group locations by track
        const trackGroups = {};
        allTracksData.forEach(loc => {
          if (!trackGroups[loc.trackId]) {
            trackGroups[loc.trackId] = {
              locations: [],
              name: loc.trackName
            };
          }
          trackGroups[loc.trackId].locations.push(loc);
        });

        // Color palette for different tracks
        const trackColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let colorIndex = 0;
        let allCoords = [];

        // Function to calculate distance between two points
        const calculateDistance = function(lat1, lng1, lat2, lng2) {
          const R = 6371e3; // Earth's radius in meters
          const φ1 = lat1 * Math.PI/180;
          const φ2 = lat2 * Math.PI/180;
          const Δφ = (lat2-lat1) * Math.PI/180;
          const Δλ = (lng2-lng1) * Math.PI/180;
          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return R * c;
        };

        // Render each track with different colors
        Object.keys(trackGroups).forEach(trackId => {
          const trackData = trackGroups[trackId];
          const locations = trackData.locations.sort((a, b) => a.timestamp - b.timestamp);
          const trackColor = trackColors[colorIndex % trackColors.length];
          colorIndex++;

          // Add track polylines
          if (locations.length > 1) {
            let cumulativeDistance = 0;
            let lastArrowDistance = 0;
            
            for (let i = 1; i < locations.length; i++) {
              const prev = locations[i - 1];
              const curr = locations[i];
              
              if (!prev || !curr || !prev.latitude || !prev.longitude || !curr.latitude || !curr.longitude) {
                continue;
              }

              const segmentDistance = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
              cumulativeDistance += segmentDistance;

              const segment = window.L.polyline([
                [prev.latitude, prev.longitude],
                [curr.latitude, curr.longitude]
              ], {
                color: trackColor,
                weight: 4,
                opacity: 0.8
              });

              segment.bindPopup(\`
                <div style="min-width: 200px;">
                  <h4 style="margin: 0 0 8px 0; font-weight: bold; color: \${trackColor};">\${trackData.name}</h4>
                  <div style="font-size: 12px; line-height: 1.4;">
                    <div>
                      <strong>Time:</strong> \${new Date(prev.timestamp).toLocaleTimeString()} - \${new Date(curr.timestamp).toLocaleTimeString()}
                    </div>
                    <div><strong>Speed:</strong> \${((curr.speed || 0) * 3.6).toFixed(1)} km/h</div>
                    <div><strong>Distance:</strong> \${(cumulativeDistance / 1000).toFixed(2)} km</div>
                    <div>
                      <strong>Coordinates:</strong> \${curr.latitude.toFixed(6)}, \${curr.longitude.toFixed(6)}
                    </div>
                  </div>
                </div>
              \`);

              trackLayerGroup.addLayer(segment);

              // Add direction arrows every 500 meters (0.5 km)
              if (cumulativeDistance - lastArrowDistance >= 500) {
                const bearing = window.calculateBearing(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
                
                // Calculate position along the segment for arrow placement (closer to current point)
                const ratio = 0.7; // Place arrow 70% along the segment
                const arrowLat = prev.latitude + (curr.latitude - prev.latitude) * ratio;
                const arrowLng = prev.longitude + (curr.longitude - prev.longitude) * ratio;

                const directionArrow = window.L.divIcon({
                  html: \`<div style="transform: rotate(-25degbearing}deg); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
           <svg width="20" height="20" viewBox="0 0 20 20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
             <path d="M10 2 L16 14 L10 11 L4 14 Z" fill="\${trackColor}" stroke="white" strokeWidth="1.5"/>
           </svg>
         </div>\`,
                  className: "direction-arrow-marker",
                  iconSize: [20, 20],
                  iconAnchor: [10, 10],
                });

                const arrowMarker = window.L.marker([arrowLat, arrowLng], { icon: directionArrow })
                  .bindPopup(\`
      <div>
        <h4 style="margin: 0 0 8px 0; font-weight: bold; color: \${trackColor};">📍 \${trackData.name}</h4>
        <div style="font-size: 12px; line-height: 1.4;">
          <div><strong>📏 Distance:</strong> \${(cumulativeDistance / 1000).toFixed(2)} km</div>
          <div><strong>🧭 Direction:</strong> \${bearing.toFixed(0)}°</div>
          <div><strong>⚡ Speed:</strong> \${((curr.speed || 0) * 3.6).toFixed(1)} km/h</div>
          <div><strong>⏰ Time:</strong> \${new Date(curr.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    \`);
  
                trackLayerGroup.addLayer(arrowMarker);
                lastArrowDistance = cumulativeDistance;
              }
            }

            // Add start marker
            const startLoc = locations[0];
            const startIcon = window.L.divIcon({
              html: \`<div style="background-color: \${trackColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">S</div>\`,
              className: "custom-marker",
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            const startMarker = window.L.marker([startLoc.latitude, startLoc.longitude], { icon: startIcon }).bindPopup(\`
              <div>
                <h4 style="margin: 0 0 8px 0; font-weight: bold; color: \${trackColor};">\${trackData.name} - Start</h4>
                <div style="font-size: 12px; line-height: 1.4;">
                  <div><strong>Time:</strong> \${new Date(startLoc.timestamp).toLocaleString()}</div>
                  <div><strong>Coordinates:</strong> \${startLoc.latitude.toFixed(6)}, \${startLoc.longitude.toFixed(6)}</div>
                </div>
              </div>
            \`);
            trackLayerGroup.addLayer(startMarker);

            // Add end marker with arrow
            const lastLocation = locations[locations.length - 1];
            const secondLastLocation = locations[locations.length - 2];

            if (secondLastLocation) {
              const bearing = window.calculateBearing(
                secondLastLocation.latitude,
                secondLastLocation.longitude,
                lastLocation.latitude,
                lastLocation.longitude,
              );

              const endIcon = window.L.divIcon({
                html: \`<div style="transform: rotate(-25degbearing}deg); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                       <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                         <path d="M12 2 L20 18 L12 15 L4 18 Z" fill="\${trackColor}" stroke="white" strokeWidth="1.5"/>
                       </svg>
                     </div>\`,
                className: "custom-arrow-marker",
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              });

              const endMarker = window.L.marker([lastLocation.latitude, lastLocation.longitude], { icon: endIcon }).bindPopup(\`
                <div>
                  <h4 style="margin: 0 0 8px 0; font-weight: bold; color: \${trackColor};">\${trackData.name} - End</h4>
                  <div style="font-size: 12px; line-height: 1.4;">
                    <div><strong>Time:</strong> \${new Date(lastLocation.timestamp).toLocaleString()}</div>
                    <div><strong>Coordinates:</strong> \${lastLocation.latitude.toFixed(6)}, \${lastLocation.longitude.toFixed(6)}</div>
                    <div><strong>Direction:</strong> \${bearing.toFixed(0)}°</div>
                    <div><strong>Total Distance:</strong> \${(cumulativeDistance / 1000).toFixed(2)} km</div>
                  </div>
                </div>
              \`);
              trackLayerGroup.addLayer(endMarker);
            }

            // Collect coordinates for bounds
            allCoords = allCoords.concat(locations.map((loc) => [loc.latitude, loc.longitude]));
          }
        });

        // Fit map to show all tracks
        if (allCoords.length > 0) {
          const bounds = window.L.latLngBounds(allCoords);
          map.fitBounds(bounds, { padding: [20, 20] });
        }

      } catch (error) {
        console.error("Map update error:", error);
        window.showErrorMessage();
      }
    }

    // Initialize map when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", window.initializeMap);
    } else {
      window.initializeMap();
    }
  </script>
  <script>
  document.addEventListener('click', function(event) {
  const target = event.target.closest('a');
  if (target && target.href && target.target === '_blank') {
    event.preventDefault();
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'openLink',
        url: target.href
      }));
    }
  }
});

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
        console.log("Map is ready");
        setIsMapLoaded(true);
      } else if (data.type === "openLink" && data.url) {
        Linking.openURL(data.url);
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  };
  

  // Handle WebView errors
  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error("WebView error:", nativeEvent);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error("WebView HTTP error:", nativeEvent);
  };

  // Update map data with throttling to prevent excessive updates
  const lastUpdateRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (
      isMapLoaded &&
      webViewRef.current &&
      now - lastUpdateRef.current > 1000
    ) {
      // Throttle to max 1 update per second
      lastUpdateRef.current = now;

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

  // Only reload for theme changes or fullscreen changes
  useEffect(() => {
    if (webViewRef.current) {
      console.log("Reloading WebView for theme/fullscreen change");
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
        onError={handleError}
        onHttpError={handleHttpError}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        geolocationEnabled={true}
        onLoadEnd={() => {
          console.log("WebView load ended");
          // Fallback in case message doesn't work
          setTimeout(() => {
            if (!isMapLoaded) {
              setIsMapLoaded(true);
            }
          }, 3000);
        }}
        onLoadStart={() => {
          console.log("WebView load started");
        }}
        renderError={(errorDomain, errorCode, errorDesc) => (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Map failed to load</Text>
            <Text style={styles.errorDetails}>{errorDesc}</Text>
          </View>
        )}
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
});

export default MapComponent;
