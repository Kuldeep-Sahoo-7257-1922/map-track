import { Dimensions } from "react-native";
import { StyleSheet } from "react-native";


const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // Map View Styles
  mapViewContainer: {
    flex: 1,
    position: "relative",
  },
  fullMapContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  mapTopOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    padding: 8,
  },
  mapHeaderCenter: {
    flex: 1,
    alignItems: "center",
  },
  statisticsButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
  },
  statisticsText: {
    fontSize: 12,
    fontWeight: "600",
  },
  mapHeaderRight: {
    flexDirection: "row",
    gap: 8,
  },
  mapIconButton: {
    padding: 8,
  },
  mapBottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 900,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
  statSubLabel: {
    fontSize: 8,
    marginTop: 1,
    fontWeight: "400",
  },
  gpsStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  additionalStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  additionalStatItem: {
    alignItems: "center",
    flex: 1,
  },
  additionalStatValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  additionalStatLabel: {
    fontSize: 8,
    marginTop: 2,
    fontWeight: "400",
  },
  mapControlButtons: {
    position: "absolute",
    bottom: 100,
    right: 20,
    zIndex: 1100,
  },
  mapControlButtons1: {
    position: "absolute",
    bottom: 100,
    right: 80,
    zIndex: 1100,
  },
  playButton: {
    width: 56,
    height: 56,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // Compact Drawer Styles
  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1500,
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 2000,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  drawerHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  drawerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
  closeButton: {
    padding: 8,
  },
  compactControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  compactThemeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  compactActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  currentTrackStatus: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  trackStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  trackStatusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  trackStatusText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  gpsStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  gpsStatusText: {
    fontSize: 8,
    fontWeight: "600",
  },
  trackStatusStats: {
    fontSize: 10,
    marginLeft: 16,
  },
  drawerSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  drawerSearchInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
  },
  trackListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedTracksInfo: {
    fontSize: 11,
    fontWeight: "500",
  },
  drawerTrackList: {
    flex: 1,
  },
  drawerTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  drawerTrackInfo: {
    flex: 1,
  },
  trackNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  drawerTrackName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  trackStatusIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recordingIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  drawerTrackStats: {
    fontSize: 11,
    marginBottom: 2,
    fontWeight: "500",
  },
  drawerTrackDate: {
    fontSize: 10,
    fontWeight: "400",
  },
  drawerTrackActions: {
    flexDirection: "row",
    gap: 4,
  },
  drawerActionButton: {
    padding: 6,
  },
  drawerEmptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  drawerEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
  },
  drawerEmptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "400",
  },

  // Modal Styles
  modalContainer: {
    margin: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  modalButtonDisabled: {
    opacity: 0.5,
    elevation: 0,
  },
  modalCancelButtonText: {
    textAlign: "center",
    fontWeight: "600",
  },
  modalConfirmButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },

  // Satellite Modal Styles
  satelliteModalContent: {
    borderRadius: 12,
    padding: 0,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    maxHeight: "90%",
  },
  satelliteModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  satelliteModalTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  satelliteModalCloseButton: {
    padding: 8,
  },
  satelliteSummary: {
    padding: 20,
  },
  satelliteSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  satelliteSummaryItem: {
    alignItems: "center",
    flex: 1,
  },
  satelliteSummaryValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  satelliteSummaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  constellationBreakdown: {
    gap: 8,
  },
  constellationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  constellationIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  constellationName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  constellationCount: {
    fontSize: 14,
    fontWeight: "bold",
  },
  satelliteListContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  satelliteListTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  satelliteList: {
    flex: 1,
  },
  satelliteItem: {
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
  },
  satelliteItemSeparator: {
    height: 8,
  },
  satelliteHeader: {
    marginBottom: 12,
  },
  satelliteNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  satelliteName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  satelliteStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  satelliteStatusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  satelliteConstellation: {
    fontSize: 12,
    fontWeight: "500",
  },
  satelliteDetails: {
    gap: 12,
  },
  satelliteDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  satelliteDetailItem: {
    alignItems: "center",
    flex: 1,
  },
  satelliteDetailLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  satelliteDetailValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  signalStrengthContainer: {
    gap: 4,
  },
  signalStrengthLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  signalStrengthBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  signalStrengthFill: {
    height: "100%",
    borderRadius: 3,
  },
  signalStrengthValue: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
  },
  noSatellitesContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  noSatellitesText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
  },
  noSatellitesSubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  satelliteModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  satelliteLastUpdate: {
    fontSize: 12,
    fontWeight: "400",
  },

  // About Dialog Styles
  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 12,
  },
  aboutContent: {
    marginBottom: 24,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  aboutSection: {
    marginBottom: 16,
  },
  aboutSectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  aboutTechText: {
    fontSize: 12,
    lineHeight: 18,
  },

  // Error Styles
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  errorContainer: {
    borderRadius: 12,
    padding: 20,
    margin: 20,
    maxWidth: 300,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  errorButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "center",
    elevation: 2,
  },
  errorButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  playbackContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3000,
  },
});
