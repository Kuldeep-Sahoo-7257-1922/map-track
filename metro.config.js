const { getDefaultConfig } = require("@expo/metro-config")

const config = getDefaultConfig(__dirname)

// Add support for additional asset types
config.resolver.assetExts.push(
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  // Audio
  "mp3",
  "wav",
  "aac",
  "m4a",
  // Video
  "mp4",
  "mov",
  "avi",
  "mkv",
  // Documents
  "pdf",
  "doc",
  "docx",
  // Fonts
  "ttf",
  "otf",
  "woff",
  "woff2",
)

module.exports = config
