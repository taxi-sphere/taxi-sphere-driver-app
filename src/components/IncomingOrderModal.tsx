/**
 * @file: src/components/IncomingOrderModal.tsx
 * @description:
 *   Полноэкранная модалка «Входящий заказ» — подтверждение взятия заказа
 *   или приём офера от автораспределения.
 *
 *   Режимы:
 *   - 'confirm': водитель сам тапнул заказ в списке (таймер 30 сек).
 *   - 'offer':   заказ пришёл от сервера (таймер из пропа `timerSec`).
 *
 *   Особенности:
 *   - Селектор времени подачи (пресеты 3/5/7/10/15 + кнопки ±1).
 *   - Круговой таймер по периметру кнопки «Принять» (react-native-svg).
 *   - Пульсирующее кольцо вокруг кнопки (Animated).
 *   - Авто-закрытие по таймауту.
 *
 * @dependencies:
 *   - react-native-svg
 *   - @/types/order
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import type { AvailableOrder } from '@/types/order';

/** Режим модалки */
export type IncomingOrderMode = 'confirm' | 'offer';

export interface IncomingOrderModalProps {
  visible: boolean;
  order: AvailableOrder | null;
  mode: IncomingOrderMode;
  /** Рекомендуемое начальное время подачи в минутах (от сервера). */
  initialEtaMin?: number;
  /** Загружается ли ETA с сервера — показывает спиннер вместо значения. */
  etaLoading?: boolean;
  /** Длительность таймера в секундах (обычно 30 для confirm, 15 для offer). */
  timerSec: number;
  /** Идёт ли сетевой запрос acceptOrder. */
  accepting?: boolean;
  onAccept: (pickupEtaMin: number) => void;
  onDismiss: () => void;
}

const MIN_ETA = 1;
const MAX_ETA = 1440;
const PRESETS: number[] = [3, 5, 7, 10, 15];

/* -------------------------------------------------------------------------- */
/*  Круговой таймер                                                            */
/* -------------------------------------------------------------------------- */

const RING_SIZE = 140;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function CircularTimer({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const progress = Math.max(0, Math.min(1, remaining / total));
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  return (
    <Svg
      width={RING_SIZE}
      height={RING_SIZE}
      style={StyleSheet.absoluteFillObject}
      // Поворот на -90 градусов — отсчёт начинается сверху
      transform={[{ rotate: '-90deg' }]}
    >
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="#233648"
        strokeWidth={RING_STROKE}
        fill="transparent"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="#137fec"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${RING_CIRCUMFERENCE}`}
        strokeDashoffset={offset}
        fill="transparent"
      />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Селектор времени подачи                                                    */
/* -------------------------------------------------------------------------- */

function EtaSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.max(MIN_ETA, Math.min(MAX_ETA, v));

  return (
    <View style={etaStyles.wrap}>
      <Text style={etaStyles.label}>Время подачи</Text>

      <View style={etaStyles.stepper}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Уменьшить на 1 минуту"
          style={[etaStyles.stepBtn, disabled && etaStyles.stepBtnDisabled]}
          onPress={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= MIN_ETA}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="remove" size={24} color="#ffffff" />
        </TouchableOpacity>

        <View style={etaStyles.valueBox}>
          <Text style={etaStyles.valueText}>{value}</Text>
          <Text style={etaStyles.valueUnit}>мин</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Увеличить на 1 минуту"
          style={[etaStyles.stepBtn, disabled && etaStyles.stepBtnDisabled]}
          onPress={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= MAX_ETA}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={etaStyles.presets}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            accessibilityRole="button"
            accessibilityLabel={`Установить ${p} минут`}
            onPress={() => onChange(p)}
            disabled={disabled}
            style={[etaStyles.preset, value === p && etaStyles.presetActive]}
          >
            <Text
              style={[
                etaStyles.presetText,
                value === p && etaStyles.presetTextActive,
              ]}
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Основной компонент                                                         */
/* -------------------------------------------------------------------------- */

export function IncomingOrderModal({
  visible,
  order,
  mode,
  initialEtaMin,
  etaLoading,
  timerSec,
  accepting,
  onAccept,
  onDismiss,
}: IncomingOrderModalProps) {
  const [etaMin, setEtaMin] = useState<number>(initialEtaMin ?? 5);
  const [remaining, setRemaining] = useState<number>(timerSec);
  const pulse = useRef(new Animated.Value(0)).current;

  // Сброс состояния при каждом открытии
  useEffect(() => {
    if (visible) {
      setRemaining(timerSec);
    }
  }, [visible, timerSec]);

  // Обновление eta при загрузке рекомендации с сервера
  useEffect(() => {
    if (initialEtaMin != null) {
      setEtaMin(initialEtaMin);
    }
  }, [initialEtaMin]);

  // Обратный отсчёт таймера
  useEffect(() => {
    if (!visible) return;
    if (remaining <= 0) {
      onDismiss();
      return;
    }
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [visible, remaining, onDismiss]);

  // Pulse-animation
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.4],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  const paymentLabel = useMemo(() => {
    switch (order?.paymentMethod) {
      case 'cash':
        return { icon: 'cash-outline' as const, text: 'Наличные' };
      case 'card':
        return { icon: 'card-outline' as const, text: 'Карта' };
      case 'bonus':
        return { icon: 'gift-outline' as const, text: 'Бонусы' };
      default:
        return { icon: 'help-circle-outline' as const, text: '—' };
    }
  }, [order?.paymentMethod]);

  if (!order) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Шапка */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.radarIcon}>
                <Ionicons name="radio" size={20} color="#137fec" />
              </View>
              <View>
                <Text style={styles.headerTitle}>
                  {mode === 'offer' ? 'Входящий заказ' : 'Новый заказ'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {mode === 'offer' ? 'Предложение от диспетчера' : 'Подтвердите взятие'}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {order.tariffName && (
                <View style={styles.tariffBadge}>
                  <Text style={styles.tariffText}>{order.tariffName}</Text>
                </View>
              )}
              <View style={styles.paymentRow}>
                <Ionicons name={paymentLabel.icon} size={14} color="#92adc9" />
                <Text style={styles.paymentText}>{paymentLabel.text}</Text>
              </View>
            </View>
          </View>

          {/* Маршрут */}
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={styles.dotPickup} />
              <View style={styles.routeLine} />
              {(order.stops ?? []).map((_, i) => (
                <React.Fragment key={i}>
                  <View style={styles.dotStop} />
                  <View style={styles.routeLine} />
                </React.Fragment>
              ))}
              <View style={styles.dotDropoff} />
            </View>
            <View style={styles.routeInfo}>
              <View>
                <View style={styles.routeLabelRow}>
                  <Text style={styles.routeLabel}>ОТКУДА</Text>
                  {etaLoading ? (
                    <ActivityIndicator size="small" color="#137fec" />
                  ) : (
                    <Text style={styles.routeEta}>~{etaMin} мин</Text>
                  )}
                </View>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {order.pickupAddress}
                </Text>
              </View>
              {(order.stops ?? []).map((stop, i) => (
                <View key={i}>
                  <Text style={styles.routeLabel}>ОСТАНОВКА {i + 1}</Text>
                  <Text style={styles.routeAddressStop} numberOfLines={1}>
                    {stop.address}
                  </Text>
                </View>
              ))}
              <View>
                <Text style={styles.routeLabel}>КУДА</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {order.dropoffAddress ?? 'По городу'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Цена + рейтинг */}
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Стоимость</Text>
              <Text style={styles.priceValue}>
                {order.estimatedPrice != null
                  ? `${Math.round(order.estimatedPrice)} ₽`
                  : '—'}
              </Text>
            </View>
            <View style={styles.distance}>
              <Text style={styles.priceLabel}>Маршрут</Text>
              <Text style={styles.distanceValue}>
                {order.estimatedKm != null ? `${order.estimatedKm} км` : '—'}
              </Text>
            </View>
          </View>

          {/* Селектор времени подачи */}
          <EtaSelector
            value={etaMin}
            onChange={setEtaMin}
            disabled={accepting || etaLoading}
          />

          {/* Кнопка «Принять» с таймером */}
          <View style={styles.ctaWrap}>
            <View style={styles.ringWrap}>
              <CircularTimer remaining={remaining} total={timerSec} />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Принять заказ с временем подачи ${etaMin} минут`}
                onPress={() => onAccept(etaMin)}
                disabled={accepting}
                style={({ pressed }) => [
                  styles.acceptBtn,
                  pressed && styles.acceptBtnPressed,
                  accepting && styles.acceptBtnDisabled,
                ]}
              >
                {accepting ? (
                  <ActivityIndicator color="#ffffff" size="large" />
                ) : (
                  <>
                    <Text style={styles.acceptBtnText}>Принять</Text>
                    <Text style={styles.acceptBtnTimer}>{remaining}с</Text>
                  </>
                )}
              </Pressable>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Пропустить заказ"
              onPress={onDismiss}
              disabled={accepting}
              style={styles.skipBtn}
            >
              <Ionicons name="close" size={18} color="#58738e" />
              <Text style={styles.skipBtnText}>Пропустить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Стили                                                                      */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 26, 34, 0.88)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    backgroundColor: '#192633',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#324d67',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    flex: 1,
  },
  radarIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19,127,236,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#92adc9',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tariffBadge: {
    backgroundColor: '#324d67',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tariffText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentText: {
    color: '#92adc9',
    fontSize: 11,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  routeDots: {
    alignItems: 'center',
    paddingTop: 6,
    width: 12,
  },
  dotPickup: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#137fec',
    backgroundColor: '#192633',
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#324d67',
    marginVertical: 4,
  },
  dotDropoff: {
    width: 10,
    height: 10,
    backgroundColor: '#ffffff',
    transform: [{ rotate: '45deg' }],
  },
  routeInfo: {
    flex: 1,
    gap: 10,
  },
  routeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  routeLabel: {
    color: '#92adc9',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  routeEta: {
    color: '#137fec',
    fontSize: 11,
    fontWeight: '700',
  },
  routeAddress: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  routeAddressStop: {
    color: '#c8d9e8',
    fontSize: 14,
    fontWeight: '600',
  },
  dotStop: {
    width: 8,
    height: 8,
    backgroundColor: '#f59e0b',
    transform: [{ rotate: '45deg' }],
  },
  divider: {
    height: 1,
    backgroundColor: '#324d67',
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceLabel: {
    color: '#92adc9',
    fontSize: 11,
    marginBottom: 2,
  },
  priceValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  distance: {
    alignItems: 'flex-end',
  },
  distanceValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  ctaWrap: {
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: RING_SIZE - 16,
    height: RING_SIZE - 16,
    borderRadius: (RING_SIZE - 16) / 2,
    backgroundColor: 'rgba(19,127,236,0.3)',
  },
  acceptBtn: {
    width: RING_SIZE - 24,
    height: RING_SIZE - 24,
    borderRadius: (RING_SIZE - 24) / 2,
    backgroundColor: '#137fec',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#137fec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtnPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: '#0f6bd1',
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  acceptBtnTimer: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  skipBtnText: {
    color: '#58738e',
    fontSize: 14,
    fontWeight: '600',
  },
});

const etaStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#233648',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  label: {
    color: '#92adc9',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#324d67',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  valueText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
  },
  valueUnit: {
    color: '#92adc9',
    fontSize: 14,
    fontWeight: '600',
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#324d67',
  },
  presetActive: {
    backgroundColor: '#137fec',
  },
  presetText: {
    color: '#92adc9',
    fontSize: 13,
    fontWeight: '700',
  },
  presetTextActive: {
    color: '#ffffff',
  },
});
