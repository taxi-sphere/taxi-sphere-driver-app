/**
 * @file: src/components/map/OrderMap.tsx
 * @description:
 *   Карта заказа: точки маршрута и позиция водителя.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17.
 *   • Режим `fill` — карта на весь экран, а не полоска в 180px. В прежнем
 *     размере на ней нельзя было ни оценить обстановку, ни разглядеть, где
 *     стоит клиент; она занимала место, не давая взамен ничего.
 *   • Маркеры свои, а не стандартные «капли» `pinColor`: цвет точки теперь
 *     тот же, что у неё в списке адресов, и точки различимы по значку, а не
 *     только по оттенку.
 *   • Ночной стиль карты в тёмной теме. Дневная карта в темноте — самый
 *     яркий объект в машине.
 *   • `bottomInset` — авто-масштаб учитывает шторку, иначе она накрывала
 *     нижнюю точку маршрута, и водитель видел маршрут «наполовину».
 *
 * @dependencies: react-native-maps, expo-location, @/lib/theme
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — полноэкранный режим, свои маркеры, ночной стиль)
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/lib/theme';
import { AppText } from '@/components/ui';
import { NIGHT_MAP_STYLE } from './night-map-style';
import type { CurrentOrder } from '@/types/order';

interface OrderMapProps {
  order: CurrentOrder;
  /** Фиксированная высота. Игнорируется при `fill`. */
  height?: number;
  /** Растянуть на весь родительский контейнер. */
  fill?: boolean;
  /**
   * Сколько пикселей снизу перекрыто шторкой — на столько же опускается
   * нижняя граница области автомасштаба.
   */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
}

/** Как часто обновлять позицию водителя на карте. */
const WATCH_INTERVAL_MS = 3000;
const WATCH_DISTANCE_M = 10;

export function OrderMap({
  order,
  height = 200,
  fill = false,
  bottomInset = 0,
  style,
}: OrderMapProps) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Отслеживание позиции водителя
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: WATCH_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_M,
        },
        (loc) => {
          setDriverLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  // Авто-zoom на все маркеры
  useEffect(() => {
    if (!mapRef.current) return;

    const coords: { latitude: number; longitude: number }[] = [];

    if (order.pickupLat && order.pickupLng) {
      coords.push({ latitude: order.pickupLat, longitude: order.pickupLng });
    }
    if (order.dropoffLat && order.dropoffLng) {
      coords.push({ latitude: order.dropoffLat, longitude: order.dropoffLng });
    }
    order.stops?.forEach((s) => {
      if (s.lat && s.lng) coords.push({ latitude: s.lat, longitude: s.lng });
    });
    if (driverLocation) {
      coords.push(driverLocation);
    }

    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        // Снизу отступ больше на высоту шторки: иначе точка назначения
        // оказывается ровно под ней.
        edgePadding: { top: 80, right: 56, bottom: 56 + bottomInset, left: 56 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion({
        ...coords[0],
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [
    order.pickupLat,
    order.pickupLng,
    order.dropoffLat,
    order.dropoffLng,
    order.stops,
    driverLocation,
    bottomInset,
  ]);

  const hasPickup = order.pickupLat != null && order.pickupLng != null;
  const hasDropoff = order.dropoffLat != null && order.dropoffLng != null;

  const frame: StyleProp<ViewStyle> = fill
    ? [StyleSheet.absoluteFill, { backgroundColor: theme.colors.mapPlaceholder }]
    : [
        {
          height,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: theme.colors.mapPlaceholder,
        },
      ];

  if (!hasPickup) {
    return (
      <View style={[frame, styles.centered, style]}>
        <AppText variant="label" tone="muted">
          Координаты не указаны
        </AppText>
      </View>
    );
  }

  return (
    <View style={[frame, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: order.pickupLat!,
          longitude: order.pickupLng!,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        customMapStyle={theme.isDark ? NIGHT_MAP_STYLE : undefined}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {driverLocation && (
          <Marker coordinate={driverLocation} title="Вы здесь" anchor={{ x: 0.5, y: 0.5 }}>
            <MapPin color={theme.colors.info} icon="car-sport" ring />
          </Marker>
        )}

        {hasPickup && (
          <Marker
            coordinate={{ latitude: order.pickupLat!, longitude: order.pickupLng! }}
            title="Подача"
            description={order.pickupAddress}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MapPin color={theme.colors.pointPickup} icon="person" />
          </Marker>
        )}

        {order.stops?.map((stop, i) =>
          stop.lat && stop.lng ? (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              title={`Остановка ${i + 1}`}
              description={stop.address}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <MapPin color={theme.colors.pointStop} icon="ellipse" />
            </Marker>
          ) : null,
        )}

        {hasDropoff && (
          <Marker
            coordinate={{ latitude: order.dropoffLat!, longitude: order.dropoffLng! }}
            title="Назначение"
            description={order.dropoffAddress || ''}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MapPin color={theme.colors.pointDropoff} icon="flag" />
          </Marker>
        )}
      </MapView>
    </View>
  );
}

/**
 * Маркер: цветной кружок со значком и белой обводкой.
 *
 * Обводка обязательна — без неё тёмный маркер теряется на ночной карте, а
 * светлый на дневной.
 */
function MapPin({
  color,
  icon,
  ring = false,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  ring?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.pin, { backgroundColor: color, borderColor: theme.colors.surface }]}>
      <Ionicons name={icon} size={15} color="#ffffff" />
      {ring && <View style={[styles.pinRing, { borderColor: color }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.35,
  },
});
