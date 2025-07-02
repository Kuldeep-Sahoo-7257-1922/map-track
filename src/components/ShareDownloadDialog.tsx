import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Modal, Portal } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";

interface ShareDownloadDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onShare: () => void;
  onDownload: () => void;
  fileType: "kml" | "gpx" | null;
  isDarkTheme: boolean;
  theme: any;
}

const ShareDownloadDialog: React.FC<ShareDownloadDialogProps> = ({
  visible,
  onDismiss,
  onShare,
  onDownload,
  fileType,
  isDarkTheme,
  theme,
}) => {
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={styles.modalHeader}>
            <MaterialIcons
              name="file-download"
              size={32}
              color={theme.colors.primary}
            />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Export {fileType?.toUpperCase()} File
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: isDarkTheme ? "#ccc" : "#64748b" },
              ]}
            >
              Choose how you want to export your track data
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                {
                  backgroundColor: isDarkTheme
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(59, 130, 246, 0.1)",
                  borderColor: "#3b82f6",
                },
              ]}
              onPress={onShare}
            >
              <View style={styles.optionIconContainer}>
                <MaterialIcons name="share" size={24} color="#3b82f6" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text
                  style={[styles.optionTitle, { color: theme.colors.text }]}
                >
                  Share File
                </Text>
                <Text
                  style={[
                    styles.optionDescription,
                    { color: isDarkTheme ? "#ccc" : "#64748b" },
                  ]}
                >
                  Share the {fileType?.toUpperCase()} file with other apps or
                  send to contacts
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={isDarkTheme ? "#888" : "#94a3b8"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionButton,
                {
                  backgroundColor: isDarkTheme
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(16, 185, 129, 0.1)",
                  borderColor: "#10b981",
                },
              ]}
              onPress={onDownload}
            >
              <View style={styles.optionIconContainer}>
                <MaterialIcons name="download" size={24} color="#10b981" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text
                  style={[styles.optionTitle, { color: theme.colors.text }]}
                >
                  Download File
                </Text>
                <Text
                  style={[
                    styles.optionDescription,
                    { color: isDarkTheme ? "#ccc" : "#64748b" },
                  ]}
                >
                  Save the {fileType?.toUpperCase()} file to your device storage
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={isDarkTheme ? "#888" : "#94a3b8"}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={onDismiss}
              style={[
                styles.cancelButton,
                { backgroundColor: isDarkTheme ? "#555" : "#e2e8f0" },
              ]}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: isDarkTheme ? "#fff" : theme.colors.text },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    margin: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 0,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    overflow: "hidden",
  },
  modalHeader: {
    alignItems: "center",
    padding: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  optionsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalFooter: {
    padding: 20,
    paddingTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: "center",
    minWidth: 100,
  },
  cancelButtonText: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default ShareDownloadDialog;
