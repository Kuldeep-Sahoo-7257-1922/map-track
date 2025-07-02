"use client";

import type React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { SavedTrack } from "../src/types";

interface Props {
  track: SavedTrack;
  onPlayback: (track: SavedTrack) => void;
  isDarkTheme?: boolean;
  disabled?: boolean;
}

const TrackPlaybackButton: React.FC<Props> = ({
  track,
  onPlayback,
  isDarkTheme = false,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.playbackButton,
        {
          backgroundColor: disabled
            ? isDarkTheme
              ? "#333"
              : "#f0f0f0"
            : isDarkTheme
            ? "#8b5cf6"
            : "#7c3aed",
        },
      ]}
      onPress={() => onPlayback(track)}
      disabled={disabled}
    >
      <MaterialIcons
        name="play-circle-outline"
        size={20}
        color={disabled ? "#888" : "#fff"}
      />
      <Text
        style={[
          styles.playbackButtonText,
          { color: disabled ? "#888" : "#fff" },
        ]}
      >
        Playback
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  playbackButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  playbackButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default TrackPlaybackButton;
