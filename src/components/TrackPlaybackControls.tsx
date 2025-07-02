"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanGestureHandler,
  State,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { SavedTrack, PlaybackState, PlaybackPosition } from "../types";

interface Props {
  track: SavedTrack;
  playbackState: PlaybackState;
  currentPosition: PlaybackPosition;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (index: number) => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onExit: () => void;
  onToggleSettings: () => void;
  isDarkTheme: boolean;
  visible: boolean;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 4, 8];

const TrackPlaybackControls: React.FC<Props> = ({
  track,
  playbackState,
  currentPosition,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onExit,
  onToggleSettings,
  isDarkTheme,
  visible,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Auto-hide controls
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDistance = (distance: number) => {
    return distance > 1000
      ? `${(distance / 1000).toFixed(1)}km`
      : `${Math.round(distance)}m`;
  };

  const handleSpeedCycle = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackState.speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onSpeedChange(SPEED_OPTIONS[nextIndex]);
  };

  const handleProgressBarGesture = (event: any) => {
    if (event.nativeEvent.state === State.BEGAN) {
      setIsDragging(true);
    } else if (event.nativeEvent.state === State.END) {
      setIsDragging(false);
      const { translationX } = event.nativeEvent;
      const progressBarWidth = 300; // Approximate width
      const progress = Math.max(
        0,
        Math.min(1, translationX / progressBarWidth)
      );
      const targetIndex = Math.floor(progress * (track.locations.length - 1));
      onSeek(targetIndex);
    }
  };

  const theme = {
    background: isDarkTheme
      ? "rgba(0, 0, 0, 0.9)"
      : "rgba(255, 255, 255, 0.95)",
    text: isDarkTheme ? "#ffffff" : "#1e293b",
    accent: "#3b82f6",
    border: isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Top Info Bar */}
      <View style={styles.infoBar}>
        <View style={styles.currentDataContainer}>
          <View style={styles.dataItem}>
            <MaterialIcons name="speed" size={16} color={theme.accent} />
            <Text style={[styles.dataValue, { color: theme.text }]}>
              {currentPosition.location.speed
                ? `${(currentPosition.location.speed * 3.6).toFixed(0)} km/h`
                : "0 km/h"}
            </Text>
          </View>
          <View style={styles.dataItem}>
            <MaterialIcons name="schedule" size={16} color={theme.accent} />
            <Text style={[styles.dataValue, { color: theme.text }]}>
              {formatTime(currentPosition.timeElapsed)}
            </Text>
          </View>
          <View style={styles.dataItem}>
            <MaterialIcons name="place" size={16} color={theme.accent} />
            <Text style={[styles.dataValue, { color: theme.text }]}>
              {formatDistance(currentPosition.distanceTraveled)}
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={[styles.timeText, { color: theme.text }]}>
          {formatTime(currentPosition.timeElapsed)}
        </Text>

        <PanGestureHandler onGestureEvent={handleProgressBarGesture}>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarBackground,
                { backgroundColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: theme.accent,
                    width: `${currentPosition.progress * 100}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.progressThumb,
                  {
                    backgroundColor: theme.accent,
                    left: `${currentPosition.progress * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        </PanGestureHandler>

        <Text style={[styles.timeText, { color: theme.text }]}>
          {formatTime(track.duration)}
        </Text>
      </View>

      {/* Distance Progress */}
      <View style={styles.distanceContainer}>
        <Text style={[styles.distanceText, { color: theme.text }]}>
          {formatDistance(currentPosition.distanceTraveled)}
        </Text>
        <Text style={[styles.distanceText, { color: theme.text }]}>
          {formatDistance(track.totalDistance)}
        </Text>
      </View>

      {/* Main Controls */}
      <View style={styles.controlsContainer}>
        {/* Left Controls */}
        <View style={styles.leftControls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.skipButton]}
            onPress={onSkipBackward}
          >
            <MaterialIcons name="replay-10" size={24} color={theme.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.playButton,
              { backgroundColor: theme.accent },
            ]}
            onPress={onPlayPause}
          >
            <MaterialIcons
              name={playbackState.isPlaying ? "pause" : "play-arrow"}
              size={32}
              color="#ffffff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.skipButton]}
            onPress={onSkipForward}
          >
            <MaterialIcons name="forward-10" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Center - Speed Control */}
        <TouchableOpacity
          style={[styles.speedButton, { borderColor: theme.border }]}
          onPress={handleSpeedCycle}
        >
          <Text style={[styles.speedText, { color: theme.accent }]}>
            {playbackState.speed}x
          </Text>
        </TouchableOpacity>

        {/* Right Controls */}
        <View style={styles.rightControls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.iconButton]}
            onPress={onToggleSettings}
          >
            <MaterialIcons name="settings" size={24} color={theme.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.iconButton]}
            onPress={onExit}
          >
            <MaterialIcons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  infoBar: {
    marginBottom: 12,
  },
  currentDataContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dataValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "500",
    minWidth: 45,
    textAlign: "center",
  },
  progressBarContainer: {
    flex: 1,
    height: 40,
    justifyContent: "center",
  },
  progressBarBackground: {
    height: 4,
    borderRadius: 2,
    position: "relative",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  distanceContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 57, // Align with progress bar
  },
  distanceText: {
    fontSize: 10,
    fontWeight: "500",
  },
  controlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  skipButton: {
    backgroundColor: "transparent",
  },
  iconButton: {
    backgroundColor: "transparent",
  },
  speedButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  speedText: {
    fontSize: 14,
    fontWeight: "bold",
  },
});

export default TrackPlaybackControls;
