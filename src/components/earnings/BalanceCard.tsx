import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BalanceCardProps {
  balance: number;
  onWithdraw?: () => void;
}

export function BalanceCard({ balance, onWithdraw }: BalanceCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>Баланс</Text>
          <Text style={styles.amount}>{balance.toFixed(2)} ₽</Text>
        </View>
        {onWithdraw && (
          <TouchableOpacity style={styles.withdrawBtn} onPress={onWithdraw} activeOpacity={0.7}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.withdrawText}>Вывести</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  amount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  withdrawText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
