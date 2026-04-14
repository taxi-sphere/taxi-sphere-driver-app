import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface DayData {
  label: string;
  amount: number;
}

interface EarningsChartProps {
  data: DayData[];
  title?: string;
}

export function EarningsChart({ data, title }: EarningsChartProps) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.barsContainer}>
        {data.map((day, i) => {
          const heightPercent = (day.amount / maxAmount) * 100;
          return (
            <View key={`${day.label}-${i}`} style={styles.barColumn}>
              <Text style={styles.barAmount}>
                {day.amount > 0 ? `${Math.round(day.amount)}` : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(heightPercent, 2)}%` },
                    day.amount > 0 ? styles.barActive : styles.barEmpty,
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{day.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barAmount: {
    fontSize: 9,
    color: '#6b7280',
    fontWeight: '500',
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  barActive: {
    backgroundColor: '#4f46e5',
  },
  barEmpty: {
    backgroundColor: '#e5e7eb',
  },
  barLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
});
