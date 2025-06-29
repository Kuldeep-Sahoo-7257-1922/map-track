import type React from "react"
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native"
import { Card, Button, Chip } from "react-native-paper"
import { MaterialIcons } from "@expo/vector-icons"
import type { SavedTrack } from "../types"

interface Props {
  tracks: SavedTrack[]
  onDownloadKML: (track: SavedTrack) => void
  onDownloadGPX: (track: SavedTrack) => void
  onResume: (track: SavedTrack) => void
  onDelete: (trackId: string) => void
  onView: (track: SavedTrack) => void
  isDarkTheme: boolean
}

const TrackList: React.FC<Props> = ({
  tracks,
  onDownloadKML,
  onDownloadGPX,
  onResume,
  onDelete,
  onView,
  isDarkTheme,
}) => {
  const formatDistance = (distance: number) => {
    return distance > 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`
  }

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor((duration % 3600) / 60)
    const seconds = Math.floor(duration % 60)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }

  const handleDelete = (trackId: string) => {
    Alert.alert("Delete Track", "Are you sure you want to delete this track?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(trackId) },
    ])
  }

  const renderTrackItem = (item: SavedTrack) => (
    <Card key={item.id} style={[styles.trackCard, isDarkTheme && styles.darkCard]}>
      <Card.Content>
        <View style={styles.trackHeader}>
          <Text style={[styles.trackName, isDarkTheme && styles.darkText]}>{item.name}</Text>
          <Chip
            mode="outlined"
            style={[styles.statusChip, item.isComplete ? styles.completeChip : styles.incompleteChip]}
          >
            {item.isComplete ? "Complete" : "In Progress"}
          </Chip>
        </View>

        <View style={styles.trackStats}>
          <View style={styles.statItem}>
            <MaterialIcons name="event" size={16} color={isDarkTheme ? "#fff" : "#666"} />
            <Text style={[styles.statText, isDarkTheme && styles.darkText]}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="place" size={16} color={isDarkTheme ? "#fff" : "#666"} />
            <Text style={[styles.statText, isDarkTheme && styles.darkText]}>{item.locations.length} points</Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="straighten" size={16} color={isDarkTheme ? "#fff" : "#666"} />
            <Text style={[styles.statText, isDarkTheme && styles.darkText]}>{formatDistance(item.totalDistance)}</Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="schedule" size={16} color={isDarkTheme ? "#fff" : "#666"} />
            <Text style={[styles.statText, isDarkTheme && styles.darkText]}>{formatDuration(item.duration)}</Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <Button
            mode="outlined"
            onPress={() => onView(item)}
            style={styles.actionButton}
            labelStyle={styles.buttonLabel}
          >
            View
          </Button>
          <Button
            mode="contained"
            onPress={() => onResume(item)}
            style={styles.actionButton}
            labelStyle={styles.buttonLabel}
          >
            {item.isComplete ? "Resume & Extend" : "Resume"}
          </Button>
          <Button
            mode="outlined"
            onPress={() => onDownloadKML(item)}
            style={styles.actionButton}
            labelStyle={styles.buttonLabel}
          >
            KML
          </Button>
          <Button
            mode="outlined"
            onPress={() => onDownloadGPX(item)}
            style={styles.actionButton}
            labelStyle={styles.buttonLabel}
          >
            GPX
          </Button>
          <Button
            mode="outlined"
            onPress={() => handleDelete(item.id)}
            style={[styles.actionButton, styles.deleteButton]}
            labelStyle={[styles.buttonLabel, styles.deleteButtonLabel]}
          >
            Delete
          </Button>
        </View>
      </Card.Content>
    </Card>
  )

  if (tracks.length === 0) {
    return (
      <Card style={[styles.emptyCard, isDarkTheme && styles.darkCard]}>
        <Card.Content style={styles.emptyContent}>
          <MaterialIcons name="place" size={48} color={isDarkTheme ? "#666" : "#ccc"} />
          <Text style={[styles.emptyText, isDarkTheme && styles.darkText]}>No saved tracks yet</Text>
          <Text style={[styles.emptySubtext, isDarkTheme && styles.darkText]}>
            Start tracking to create your first track!
          </Text>
        </Card.Content>
      </Card>
    )
  }

  return (
    <Card style={[styles.container, isDarkTheme && styles.darkCard]}>
      <Card.Content>
        <Text style={[styles.title, isDarkTheme && styles.darkText]}>Saved Tracks ({tracks.length})</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContainer}>
          {tracks.map(renderTrackItem)}
        </ScrollView>
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#000",
  },
  trackCard: {
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  darkCard: {
    backgroundColor: "#374151",
  },
  trackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  trackName: {
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
    color: "#000",
  },
  darkText: {
    color: "#fff",
  },
  statusChip: {
    marginLeft: 8,
  },
  completeChip: {
    backgroundColor: "#10b981",
  },
  incompleteChip: {
    backgroundColor: "#f59e0b",
  },
  trackStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginBottom: 4,
  },
  statText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#666",
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    marginRight: 8,
    marginBottom: 8,
  },
  buttonLabel: {
    fontSize: 12,
  },
  deleteButton: {
    borderColor: "#ef4444",
  },
  deleteButtonLabel: {
    color: "#ef4444",
  },
  emptyCard: {
    backgroundColor: "#fff",
    marginBottom: 16,
    elevation: 2,
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
    color: "#000",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  scrollContainer: {
    maxHeight: 400,
  },
})

export default TrackList
