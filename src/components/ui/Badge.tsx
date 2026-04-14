import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const bgColors: Record<BadgeVariant, string> = {
  default: '#4f46e5',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  muted: '#9ca3af',
};

const textColors: Record<BadgeVariant, string> = {
  default: '#ffffff',
  success: '#ffffff',
  warning: '#ffffff',
  danger: '#ffffff',
  info: '#ffffff',
  muted: '#ffffff',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const bg = bgColors[variant];
  const color = textColors[variant];

  return (
    <View style={[styles.base, size === 'sm' ? styles.sm : styles.md, { backgroundColor: bg }]}>
      <Text style={[styles.text, size === 'sm' ? styles.textSm : styles.textMd, { color }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  md: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontWeight: '600',
  },
  textSm: {
    fontSize: 10,
  },
  textMd: {
    fontSize: 12,
  },
});
