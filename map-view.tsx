"use client"

import { useEffect, useRef } from "react"

interface LocationPoint {
  latitude: number
  longitude: number
  timestamp: number
  accuracy?: number
  speed?: number
  heading?: number
  altitude?: number
}

interface MapViewProps {
  locations: LocationPoint[]
  currentLocation: LocationPoint | null
  isTracking: boolean
  isDarkTheme?: boolean
  isFullscreen?: boolean
}

export default function MapView({
  locations,
  currentLocation,
  isTracking,
  isDarkTheme = false,
  isFullscreen = false,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const trackLayerRef = useRef<any>(null)
  const currentMarkerRef = useRef<any>(null)
  const startMarkerRef = useRef<any>(null)
  const endMarkerRef = useRef<any>(null)

  // Calculate bearing between two points
  const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const lat1Rad = (lat1 * Math.PI) / 180
    const lat2Rad = (lat2 * Math.PI) / 180

    const y = Math.sin(dLng) * Math.cos(lat2Rad)
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

    const bearing = (Math.atan2(y, x) * 180) / Math.PI
    return (bearing + 360) % 360
  }

  // Calculate distance between two points
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  // Get speed color based on speed value
  const getSpeedColor = (speed: number) => {
    if (speed < 1) return "#10b981" // Green for slow
    if (speed < 5) return "#f59e0b" // Yellow for medium
    if (speed < 10) return "#f97316" // Orange for fast
    return "#ef4444" // Red for very fast
  }

  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return

    // Dynamically import Leaflet
    import("leaflet").then((L) => {
      // Fix for default markers in Leaflet with Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      })

      if (!mapInstanceRef.current && mapRef.current) {
        // Initialize map
        mapInstanceRef.current = L.map(mapRef.current).setView([0, 0], 13)

        // Add multiple tile layers
        const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })

        const satelliteLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              '© <a href="https://www.esri.com/">Esri</a>, © <a href="https://www.digitalglobe.com/">DigitalGlobe</a>',
            maxZoom: 19,
          },
        )

        const hybridLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              '© <a href="https://www.esri.com/">Esri</a>, © <a href="https://www.digitalglobe.com/">DigitalGlobe</a>',
            maxZoom: 19,
          },
        )

        // Add labels overlay for hybrid view
        const labelsLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "",
            maxZoom: 19,
          },
        )

        // Add dark theme layer
        const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
        })

        // Add default layer based on theme
        // const defaultLayer = isDarkTheme ? darkLayer : streetLayer
        // defaultLayer.addTo(mapInstanceRef.current)
        satelliteLayer.addTo(mapInstanceRef.current)

        // Create layer control
        // const baseLayers = {
        //   "🗺️ Street Map": streetLayer,
        //   "🛰️ Satellite": satelliteLayer,
        //   "🌍 Hybrid": L.layerGroup([hybridLayer, labelsLayer]),
        //   "🌙 Dark Theme": darkLayer,
        // }
        const baseLayers = {
          "🗺️ Street Map": streetLayer,
          "🛰️ Satellite": satelliteLayer,
          "🌍 Hybrid": L.layerGroup([hybridLayer, labelsLayer]),
        }

        // Add layer control to map
        L.control
          .layers(
            baseLayers,
            {},
            {
              position: "topright",
              collapsed: !isFullscreen,
            },
          )
          .addTo(mapInstanceRef.current)

        // Initialize track layer
        trackLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)
      }
    })

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [isDarkTheme, isFullscreen])

  useEffect(() => {
    if (!mapInstanceRef.current || locations.length === 0) return

    import("leaflet").then((L) => {
      // Clear existing layers
      if (trackLayerRef.current) {
        trackLayerRef.current.clearLayers()
      }

      // Create track polyline with speed-based colors
      if (locations.length > 1) {
        // Create segments with different colors based on speed
        for (let i = 1; i < locations.length; i++) {
          const prev = locations[i - 1]
          const curr = locations[i]

          const segmentCoords = [
            [prev.latitude, prev.longitude],
            [curr.latitude, curr.longitude],
          ] as [[number, number], [number, number]]
          const speed = curr.speed || 0
          const color = getSpeedColor(speed)

          const segment = L.polyline(segmentCoords, {
            color: color,
            weight: 4,
            opacity: 0.8,
          })

          // Add click event to show segment details
          segment.on("click", (e) => {
            const distance = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
            const timeDiff = (curr.timestamp - prev.timestamp) / 1000
            const avgSpeed = (distance / timeDiff) * 3.6 // km/h

            const popupContent = `
            <div style="min-width: 200px;">
              <h4 style="margin: 0 0 8px 0; font-weight: bold;">📊 Segment Details</h4>
              <div style="font-size: 12px; line-height: 1.4;">
                <div><strong>Time:</strong> ${new Date(prev.timestamp).toLocaleTimeString()} - ${new Date(curr.timestamp).toLocaleTimeString()}</div>
                <div><strong>Distance:</strong> ${distance.toFixed(1)}m</div>
                <div><strong>Duration:</strong> ${timeDiff.toFixed(1)}s</div>
                <div><strong>Speed:</strong> ${(speed * 3.6).toFixed(1)} km/h</div>
                <div><strong>Avg Speed:</strong> ${avgSpeed.toFixed(1)} km/h</div>
                ${curr.altitude && prev.altitude ? `<div><strong>Elevation Change:</strong> ${(curr.altitude - prev.altitude).toFixed(1)}m</div>` : ""}
                <div><strong>Coordinates:</strong></div>
                <div>Start: ${prev.latitude.toFixed(6)}, ${prev.longitude.toFixed(6)}</div>
                <div>End: ${curr.latitude.toFixed(6)}, ${curr.longitude.toFixed(6)}</div>
              </div>
            </div>
          `

            L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(mapInstanceRef.current)
          })

          trackLayerRef.current.addLayer(segment)
        }

        // Fit map to track bounds when viewing saved tracks or when track has multiple points
        const allCoords = locations.map((loc) => [loc.latitude, loc.longitude] as [number, number])
        const bounds = L.latLngBounds(allCoords)
        mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] })
      } else if (locations.length === 1) {
        // Only center once when first location is added
        const firstLocation = locations[0]
        mapInstanceRef.current.setView([firstLocation.latitude, firstLocation.longitude], 15)
      }

      // Add start marker (green)
      if (locations.length > 0) {
        const startIcon = L.divIcon({
          html: `<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">S</div>`,
          className: "custom-marker",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })

        const startLoc = locations[0]
        startMarkerRef.current = L.marker([startLoc.latitude, startLoc.longitude], {
          icon: startIcon,
        })
          .bindPopup(`
          <div>
            <h4 style="margin: 0 0 8px 0; font-weight: bold;">🏁 Start Point</h4>
            <div style="font-size: 12px; line-height: 1.4;">
              <div><strong>Time:</strong> ${new Date(startLoc.timestamp).toLocaleString()}</div>
              <div><strong>Coordinates:</strong> ${startLoc.latitude.toFixed(6)}, ${startLoc.longitude.toFixed(6)}</div>
              <div><strong>Accuracy:</strong> ${startLoc.accuracy ? Math.round(startLoc.accuracy) + "m" : "Unknown"}</div>
              ${startLoc.altitude ? `<div><strong>Altitude:</strong> ${Math.round(startLoc.altitude)}m</div>` : ""}
            </div>
          </div>
        `)
          .addTo(trackLayerRef.current)
      }

      // Add end marker (red arrow) if tracking stopped and we have multiple points
      if (!isTracking && locations.length > 1) {
        const lastLocation = locations[locations.length - 1]
        const secondLastLocation = locations[locations.length - 2]

        // Calculate bearing for arrow direction
        const bearing = calculateBearing(
          secondLastLocation.latitude,
          secondLastLocation.longitude,
          lastLocation.latitude,
          lastLocation.longitude,
        )

        const endIcon = L.divIcon({
          html: `<div style="transform: rotate(${bearing}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                 <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                   <path d="M15 2 L25 22 L15 18 L5 22 Z" fill="#ef4444" stroke="white" strokeWidth="2"/>
                 </svg>
               </div>`,
          className: "custom-arrow-marker",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        })

        endMarkerRef.current = L.marker([lastLocation.latitude, lastLocation.longitude], {
          icon: endIcon,
        })
          .bindPopup(`
          <div>
            <h4 style="margin: 0 0 8px 0; font-weight: bold;">🏁 End Point</h4>
            <div style="font-size: 12px; line-height: 1.4;">
              <div><strong>Time:</strong> ${new Date(lastLocation.timestamp).toLocaleString()}</div>
              <div><strong>Coordinates:</strong> ${lastLocation.latitude.toFixed(6)}, ${lastLocation.longitude.toFixed(6)}</div>
              <div><strong>Accuracy:</strong> ${lastLocation.accuracy ? Math.round(lastLocation.accuracy) + "m" : "Unknown"}</div>
              ${lastLocation.speed ? `<div><strong>Final Speed:</strong> ${(lastLocation.speed * 3.6).toFixed(1)} km/h</div>` : ""}
              ${lastLocation.altitude ? `<div><strong>Altitude:</strong> ${Math.round(lastLocation.altitude)}m</div>` : ""}
              <div><strong>Direction:</strong> ${bearing.toFixed(0)}°</div>
            </div>
          </div>
        `)
          .addTo(trackLayerRef.current)
      }

      // NO CURRENT LOCATION MARKER - REMOVED TO PREVENT AUTO-FOCUS
      // NO AUTO-CENTERING - USER HAS FULL CONTROL
    })
  }, [locations, currentLocation, isTracking])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
        integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
        crossOrigin=""
      />
      <div ref={mapRef} className="w-full h-full" />
    </>
  )
}
