/**
 * @file: src/components/RootErrorBoundary.tsx
 * @description:
 *   Корневой ErrorBoundary для React-дерева. При крэше компонента
 *   логирует ошибку через driverLogger и показывает fallback-экран
 *   с кнопкой перезапуска (сброс state).
 * @dependencies:
 *   - react, react-native
 *   - @/services/logger.service
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { driverLogger } from '@/services/logger.service';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class RootErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Неизвестная ошибка',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    driverLogger.error(`React crash: ${error.message}`, {
      stack: error.stack ?? String(info.componentStack ?? ''),
      screen: 'RootErrorBoundary',
      action: 'react_crash',
      extra: { componentStack: info.componentStack },
    });
    // Форсируем flush, чтобы логи ушли до возможного выхода приложения
    void driverLogger.flush();
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Произошла ошибка</Text>
          <Text style={styles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Попробовать снова</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#7f1d1d',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
