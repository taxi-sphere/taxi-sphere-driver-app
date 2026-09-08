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
 *   КАК В НАВИГАТОРЕ (1.5.39). Машина притягивается к линии маршрута
 *   (`@/lib/route-snap`), курс берётся с того отрезка дороги, на который
 *   она встала, а сама линия рисуется от машины ВПЕРЁД. До этого стрелка
 *   стояла там, куда её положил GPS, — во дворе, на соседнем доме, — а
 *   линия маршрута шла рядом сама по себе и никуда от водителя не вела.
 *
 *   ОРИЕНТАЦИЯ КАРТЫ (1.5.42). Водитель выбирает в настройках: «по курсу»
 *   (дорога впереди вверху, как в навигаторе) или «север сверху». Правило
 *   и компенсация угла стрелки — в `@/lib/map-orientation`, там же
 *   объяснено, почему до 1.5.42 карта была жёстко севером вверх.
 *
 * @dependencies: react-native-maps, react-native-svg, expo-location,
 *   @/lib/theme, @/hooks/useOrderRoute, @/lib/map-fit, @/lib/heading,
 *   @/lib/route-snap, @/lib/map-orientation, @/stores/settings.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-08 (1.5.42 — режимы ориентации карты)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/lib/theme';
import { AppText } from '@/components/ui';
import Svg, { Path } from 'react-native-svg';
import { NIGHT_MAP_STYLE } from './night-map-style';
import { DAY_MAP_STYLE } from './day-map-style';
import { useOrderRoute } from '@/hooks/useOrderRoute';
import { mapFitKey } from '@/lib/map-fit';
import { bearingDegrees, distanceMeters, headingAlong, MIN_SPAN_M } from '@/lib/heading';
import { routeAhead, snapToRoute } from '@/lib/route-snap';
import {
  angleDelta,
  RESUME_COURSE_UP_M,
  screenHeading,
  shouldTurnCamera,
  targetCameraHeading,
} from '@/lib/map-orientation';
import { useSettingsStore } from '@/stores/settings.store';
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

/** Размер стрелки водителя на экране. */
const ARROW_SIZE = 36;


/**
 * Сколько длится доворот камеры.
 *
 * Мгновенный поворот читается как рывок и сбивает с толку; долгий —
 * отстаёт от машины в повороте. Треть секунды — примерно столько же, что
 * и у штатных навигаторов.
 */
const CAMERA_TURN_MS = 300;


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
  const mapOrientation = useSettingsStore((s) => s.mapOrientation);
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
   * Машина на дороге, а не там, куда её положил приёмник.
   *
   * Проекция на маршрут делает сразу две вещи, которых по отдельности не
   * добиться: ставит стрелку на дорогу и даёт ей курс этого куска дороги.
   * Дальше `MAX_SNAP_M` от линии проекции нет — водитель действительно
   * съехал с маршрута, и показывать его на ней было бы враньём.
   */
  const snap = useMemo(
    () => (driverLocation ? snapToRoute(driverLocation, routeCoords) : null),
    [driverLocation, routeCoords],
  );
  const driverPoint = snap?.point ?? driverLocation;

  /**
   * Куда развернуть стрелку водителя.
   *
   * Порядок источников не случаен. Отрезок дороги под машиной — самый
   * устойчивый: он не дрожит от шума приёмника и не пропадает, когда машина
   * стоит. Съехал с маршрута — остаётся собственное перемещение, это факт, а
   * не план. Не тронулся ни разу — первый отрезок линии маршрута: он
   * построен по дорогам от водителя и показывает, куда ехать. Нет ничего —
   * `null`, и рисуется точка без направления, а не стрелка наугад на север.
   */
  const driverHeading = snap?.bearing ?? movementHeading ?? headingAlong(routeCoords);

  /**
   * Линия рисуется ОТ машины вперёд: пройденный хвост навигатор не
   * показывает, а главное — так линия начинается ровно под стрелкой, а не
   * висит рядом с ней. Охвату (`fitAll`) отдаётся полный маршрут: «показать
   * весь маршрут» должно показывать весь.
   */
  const lineCoords = useMemo(() => routeAhead(routeCoords, snap), [routeCoords, snap]);

  /**
   * Куда сейчас повёрнута камера. Ведём сами, а не спрашиваем карту:
   * поворот задаём только мы (жесты поворота выключены), а `getCamera()`
   * — асинхронный запрос за значением, которое и так известно.
   */
  const [cameraHeading, setCameraHeading] = useState(0);

  /**
   * Откуда водитель попросил общий план.
   *
   * Кнопка разворачивает карту севером вверх, и держать этот вид надо,
   * пока водитель на него смотрит. Возвращаем поворот, когда он поехал
   * дальше — по пройденному расстоянию, а не по времени: стоящий в пробке
   * не должен терять обзор через десять секунд.
   */
  const overviewFromRef = useRef<{ latitude: number; longitude: number } | null>(null);


  /**
   * Угол стрелки НА ЭКРАНЕ: курс минус поворот карты. В режиме «по курсу»
   * камера довёрнута под машину, и стрелка смотрит вверх; в режиме «север
   * сверху» — по курсу, как было до 1.5.42.
   */
  const hasHeading = driverHeading != null;
  const arrowHeading = hasHeading ? screenHeading(driverHeading, cameraHeading) : 0;


  // Позиция водителя в охвате нужна, но НЕ должна его перезапускать —
  // поэтому лежит в ref, а не в зависимостях эффекта. См. комментарий к
  // fitKey ниже.
  const driverLocationRef = useRef(driverLocation);
  driverLocationRef.current = driverLocation;

  /**
   * Подогнать карту так, чтобы влезли все точки и линия маршрута.
   *
   * ПОВОРОТ ЗДЕСЬ НЕ ТРОГАЕМ, И ПО УМОЛЧАНИЮ НЕ АНИМИРУЕМ. У камеры два
   * хозяина — эта подгонка и доворот по курсу, — и на Android второй
   * обрывает анимацию первого: `animateCamera` отменяет незаконченный
   * `fitToCoordinates`, и карта застывает там, где её застали. Выглядит
   * это не как рывок, а как «маршрут вообще не строится»: линия и стрелка
   * остаются за краем экрана, потому что охват так и не доехал. Поймано на
   * эмуляторе 08.09.2026; оба события приходят одним коммитом, когда
   * появляется позиция водителя, так что разойтись сами они не могут.
   *
   * Мгновенную подгонку прерывать нечего — гонки нет вовсе. Анимация
   * остаётся кнопке общего плана: там доворот и так заглушён, пока
   * водитель не поехал дальше.
   *
   * Севером вверх обзор разворачивает тоже только кнопка
   * (`handleOverview`).
   */
  const fitAll = useCallback((animated = false) => {
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
        animated,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion(
        { ...coords[0], latitudeDelta: 0.01, longitudeDelta: 0.01 },
        animated ? 500 : 0,
      );
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

  /**
   * Доворот камеры под курс.
   *
   * Порог обязателен: курс шумит, и без него карта мелко трясётся на
   * каждом фиксе GPS. В режиме «север сверху» доворачивать нечего — просто
   * возвращаем ноль, если он был сбит.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Пока водитель смотрит общий план — не отнимать его поворотом.
    const overviewFrom = overviewFromRef.current;
    if (overviewFrom) {
      if (!driverPoint || distanceMeters(overviewFrom, driverPoint) < RESUME_COURSE_UP_M) {
        return;
      }
      overviewFromRef.current = null;
    }

    const needTurn =
      mapOrientation === 'course'
        ? shouldTurnCamera(cameraHeading, driverHeading)
        : Math.abs(angleDelta(cameraHeading, 0)) > 0.5;
    if (!needTurn) return;

    const target = targetCameraHeading(mapOrientation, driverHeading);
    map.animateCamera({ heading: target }, { duration: CAMERA_TURN_MS });
    setCameraHeading(target);
  }, [mapOrientation, driverHeading, cameraHeading, driverPoint]);

  /**
   * Кнопка «показать весь маршрут».
   *
   * Обзор всегда севером вверх: повёрнутый общий план нечитаем — на нём не
   * понять, где север и куда тянется маршрут, а именно за этим на него и
   * смотрят. Порядок важен: сначала МГНОВЕННЫЙ сброс поворота, потом
   * подгонка охвата. Иначе охват посчитан под один угол, а показан под
   * другим, и часть маршрута уезжает за край.
   *
   * Мгновенно — это метод `setCamera`: он уходит командой в
   * `animateToCamera(camera, 0)`, который достраивает недостающие поля из
   * текущей позиции карты и двигает её без анимации. `animateCamera` с
   * нулевой длительностью не подошёл бы: JS-обёртка библиотеки проверяет
   * длительность на истинность (`opts?.duration ? opts.duration : 500`), и
   * ноль молча превращается в полсекунды анимации. (И не путать с ПРОПОМ
   * `camera`: одноимённый нативный сеттер собирает позицию С НУЛЯ, так что
   * частичное значение отправило бы карту в точку (0, 0).)
   *
   * Запоминаем и место: пока водитель не проехал `RESUME_COURSE_UP_M`,
   * карта держит общий план и не разворачивается обратно по курсу.
   */
  const handleOverview = useCallback(() => {
    overviewFromRef.current = driverLocationRef.current;
    mapRef.current?.setCamera({ heading: 0 });
    setCameraHeading(0);
    fitAll(true);
  }, [fitAll]);

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
        // Поворот пальцами выключен в ОБОИХ режимах: камерой управляет
        // приложение, и жест тянул бы её в другую сторону — водитель
        // крутил бы карту, а она возвращалась. Наклон убран отдельно:
        // случайные касания двумя пальцами кладут карту набок.
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {lineCoords.length >= 2 && (
          <>
            {/* Подложка светлее и шире — линия читается и на тёмной карте,
                и поверх пёстрых кварталов. */}
            <Polyline
              coordinates={lineCoords}
              strokeColor={theme.colors.mapRouteCasing}
              strokeWidth={9}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={lineCoords}
              strokeColor={theme.colors.mapRouteLine}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {driverPoint && (
          <Marker
            coordinate={driverPoint}
            title="Вы здесь"
            anchor={{ x: 0.5, y: 0.5 }}
            // Поворот — НАТИВНЫМ пропом, а не внутри разметки маркера.
            //
            // Разметку Android рисует в растр и обновляет, только пока
            // открыто окно `tracksViewChanges`. Угол же меняется когда
            // угодно — и 08.09.2026 на эмуляторе стрелка так и осталась
            // повёрнутой на прежние 327°, хотя в состоянии уже стоял ноль:
            // окно к тому моменту закрылось. Ошибка не видна ниоткуда,
            // кроме самой картинки. Нативный поворот растра не касается.
            //
            // Угол ЭКРАННЫЙ: маркер со своей разметкой остаётся билбордом
            // и о повороте карты не знает, поэтому её разворот вычтен в
            // `screenHeading`. (`flat`, у которого Google считает угол от
            // севера карты, на таком маркере не действует — проверено.)
            rotation={arrowHeading}
            // `tracksViewChanges` НЕ выключаем — и это осознанно.
            //
            // Выключенным он экономит перерисовку растра, но ценой того,
            // что маркер перестаёт обновляться в непредсказуемый момент:
            // 08.09.2026 на эмуляторе стрелка сперва застыла повёрнутой на
            // прежний угол, а потом и вовсе пропала при возврате из
            // настроек. Обе поломки невидимы ниоткуда, кроме самой
            // картинки. Разметка тут — один значок 36×36, а остальные метки
            // на этой же карте и так живут со значением по умолчанию.
          >
            {/* Цвет НЕ тот, что у линии маршрута: одинаковый синий сливался
                бы со своей же линией, и стрелку приходилось бы искать. */}
            <DriverArrow color={theme.colors.primary} hasHeading={hasHeading} />
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
        onPress={handleOverview}
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
 * Стрелка водителя — тот же шеврон, что на карте диспетчера
 * (`osm-live-map-panel.tsx`, путь `M16 2 L24 27 L16 21 L8 27 Z`).
 *
 * ПОЧЕМУ НЕ КРУЖОК СО ЗНАЧКОМ. До 1.5.39 это был цветной кружок, внутри
 * которого крутилась иконка стрелки: направление читалось плохо (стрелка
 * маленькая и заперта в круге), а сам круг закрывал перекрёсток. Шеврон
 * острый, его направление видно боковым зрением, и это ровно то, что
 * водитель уже видит у себя в админке и в любом навигаторе.
 *
 * Без курса рисуется точка с обводкой — как «вы здесь» в картах, когда
 * направление неизвестно. Стрелка наугад на север врала бы.
 *
 * Сам шеврон всегда нарисован «вверх»: за угол отвечает карта (`flat` +
 * `rotation` у маркера), а не эта разметка.
 */
function DriverArrow({ color, hasHeading }: { color: string; hasHeading: boolean }) {
  const theme = useTheme();

  if (!hasHeading) {
    return (
      <View style={[styles.dot, { backgroundColor: color, borderColor: theme.colors.surface }]} />
    );
  }

  // Обёртка с ЯВНЫМИ размерами обязательна. Android снимает разметку маркера
  // в картинку до того, как её измерит, и вложенный SVG без заданной снаружи
  // высоты схлопывается: на эмуляторе стрелка выходила размером в несколько
  // пикселей — видно, что что-то нарисовано, и не видно что.
  return (
    <View style={styles.arrow}>
      <Svg width={ARROW_SIZE} height={ARROW_SIZE} viewBox="0 0 32 32">
        <Path
          d="M16 2 L24 27 L16 21 L8 27 Z"
          fill={color}
          stroke={theme.colors.surface}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </Svg>
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
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // «Вы здесь» без направления — точка, как в картах.
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
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
