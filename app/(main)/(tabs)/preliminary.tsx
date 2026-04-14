/**
 * @file: app/(main)/(tabs)/preliminary.tsx
 * @description:
 *   Экран предварительных заказов — заказы запланированные на определённое время.
 * @created: 2026-03-18 06:00:00
 * @updated: 2026-03-18 06:00:00
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PreliminaryScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="time-outline" size={48} color="#d1d5db" />
      <Text style={styles.title}>Предварительные заказы</Text>
      <Text style={styles.subtitle}>
        Здесь будут отображаться заказы,{'\n'}запланированные на определённое время
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
