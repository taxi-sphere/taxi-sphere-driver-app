import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const bgColors: Record<ButtonVariant, string> = {
  primary: '#4f46e5',
  secondary: '#6b7280',
  success: '#16a34a',
  danger: '#ef4444',
  outline: 'transparent',
  ghost: 'transparent',
};

const pressedColors: Record<ButtonVariant, string> = {
  primary: '#4338ca',
  secondary: '#4b5563',
  success: '#15803d',
  danger: '#dc2626',
  outline: '#f3f4f6',
  ghost: '#f3f4f6',
};

const textColorMap: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: '#ffffff',
  success: '#ffffff',
  danger: '#ffffff',
  outline: '#4f46e5',
  ghost: '#374151',
};

const sizes: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; borderRadius: number }> = {
  sm: { height: 32, paddingHorizontal: 12, fontSize: 12, borderRadius: 8 },
  md: { height: 40, paddingHorizontal: 16, fontSize: 14, borderRadius: 10 },
  lg: { height: 48, paddingHorizontal: 20, fontSize: 16, borderRadius: 12 },
  xl: { height: 56, paddingHorizontal: 24, fontSize: 18, borderRadius: 14 },
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const s = sizes[size];
  const bg = disabled ? '#d1d5db' : bgColors[variant];
  const color = disabled ? '#9ca3af' : textColorMap[variant];
  const borderWidth = variant === 'outline' ? 1.5 : 0;
  const borderColor = variant === 'outline' ? '#4f46e5' : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        {
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          borderRadius: s.borderRadius,
          backgroundColor: bg,
          borderWidth,
          borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={color} />}
      <Text style={{ fontSize: s.fontSize, fontWeight: '600', color }}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}
