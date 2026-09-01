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
import { Appearance, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { driverLogger } from '@/services/logger.service';
import { THEMES } from '@/lib/design/palette';
import { useSettingsStore } from '@/stores/settings.store';

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

/**
 * Стили экрана краха.
 *
 * Тема берётся СИНХРОННО, а не хуком: это класс-компонент (иначе
 * `componentDidCatch` недоступен), и он рисуется в момент, когда дерево
 * приложения уже упало — полагаться на провайдеры нельзя. `Appearance` и
 * zustand-стор читаются напрямую, оба доступны без React-контекста.
 *
 * Если и это почему-то не сработает — берётся светлая тема: экран краха
 * обязан отрисоваться при любых условиях.
 */
function crashTheme() {
  try {
    const mode = useSettingsStore.getState().themeMode ?? 'system';
    const isDark =
      mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');
    return isDark ? THEMES.dark : THEMES.light;
  } catch {
    return THEMES.light;
  }
}

const t = crashTheme();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: t.colors.danger,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: t.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: t.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: t.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
});
