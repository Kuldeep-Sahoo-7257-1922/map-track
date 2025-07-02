"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SavedTrack, PlaybackState, PlaybackPosition } from "../types";
import { storageUtils } from "../utils/storage";

interface UseTrackPlaybackProps {
  track: SavedTrack | null;
  onPositionChange?: (position: PlaybackPosition) => void;
}

export const useTrackPlayback = ({
  track,
  onPositionChange,
}: UseTrackPlaybackProps) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentIndex: 0,
    speed: 1,
    showControls: true,
    autoFollow: true,
    showTrail: true,
  });

  const [currentPosition, setCurrentPosition] = useState<PlaybackPosition>({
    index: 0,
    location: { latitude: 0, longitude: 0, timestamp: 0 },
    progress: 0,
    timeElapsed: 0,
    distanceTraveled: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate position data based on current index
  const calculatePosition = useCallback(
    (index: number): PlaybackPosition => {
      if (!track || !track.locations || track.locations.length === 0) {
        return {
          index: 0,
          location: { latitude: 0, longitude: 0, timestamp: 0 },
          progress: 0,
          timeElapsed: 0,
          distanceTraveled: 0,
        };
      }

      const clampedIndex = Math.max(
        0,
        Math.min(index, track.locations.length - 1)
      );
      const location = track.locations[clampedIndex];
      const progress =
        track.locations.length > 1
          ? clampedIndex / (track.locations.length - 1)
          : 0;

      // Calculate time elapsed
      const startTime = track.locations[0]?.timestamp || 0;
      const timeElapsed = (location.timestamp - startTime) / 1000;

      // Calculate distance traveled
      let distanceTraveled = 0;
      if (clampedIndex > 0) {
        const partialLocations = track.locations.slice(0, clampedIndex + 1);
        const stats = storageUtils.calculateTrackStats(partialLocations);
        distanceTraveled = stats.distance;
      }

      return {
        index: clampedIndex,
        location,
        progress,
        timeElapsed,
        distanceTraveled,
      };
    },
    [track]
  );

  // Update current position when index changes
  useEffect(() => {
    const position = calculatePosition(playbackState.currentIndex);
    setCurrentPosition(position);
    if (onPositionChange) {
      onPositionChange(position);
    }
  }, [playbackState.currentIndex, calculatePosition, onPositionChange]);

  // Playback interval
  useEffect(() => {
    if (playbackState.isPlaying && track && track.locations.length > 0) {
      const baseInterval = 100; // Base interval in ms
      const interval = baseInterval / playbackState.speed;

      intervalRef.current = setInterval(() => {
        setPlaybackState((prev) => {
          const nextIndex = prev.currentIndex + 1;
          if (nextIndex >= track.locations.length) {
            // End of track reached
            return {
              ...prev,
              isPlaying: false,
              currentIndex: track.locations.length - 1,
            };
          }
          return {
            ...prev,
            currentIndex: nextIndex,
          };
        });
      }, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playbackState.isPlaying, playbackState.speed, track]);

  // Auto-hide controls
  useEffect(() => {
    if (playbackState.showControls) {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }

      hideControlsTimeoutRef.current = setTimeout(() => {
        setPlaybackState((prev) => ({ ...prev, showControls: false }));
      }, 3000);
    }

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [playbackState.showControls]);

  const play = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlayPause = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setPlaybackState((prev) => ({ ...prev, speed }));
  }, []);

  const seekToIndex = useCallback(
    (index: number) => {
      if (!track) return;
      const clampedIndex = Math.max(
        0,
        Math.min(index, track.locations.length - 1)
      );
      setPlaybackState((prev) => ({ ...prev, currentIndex: clampedIndex }));
    },
    [track]
  );

  const seekToProgress = useCallback(
    (progress: number) => {
      if (!track) return;
      const index = Math.floor(progress * (track.locations.length - 1));
      seekToIndex(index);
    },
    [track, seekToIndex]
  );

  const skipBackward = useCallback(() => {
    if (!track) return;
    const skipAmount = Math.floor(track.locations.length * 0.1); // 10% of track
    const newIndex = Math.max(0, playbackState.currentIndex - skipAmount);
    seekToIndex(newIndex);
  }, [track, playbackState.currentIndex, seekToIndex]);

  const skipForward = useCallback(() => {
    if (!track) return;
    const skipAmount = Math.floor(track.locations.length * 0.1); // 10% of track
    const newIndex = Math.min(
      track.locations.length - 1,
      playbackState.currentIndex + skipAmount
    );
    seekToIndex(newIndex);
  }, [track, playbackState.currentIndex, seekToIndex]);

  const reset = useCallback(() => {
    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: false,
      currentIndex: 0,
    }));
  }, []);

  const showControls = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, showControls: true }));
  }, []);

  const setAutoFollow = useCallback((autoFollow: boolean) => {
    setPlaybackState((prev) => ({ ...prev, autoFollow }));
  }, []);

  const setShowTrail = useCallback((showTrail: boolean) => {
    setPlaybackState((prev) => ({ ...prev, showTrail }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  return {
    playbackState,
    currentPosition,
    play,
    pause,
    togglePlayPause,
    setSpeed,
    seekToIndex,
    seekToProgress,
    skipBackward,
    skipForward,
    reset,
    showControls,
    setAutoFollow,
    setShowTrail,
  };
};
