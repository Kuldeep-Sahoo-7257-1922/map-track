"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TrackNameDialogProps {
  isOpen: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
  isDarkTheme: boolean
  defaultName?: string
  title?: string
}

export function TrackNameDialog({
  isOpen,
  onConfirm,
  onCancel,
  isDarkTheme,
  defaultName = "",
  title = "Name Your Track",
}: TrackNameDialogProps) {
  const [trackName, setTrackName] = useState(defaultName || `Track ${new Date().toLocaleDateString()}`)

  if (!isOpen) return null

  const handleConfirm = () => {
    if (trackName.trim()) {
      onConfirm(trackName.trim())
      setTrackName(`Track ${new Date().toLocaleDateString()}`)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm()
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className={`w-full max-w-sm sm:max-w-md ${isDarkTheme ? "bg-gray-800 border-gray-700" : ""}`}>
        <CardHeader>
          <CardTitle className="text-center">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter track name..."
            className={isDarkTheme ? "bg-gray-700 border-gray-600" : ""}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!trackName.trim()}>
              Start Tracking
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
