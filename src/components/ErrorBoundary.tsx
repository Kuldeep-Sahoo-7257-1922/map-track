import React from "react"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import { Button, Card } from "react-native-paper"
import { __DEV__ } from "react-native"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    console.error("ErrorBoundary caught error:", error)
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo)

    // Log comprehensive error information
    console.error("App-level error details:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    })

    this.setState({
      error,
      errorInfo,
    })

    // In production, you might want to send this to a crash reporting service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } })
  }

  handleReset = () => {
    console.log("Resetting app from error boundary")
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.title}>🚨 App Error</Text>
              <Text style={styles.message}>
                The app encountered an unexpected error but has been safely recovered. Your location tracking data is
                preserved.
              </Text>

              <Button mode="contained" onPress={this.handleReset} style={styles.button}>
                Restart App
              </Button>

              {__DEV__ && this.state.error && (
                <ScrollView style={styles.errorDetails}>
                  <Text style={styles.errorTitle}>Error Details (Dev Mode):</Text>
                  <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                  {this.state.errorInfo && (
                    <>
                      <Text style={styles.errorTitle}>Component Stack:</Text>
                      <Text style={styles.errorText}>{this.state.errorInfo.componentStack}</Text>
                    </>
                  )}
                  {this.state.error.stack && (
                    <>
                      <Text style={styles.errorTitle}>Error Stack:</Text>
                      <Text style={styles.errorText}>{this.state.error.stack}</Text>
                    </>
                  )}
                </ScrollView>
              )}
            </Card.Content>
          </Card>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  card: {
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#dc2626",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    color: "#374151",
    lineHeight: 24,
  },
  button: {
    marginBottom: 16,
  },
  errorDetails: {
    maxHeight: 200,
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 8,
    color: "#dc2626",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#374151",
    lineHeight: 16,
  },
})

export default ErrorBoundary
