import type { LocationPoint } from "../types"

export const parseKMLFile = (kmlContent: string): LocationPoint[] => {
  try {
    // Simple KML parsing - extract coordinates
    const coordinatesMatch = kmlContent.match(/<coordinates>([\s\S]*?)<\/coordinates>/)
    if (!coordinatesMatch) return []

    const coordinates = coordinatesMatch[1].trim()
    const points: LocationPoint[] = []
    const coordLines = coordinates.split(/\s+/).filter((line) => line.trim())

    coordLines.forEach((line, index) => {
      const [lng, lat, alt] = line.split(",").map(Number)
      if (!isNaN(lng) && !isNaN(lat)) {
        points.push({
          latitude: lat,
          longitude: lng,
          timestamp: Date.now() + index * 1000, // Fake timestamps
          altitude: alt || undefined,
        })
      }
    })

    return points
  } catch (error) {
    console.error("Error parsing KML:", error)
    return []
  }
}

export const parseGPXFile = (gpxContent: string): LocationPoint[] => {
  try {
    // Simple GPX parsing - extract track points
    const trkptMatches = gpxContent.match(/<trkpt[^>]*lat="([^"]*)"[^>]*lon="([^"]*)"[^>]*>([\s\S]*?)<\/trkpt>/g)
    if (!trkptMatches) return []

    const points: LocationPoint[] = []

    trkptMatches.forEach((trkpt, index) => {
      const latMatch = trkpt.match(/lat="([^"]*)"/)
      const lonMatch = trkpt.match(/lon="([^"]*)"/)
      const eleMatch = trkpt.match(/<ele>([^<]*)<\/ele>/)
      const timeMatch = trkpt.match(/<time>([^<]*)<\/time>/)

      if (latMatch && lonMatch) {
        const lat = Number.parseFloat(latMatch[1])
        const lng = Number.parseFloat(lonMatch[1])

        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({
            latitude: lat,
            longitude: lng,
            timestamp: timeMatch ? new Date(timeMatch[1]).getTime() : Date.now() + index * 1000,
            altitude: eleMatch ? Number.parseFloat(eleMatch[1]) : undefined,
          })
        }
      }
    })

    return points
  } catch (error) {
    console.error("Error parsing GPX:", error)
    return []
  }
}

export const generateKML = (locations: LocationPoint[], trackName = "GPS Track"): string => {
  if (locations.length === 0) return ""

  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${trackName}</name>
  <description>GPS track recorded on ${new Date().toLocaleDateString()}</description>
  
  <!-- Style for the track line -->
  <Style id="trackStyle">
    <LineStyle>
      <color>ff0000ff</color>
      <width>3</width>
    </LineStyle>
  </Style>

  <!-- Track line -->
  <Placemark>
    <name>${trackName}</name>
    <styleUrl>#trackStyle</styleUrl>
    <LineString>
      <tessellate>1</tessellate>
      <coordinates>`

  const coordinates = locations
    .map((loc) => `${loc.longitude},${loc.latitude},${loc.altitude || 0}`)
    .join("\n          ")

  const kmlMiddle = `
      </coordinates>
    </LineString>
  </Placemark>

  <!-- Waypoints -->`

  const waypoints =
    locations.length > 0
      ? `
  <!-- Start Point -->
  <Placemark>
    <name>Start Point</name>
    <description>
      Started at: ${new Date(locations[0].timestamp).toLocaleString()}
      Accuracy: ${locations[0].accuracy ? Math.round(locations[0].accuracy) + "m" : "Unknown"}
      ${locations[0].altitude ? `Altitude: ${Math.round(locations[0].altitude)}m` : ""}
    </description>
    <Style>
      <IconStyle>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Point>
      <coordinates>${locations[0].longitude},${locations[0].latitude},${locations[0].altitude || 0}</coordinates>
    </Point>
  </Placemark>` +
        (locations.length > 1
          ? `
  <!-- End Point -->
  <Placemark>
    <name>End Point</name>
    <description>
      Ended at: ${new Date(locations[locations.length - 1].timestamp).toLocaleString()}
      Accuracy: ${locations[locations.length - 1].accuracy ? Math.round(locations[locations.length - 1].accuracy) + "m" : "Unknown"}
      ${locations[locations.length - 1].altitude ? `Altitude: ${Math.round(locations[locations.length - 1].altitude)}m` : ""}
    </description>
    <Style>
      <IconStyle>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Point>
      <coordinates>${locations[locations.length - 1].longitude},${locations[locations.length - 1].latitude},${locations[locations.length - 1].altitude || 0}</coordinates>
    </Point>
  </Placemark>`
          : "")
      : ""

  const kmlFooter = `
</Document>
</kml>`

  return kmlHeader + coordinates + kmlMiddle + waypoints + kmlFooter
}

export const generateGPX = (locations: LocationPoint[], trackName = "GPS Track"): string => {
  if (locations.length === 0) return ""

  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Location Tracker" xmlns="http://www.topografix.com/GPX/1/1">
<metadata>
  <name>${trackName}</name>
  <desc>GPS track recorded on ${new Date().toLocaleDateString()}</desc>
  <time>${new Date(locations[0]?.timestamp).toISOString()}</time>
</metadata>
<trk>
  <name>${trackName}</name>
  <trkseg>`

  const trackPoints = locations
    .map(
      (loc) => `
    <trkpt lat="${loc.latitude}" lon="${loc.longitude}">
      ${loc.altitude ? `<ele>${loc.altitude}</ele>` : ""}
      <time>${new Date(loc.timestamp).toISOString()}</time>
      ${loc.speed ? `<extensions><speed>${loc.speed}</speed></extensions>` : ""}
    </trkpt>`,
    )
    .join("")

  const gpxFooter = `
  </trkseg>
</trk>
</gpx>`

  return gpxHeader + trackPoints + gpxFooter
}
