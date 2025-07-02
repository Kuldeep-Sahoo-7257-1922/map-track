"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Play,
  Trash2,
  FileText,
  Calendar,
  MapPin,
  Clock,
  Pause,
  PlayCircle,
} from "lucide-react";

interface SavedTrack {
  id: string;
  name: string;
  locations: any[];
  createdAt: number;
  lastModified: number;
  isComplete: boolean;
  totalDistance: number;
  duration: number;
}

interface TrackListProps {
  tracks: SavedTrack[];
  onDownloadKML: (track: SavedTrack) => void;
  onDownloadGPX: (track: SavedTrack) => void;
  onResume: (track: SavedTrack) => void;
  onDelete: (trackId: string) => void;
  onView: (track: SavedTrack) => void;
  onPlayback: (track: SavedTrack) => void;
  isDarkTheme: boolean;
  currentTrackId?: string | null;
  isTracking?: boolean;
  isPaused?: boolean;
  onPause?: () => void;
}

export function TrackList({
  tracks,
  onDownloadKML,
  onDownloadGPX,
  onResume,
  onDelete,
  onView,
  onPlayback,
  isDarkTheme,
  currentTrackId,
  isTracking = false,
  isPaused = false,
  onPause,
}: TrackListProps) {
  if (tracks.length === 0) {
    return (
      <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No saved tracks yet</p>
          <p className="text-sm">Start tracking to create your first track!</p>
        </CardContent>
      </Card>
    );
  }

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

  return (
    <Card className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Saved Tracks ({tracks.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tracks.map((track) => {
          const isCurrentTrack = currentTrackId === track.id;
          const isCurrentlyRecording = isCurrentTrack && isTracking;

          return (
            <div
              key={track.id}
              className={`p-4 rounded-lg border ${
                isDarkTheme
                  ? "bg-gray-600 border-gray-500"
                  : "bg-gray-50 border-gray-200"
              } ${
                isCurrentlyRecording
                  ? isDarkTheme
                    ? "ring-2 ring-green-500"
                    : "ring-2 ring-green-400"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{track.name}</h4>
                    {isCurrentlyRecording ? (
                      <Badge variant="default" className="bg-green-600">
                        {isPaused ? "Recording Paused" : "Recording"}
                      </Badge>
                    ) : (
                      <Badge
                        variant={track.isComplete ? "default" : "secondary"}
                      >
                        {track.isComplete ? "Complete" : "In Progress"}
                      </Badge>
                    )}
                    {isCurrentlyRecording && !isPaused && (
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(track.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {track.locations.length} points
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatDistance(track.totalDistance)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(track.duration)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-1 sm:gap-2 flex-wrap text-xs sm:text-sm">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onView(track)}
                  className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <MapPin className="h-3 w-3" />
                  View
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPlayback(track)}
                  className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
                  disabled={track.locations.length < 2}
                >
                  <PlayCircle className="h-3 w-3" />
                  Play
                </Button>

                {isCurrentlyRecording ? (
                  isPaused ? (
                    <Button
                      size="sm"
                      onClick={() => onResume(track)}
                      className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 bg-green-600 hover:bg-green-700"
                    >
                      <Play className="h-3 w-3" />
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={onPause}
                      variant="outline"
                      className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500"
                    >
                      <Pause className="h-3 w-3" />
                      Pause
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onResume(track)}
                    className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
                  >
                    <Play className="h-3 w-3" />
                    {track.isComplete ? "Resume & Extend" : "Resume"}
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDownloadKML(track)}
                  className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 bg-transparent"
                  disabled={isCurrentlyRecording && !isPaused}
                >
                  <Download className="h-3 w-3" />
                  KML
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDownloadGPX(track)}
                  className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 bg-transparent"
                  disabled={isCurrentlyRecording && !isPaused}
                >
                  <FileText className="h-3 w-3" />
                  GPX
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(track.id)}
                  className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 ml-auto"
                  disabled={isCurrentlyRecording}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
