import React from "react"
import { View, Text, StyleSheet, ScrollView } from "react-native"
import { Button, Card } from "react-native-paper"
import { __DEV__ } from "react-native"

interface Props {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
}

class CrashGuard extends React.Component<Props, State> {
  private retryTimeout: NodeJS.Timeout | null = null

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    console.error("CrashGuard caught error:", error)
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CrashGuard error details:", error, errorInfo)

    // Auto-retry after 3 seconds for the first 3 attempts
    if (this.state.retryCount < 3) {
      this.retryTimeout = setTimeout(() => {
        this.handleRetry()
      }, 3000)
    }

    // Log error for debugging
    console.error("Component crash prevented:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
    })
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
    }
  }

  handleRetry = () => {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }

    console.log("Retrying component render, attempt:", this.state.retryCount + 1)

    this.setState((prevState) => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error!} retry={this.handleRetry} />
      }

      return (
        <View style={styles.container}>
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.title}>⚠️ Component Error</Text>
              <Text style={styles.message}>
                A component encountered an error and was safely recovered.
                {this.state.retryCount < 3 ? " Auto-retrying..." : " Please try again manually."}
              </Text>

              <Button mode="contained" onPress={this.handleRetry} style={styles.button}>
                Retry Now ({this.state.retryCount}/3)
              </Button>

              {__DEV__ && (
                <ScrollView style={styles.errorDetails}>
                  <Text style={styles.errorTitle}>Error Details (Dev Mode):</Text>
                  <Text style={styles.errorText}>{this.state.error?.toString()}</Text>
                  <Text style={styles.errorText}>{this.state.error?.stack}</Text>
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
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
    color: "#f59e0b",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    color: "#374151",
  },
  button: {
    marginBottom: 16,
  },
  errorDetails: {
    maxHeight: 150,
    backgroundColor: "#f3f4f6",
    padding: 8,
    borderRadius: 4,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#dc2626",
  },
  errorText: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#374151",
  },
})

export default CrashGuard
