import type React from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Card } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import type { SavedTrack } from "../types";

interface Props {
  tracks: SavedTrack[];
  onDownloadKML: (track: SavedTrack) => void;
  onDownloadGPX: (track: SavedTrack) => void;
  onResume: (track: SavedTrack) => void;
  onDelete: (trackId: string) => void;
  onView: (track: SavedTrack) => void;
  isDarkTheme: boolean;
  currentTrackId?: string | null;
  isTracking?: boolean;
  isPaused?: boolean;
  onPause?: () => void;
}

const TrackList: React.FC<Props> = ({
  tracks,
  onDownloadKML,
  onDownloadGPX,
  onResume,
  onDelete,
  onView,
  isDarkTheme,
  currentTrackId,
  isTracking = false,
  isPaused = false,
  onPause,
}) => {
  const formatDistance = (distance: number) => {
    return distance > 1000
      ? `${(distance / 1000).toFixed(2)} km`
      : `${Math.round(distance)} m`;
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleDelete = (trackId: string) => {
    Alert.alert("Delete Track", "Are you sure you want to delete this track?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(trackId),
      },
    ]);
  };

  const theme = {
    colors: {
      primary: isDarkTheme ? "#2563eb" : "#6366f1",
      surface: isDarkTheme ? "#2d2d2d" : "#ffffff",
      text: isDarkTheme ? "#ffffff" : "#1e293b",
      accent: isDarkTheme ? "#10b981" : "#059669",
    },
  };

  const renderTrackItem = (item: SavedTrack) => {
    const isCurrentTrack = currentTrackId === item.id;
    const isCurrentlyRecording = isCurrentTrack && isTracking;

    return (
      <View
        key={item.id}
        style={[
          styles.trackCard,
          { backgroundColor: theme.colors.surface },
          isCurrentlyRecording && {
            backgroundColor: isDarkTheme
              ? theme.colors.accent + "20"
              : theme.colors.accent + "10",
            borderLeftWidth: 4,
            borderLeftColor: theme.colors.accent,
          },
        ]}
      >
        <View style={styles.trackHeader}>
          <View style={styles.trackNameContainer}>
            <Text
              style={[styles.trackName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <View style={styles.trackStatusContainer}>
              {item.isComplete ? (
                <View style={[styles.statusChip, styles.completeChip]}>
                  <Text style={styles.statusChipText}>Complete</Text>
                </View>
              ) : (
                <View style={[styles.statusChip, styles.incompleteChip]}>
                  <Text style={styles.statusChipText}>In Progress</Text>
                </View>
              )}
              {isCurrentlyRecording && (
                <View style={styles.recordingIndicators}>
                  <MaterialIcons
                    name={isPaused ? "pause" : "fiber-manual-record"}
                    size={16}
                    color={isPaused ? "#f59e0b" : theme.colors.accent}
                  />
                  {!isPaused && (
                    <View
                      style={[
                        styles.recordingDot,
                        { backgroundColor: theme.colors.accent },
                      ]}
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.trackStats}>
          <View style={styles.statItem}>
            <MaterialIcons
              name="event"
              size={16}
              color={isDarkTheme ? "#fff" : "#666"}
            />
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons
              name="place"
              size={16}
              color={isDarkTheme ? "#fff" : "#666"}
            />
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {item.locations.length} points
            </Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons
              name="straighten"
              size={16}
              color={isDarkTheme ? "#fff" : "#666"}
            />
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {formatDistance(item.totalDistance)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons
              name="schedule"
              size={16}
              color={isDarkTheme ? "#fff" : "#666"}
            />
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {formatDuration(item.duration)}
            </Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onView(item)}
          >
            <MaterialIcons
              name="visibility"
              size={20}
              color={theme.colors.primary}
            />
            <Text style={[styles.buttonLabel, { color: theme.colors.primary }]}>
              View
            </Text>
          </TouchableOpacity>

          {isCurrentlyRecording ? (
            isPaused ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onResume(item)}
              >
                <MaterialIcons
                  name="play-arrow"
                  size={20}
                  color={theme.colors.accent}
                />
                <Text
                  style={[styles.buttonLabel, { color: theme.colors.accent }]}
                >
                  Resume
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionButton} onPress={onPause}>
                <MaterialIcons name="pause" size={20} color="#f59e0b" />
                <Text style={[styles.buttonLabel, { color: "#f59e0b" }]}>
                  Pause
                </Text>
              </TouchableOpacity>
            )
          ) : (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onResume(item)}
            >
              <MaterialIcons
                name="play-arrow"
                size={20}
                color={theme.colors.accent}
              />
              <Text
                style={[styles.buttonLabel, { color: theme.colors.accent }]}
              >
                {item.isComplete ? "Resume & Extend" : "Resume"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDownloadKML(item)}
            disabled={isCurrentlyRecording && !isPaused}
          >
            <MaterialIcons
              name="download"
              size={20}
              color={isCurrentlyRecording && !isPaused ? "#888" : "#f59e0b"}
            />
            <Text
              style={[
                styles.buttonLabel,
                {
                  color: isCurrentlyRecording && !isPaused ? "#888" : "#f59e0b",
                },
              ]}
            >
              KML
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDownloadGPX(item)}
            disabled={isCurrentlyRecording && !isPaused}
          >
            <MaterialIcons
              name="file-download"
              size={20}
              color={isCurrentlyRecording && !isPaused ? "#888" : "#f59e0b"}
            />
            <Text
              style={[
                styles.buttonLabel,
                {
                  color: isCurrentlyRecording && !isPaused ? "#888" : "#f59e0b",
                },
              ]}
            >
              GPX
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item.id)}
            disabled={isCurrentlyRecording}
          >
            <MaterialIcons
              name="delete"
              size={20}
              color={isCurrentlyRecording ? "#888" : "#ef4444"}
            />
            <Text
              style={[
                styles.buttonLabel,
                { color: isCurrentlyRecording ? "#888" : "#ef4444" },
              ]}
            >
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (tracks.length === 0) {
    return (
      <Card
        style={[styles.emptyCard, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.emptyContent}>
          <MaterialIcons
            name="place"
            size={48}
            color={isDarkTheme ? "#666" : "#ccc"}
          />
          <Text style={[styles.emptyText, { color: theme.colors.text }]}>
            No saved tracks yet
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
      </Card>
    );
  }

  return (
    <Card style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Saved Tracks ({tracks.length})
        </Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollContainer}
        >
          {tracks.map(renderTrackItem)}
        </ScrollView>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    elevation: 2,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  trackCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  trackHeader: {
    marginBottom: 12,
  },
  trackNameContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackName: {
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
    marginRight: 8,
  },
  trackStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completeChip: {
    backgroundColor: "#10b981",
  },
  incompleteChip: {
    backgroundColor: "#f59e0b",
  },
  statusChipText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  recordingIndicators: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  trackStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    gap: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  buttonLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyCard: {
    marginBottom: 16,
    elevation: 2,
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  scrollContainer: {
    maxHeight: 400,
  },
});

export default TrackList;
