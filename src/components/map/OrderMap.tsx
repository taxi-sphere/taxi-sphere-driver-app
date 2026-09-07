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
 *   ЛИНИЯ МАРШРУТА (1.5.36). До неё карта показывала три метки — водитель,
 *   клиент, точка назначения — и молчала о том, как между ними ехать: путь
 *   водитель достраивал в голове или уходил в навигатор. Линия строится по
 *   дорогам, на сервере (см. `useOrderRoute`), и ведёт туда, куда водителю
 *   ехать сейчас: до посадки к клиенту, после — к точке назначения.
 *
 *   Линии может не быть: у заказа нет координат цели, роутер недоступен,
 *   интернет пропал. Это не ошибка и не пустой экран — карта остаётся ровно
 *   такой, какой была до 1.5.36.
 *
 *   ОХВАТ КАРТЫ (1.5.37) пересчитывается на события, а не на движение —
 *   правило и причина целиком в шапке `@/lib/map-fit`. Вернуть общий план
 *   водитель может кнопкой в правом верхнем углу.
 *
 * @dependencies: react-native-maps, expo-location, @/lib/theme,
 *   @/hooks/useOrderRoute, @/lib/map-fit, @/lib/heading
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-07 (1.5.38 — светлая карта в светлой теме, стрелка направления)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/lib/theme';
import { AppText } from '@/components/ui';
import { NIGHT_MAP_STYLE } from './night-map-style';
import { useOrderRoute } from '@/hooks/useOrderRoute';
import { mapFitKey } from '@/lib/map-fit';
import { bearingDegrees, distanceMeters, headingAlong, MIN_SPAN_M } from '@/lib/heading';
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

/**
 * Один общий пустой массив на все рендеры без маршрута.
 *
 * Литерал `[]` в теле компонента — новая ссылка на каждый рендер, а массив
 * стоит в зависимостях эффекта автомасштаба: карта пересчитывала бы охват
 * бесконечно.
 */
const NO_ROUTE: { latitude: number; longitude: number }[] = [];

/**
 * Дневной стиль карты — ПУСТОЙ МАССИВ, а не `undefined`.
 *
 * Это не косметика, а обход поведения библиотеки. `react-native-maps` 1.26
 * на Android применяет стиль так:
 *
 *     if (map != null && customMapStyleString != null) {
 *         map.setMapStyle(new MapStyleOptions(customMapStyleString));
 *     }
 *
 * `null` ПРОПУСКАЕТСЯ. То есть однажды применённый ночной стиль не
 * снимается никогда, и переключение приложения на светлую тему на карту не
 * действовало вовсе — карта оставалась чёрной при белом интерфейсе (1.5.38).
 * Пустой массив даёт строку `"[]"`: она не `null`, доходит до `setMapStyle`
 * и сбрасывает карту к стандартному дневному виду.
 */
const DAY_MAP_STYLE: never[] = [];

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

  /**
   * Куда водитель едет — по его собственному перемещению.
   *
   * `null`, пока машина не проехала `MIN_SPAN_M`: до этого угол между двумя
   * фиксами — это шум приёмника, а не поворот. Раз посчитанный, угол больше
   * не сбрасывается — стоящая машина смотрит туда же, куда ехала, как в
   * любом навигаторе.
   */
  const [movementHeading, setMovementHeading] = useState<number | null>(null);
  /** Точка, от которой отсчитывается следующий угол. */
  const headingAnchorRef = useRef<{ latitude: number; longitude: number } | null>(null);

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
          const next = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          // Курс считаем по пройденному отрезку, а НЕ берём `loc.coords.heading`:
          // на серверной записи трека этот курс принимал два различных значения
          // на 356 точек — приёмник его на городских скоростях просто не считает
          // (тот же урок, что в админке, v1.99.84).
          const anchor = headingAnchorRef.current;
          if (!anchor) {
            headingAnchorRef.current = next;
          } else if (distanceMeters(anchor, next) >= MIN_SPAN_M) {
            setMovementHeading(bearingDegrees(anchor, next));
            headingAnchorRef.current = next;
          }

          setDriverLocation(next);
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  const route = useOrderRoute({
    orderId: order.id,
    status: order.status,
    lat: driverLocation?.latitude,
    lng: driverLocation?.longitude,
  });
  const routeCoords = route?.coordinates ?? NO_ROUTE;

  /**
   * Куда развернуть стрелку водителя.
   *
   * Порядок источников не случаен. Собственное перемещение — самый честный
   * ответ на «куда он едет»: это факт, а не план. Пока машина не тронулась,
   * его нет, и тогда берём первый отрезок линии маршрута — он построен по
   * дорогам и начинается в точке водителя, то есть показывает, куда ехать.
   * Нет ни того, ни другого (маршрут не построился, машина стоит) —
   * `null`, и маркер честно рисуется без стрелки, а не наугад на север.
   */
  const driverHeading = movementHeading ?? headingAlong(routeCoords);

  // Позиция водителя в охвате нужна, но НЕ должна его перезапускать —
  // поэтому лежит в ref, а не в зависимостях эффекта. См. комментарий к
  // fitKey ниже.
  const driverLocationRef = useRef(driverLocation);
  driverLocationRef.current = driverLocation;

  /** Подогнать карту так, чтобы влезли все точки и линия маршрута. */
  const fitAll = useCallback(() => {
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
    const here = driverLocationRef.current;
    if (here) coords.push(here);
    // Маршрут по дорогам может выходить за прямоугольник по меткам — объезд
    // реки или одностороннее движение уводят линию в сторону. Без неё в
    // расчёте часть пути оставалась бы за краем экрана.
    coords.push(...routeCoords);

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
    routeCoords,
    bottomInset,
  ]);

  // Охват пересчитывается на события, а не на движение — правило и причина
  // целиком в шапке @/lib/map-fit, там же оно покрыто тестами.
  const fitKey = mapFitKey({
    orderId: order.id,
    status: order.status,
    hasPickup: order.pickupLat != null,
    hasDropoff: order.dropoffLat != null,
    stopsCount: order.stops?.length ?? 0,
    hasRoute: routeCoords.length > 0,
    hasDriverLocation: driverLocation != null,
  });

  useEffect(() => {
    fitAll();
    // fitAll намеренно НЕ в зависимостях: он пересоздаётся при каждом новом
    // маршруте, и эффект снова стал бы срабатывать на движение.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

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
        customMapStyle={theme.isDark ? NIGHT_MAP_STYLE : DAY_MAP_STYLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        // Карта строго «севером вверх». Стрелка водителя развёрнута
        // трансформом внутри маркера, а он о повороте самой карты не знает —
        // при развёрнутой карте стрелка показывала бы не туда. Наклон убран
        // по той же причине плюс из-за случайных касаний двумя пальцами.
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {routeCoords.length >= 2 && (
          <>
            {/* Подложка светлее и шире — линия читается и на тёмной карте,
                и поверх пёстрых кварталов. */}
            <Polyline
              coordinates={routeCoords}
              strokeColor={theme.colors.mapRouteCasing}
              strokeWidth={9}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor={theme.colors.mapRouteLine}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {driverLocation && (
          <Marker coordinate={driverLocation} title="Вы здесь" anchor={{ x: 0.5, y: 0.5 }}>
            <MapPin color={theme.colors.info} icon="car-sport" ring rotation={driverHeading} />
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

      {/* Вернуть общий план. Появилась вместе с отказом от автомасштаба на
          каждую точку (1.5.37): раньше карта возвращалась сама, теперь это
          решение водителя. Справа сверху — слева над картой стоят вкладки
          «Текущий / Встречный». */}
      <Pressable
        onPress={fitAll}
        accessibilityRole="button"
        accessibilityLabel="Показать весь маршрут"
        hitSlop={8}
        style={({ pressed }) => [
          styles.fitButton,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="scan-outline" size={20} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}

/**
 * Маркер: цветной кружок со значком и белой обводкой.
 *
 * Обводка обязательна — без неё тёмный маркер теряется на ночной карте, а
 * светлый на дневной.
 *
 * СТРЕЛКА НАПРАВЛЕНИЯ (1.5.38). Если задан `rotation`, вместо значка
 * рисуется стрелка, развёрнутая по курсу. До этого маркер водителя был
 * неподвижным кружком с машинкой: куда водитель повёрнут, карта не
 * сообщала вовсе, и линия маршрута просто обрывалась у кружка. Крутится
 * ТОЛЬКО стрелка внутри — сам кружок и кольцо остаются на месте, иначе
 * обводка и подсветка «дышали» бы вместе с поворотом.
 */
function MapPin({
  color,
  icon,
  ring = false,
  rotation = null,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  ring?: boolean;
  /** Курс в градусах (0 — на север). `null` — направление неизвестно. */
  rotation?: number | null;
}) {
  const theme = useTheme();
  const hasHeading = rotation != null && Number.isFinite(rotation);

  return (
    <View style={[styles.pin, { backgroundColor: color, borderColor: theme.colors.surface }]}>
      {hasHeading ? (
        <Ionicons
          name="arrow-up"
          size={17}
          color="#ffffff"
          style={{ transform: [{ rotate: `${rotation}deg` }] }}
        />
      ) : (
        <Ionicons name={icon} size={15} color="#ffffff" />
      )}
      {ring && <View style={[styles.pinRing, { borderColor: color }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  fitButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    // Тень нужна: без неё белая кнопка теряется на светлой карте.
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
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
