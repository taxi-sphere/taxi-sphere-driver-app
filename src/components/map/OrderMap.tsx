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
 *   КАМЕРА ВЕДЁТ МАШИНУ (1.5.45). До этой версии камера двигалась ровно
 *   дважды за поездку — и всё остальное время водитель ехал по неподвижной
 *   карте, а стрелка уползала за край. Тем же корнем объяснялись ещё две
 *   жалобы, выглядевшие отдельными: карта поворачивается вокруг СВОЕГО
 *   центра, поэтому доворот по курсу выбрасывал стрелку с экрана тем
 *   сильнее, чем дальше она от центра. Теперь камера едет за машиной, и
 *   правило «чья сейчас камера» — в `@/lib/map-follow`.
 *
 *   ПОЧЕМУ В РЕЖИМЕ СЛЕЖЕНИЯ СТРЕЛКА — НЕ МЕТКА НА КАРТЕ. Метка стоит в
 *   координате, а камера едет к ней анимацией: каждую секунду метка
 *   оказывалась бы впереди центра и весь путь до него «догонялась». Вместо
 *   этого стрелка рисуется НЕПОДВИЖНО в центре кадра, а под ней едет
 *   дорога — как в любом навигаторе. Заодно исчезает целый класс ошибок:
 *   стрелка, которой нет на карте, не может ни отстать от неё, ни уехать
 *   за край. Метка возвращается ровно тогда, когда водитель забрал карту
 *   себе, — и тогда ей и положено уходить за экран.
 *
 * @dependencies: react-native-maps, react-native-svg, expo-location, expo-router,
 *   @/lib/theme, @/hooks/useOrderRoute, @/lib/map-fit, @/lib/heading,
 *   @/lib/route-snap, @/lib/map-orientation, @/lib/map-follow,
 *   @/stores/settings.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-09 (1.5.51 — стрелка не разворачивается на шуме, настройка слежения)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/lib/theme';
import { AppText } from '@/components/ui';
import Svg, { Path } from 'react-native-svg';
import { NIGHT_MAP_STYLE } from './night-map-style';
import { DAY_MAP_STYLE } from './day-map-style';
import { useOrderRoute } from '@/hooks/useOrderRoute';
import { hasRealChoice } from '@/lib/route-choice';
import { RouteChoiceBar } from '@/components/map/RouteChoiceBar';
import { mapFitKey } from '@/lib/map-fit';
import {
  bearingDegrees,
  distanceMeters,
  headingAlong,
  isSnapBearingSane,
  limitTurn,
  MIN_SPAN_M,
  MIN_SPEED_MPS,
} from '@/lib/heading';
import { routeAhead, snapToRoute } from '@/lib/route-snap';
import { screenHeading, shouldTurnCamera, targetCameraHeading } from '@/lib/map-orientation';
import {
  blendInterval,
  followCameraDuration,
  shouldResumeFollow,
  type FollowInterrupt,
} from '@/lib/map-follow';
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
 * Как часто обновлять позицию водителя на карте.
 *
 * СЕКУНДА, А НЕ ТРИ, И ЭТО ОСОЗНАННО ДОРОЖЕ. Плавность движения на карте
 * задаёт не сглаживание, а темп фиксов: анимация камеры длится один интервал
 * с запасом, и на трёх секундах любой рывок растягивается на три секунды
 * вместе с ним. Это отдельная подписка от той, что шлёт координаты на сервер
 * (`location.service`, 5 с): серверу секундный поток не нужен и стоил бы
 * впятеро больше трафика, а карте нужен именно он.
 *
 * Цена ограничена тем, что подписка живёт только пока экран заказа ОТКРЫТ
 * (см. `useFocusEffect` ниже) — ушёл на другую вкладку, и GPS в этой частоте
 * выключился.
 */
const WATCH_INTERVAL_MS = 1000;

/**
 * Порог смещения. Не ноль: стоящая машина шумит в пределах погрешности
 * приёмника, и с нулём карта дрожала бы на парковке. Три метра этот шум
 * отсекают и при этом не задают темп — их проезжают быстрее секунды на любой
 * скорости выше 11 км/ч.
 */
const WATCH_DISTANCE_M = 3;

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
  const autoFollowMap = useSettingsStore((s) => s.autoFollowMap);
  /**
   * Настройка нужна эффекту камеры, но НЕ должна его перезапускать: он
   * ведёт анимацию слежения, и лишний прогон оборвал бы её на полпути.
   * Тот же приём, что у `followRef` и `driverLocationRef` выше.
   */
  const autoFollowRef = useRef(autoFollowMap);
  autoFollowRef.current = autoFollowMap;

  /**
   * Поколение меток: меняется каждый раз, когда экран получает фокус.
   *
   * ЗАЧЕМ. Метку со своей разметкой Android держит растром, и после ухода
   * с экрана и возврата растр теряется: на карте остаётся одна линия
   * маршрута, а подача, назначение и машина исчезают. Водитель видит
   * маршрут «ниоткуда в никуда» — и это не наша регрессия: то же самое
   * воспроизведено на пересобранной 1.5.41, где пропадают все три метки.
   * Ключ, зависящий от поколения, заставляет создать их заново.
   */
  const [markerEpoch, setMarkerEpoch] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setMarkerEpoch((n) => n + 1);
    }, []),
  );
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Позиция водителя нужна и охвату, и перехвату слежения, но НЕ должна
  // перезапускать их эффекты — поэтому лежит в ref. См. комментарий к fitKey.
  const driverLocationRef = useRef(driverLocation);
  driverLocationRef.current = driverLocation;

  /**
   * Ведёт ли камера машину.
   *
   * Стартуем с ВЫКЛЮЧЕННОГО слежения намеренно: при открытии заказа карта
   * показывает весь маршрут (`fitAll`), и это правильный первый кадр —
   * водитель видит, куда его отправили. Включи слежение сразу, и первый же
   * фикс GPS отменил бы эту подгонку на полпути (`animateCamera` обрывает
   * `fitToCoordinates` — поймано на эмуляторе 08.09.2026). Слежение включится
   * само, когда водитель тронется: правило в `@/lib/map-follow`.
   */
  const [follow, setFollow] = useState(false);
  const followRef = useRef(false);
  followRef.current = follow;

  /** Когда и откуда водитель забрал камеру себе. */
  const interruptRef = useRef<FollowInterrupt | null>({ at: Date.now(), from: null });

  /**
   * Машина в тех же координатах, в каких её видит камера, — то есть уже снятая
   * на дорогу.
   *
   * ЗАЧЕМ ОТДЕЛЬНО ОТ `driverLocationRef`. Правило возврата меряет, сколько
   * машина проехала с момента жеста, и обе точки обязаны быть из одного
   * источника. Возьми начало сырым, а конец снятым — и разница проекции (до
   * `MAX_SNAP_M`, то есть до 50 метров) зачлась бы как проезд: камера
   * возвращалась бы к стоящей машине сама, без единого метра пути.
   */
  const driverPointRef = useRef<{ latitude: number; longitude: number } | null>(null);

  /** Сглаженный интервал между фиксами — из него берётся длительность анимации. */
  const intervalRef = useRef<number | null>(null);
  const lastFixAtRef = useRef<number | null>(null);

  /**
   * Забрать камеру у слежения.
   *
   * Одна дверь на все случаи — жест пальцем, кнопка общего плана, смена
   * стадии заказа. До 1.5.45 у кнопки был свой механизм возврата, а жест не
   * отслеживался вовсе; два ответа на один вопрос «чья камера» разъезжались.
   */
  const interruptFollow = useCallback(() => {
    interruptRef.current = { at: Date.now(), from: driverPointRef.current };
    if (followRef.current) {
      followRef.current = false;
      setFollow(false);
    }
  }, []);

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

  /**
   * Отслеживание позиции водителя — ТОЛЬКО пока экран заказа открыт.
   *
   * Секундный GPS нужен карте и никому больше. Раньше подписка висела всё
   * время, пока смонтирован таб, то есть и когда водитель смотрит заработок
   * или список заказов. Привязка к фокусу выключает её там, где она никому
   * не показывает ни метра.
   */
  useFocusEffect(
    useCallback(() => {
      let subscription: Location.LocationSubscription | undefined;
      let cancelled = false;

      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const sub = await Location.watchPositionAsync(
          {
            // Навигационная точность, а не «High»: стрелка стоит на дороге и
            // ведёт водителя в поворот, здесь метры имеют цену. Экран в это
            // время и так горит (`keepScreenOn`), он дороже приёмника.
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: WATCH_INTERVAL_MS,
            distanceInterval: WATCH_DISTANCE_M,
          },
          (loc) => {
            const next = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };

            // Темп съёмки меряем по факту, а не берём из настроек подписки:
            // приёмник отдаёт когда может, и анимация должна равняться на
            // реальный интервал, иначе карта встаёт между кадрами.
            const now = Date.now();
            const prevAt = lastFixAtRef.current;
            if (prevAt != null) {
              intervalRef.current = blendInterval(intervalRef.current, now - prevAt);
            }
            lastFixAtRef.current = now;

            // Курс считаем по пройденному отрезку, а НЕ берём `loc.coords.heading`:
            // на серверной записи трека этот курс принимал два различных значения
            // на 356 точек — приёмник его на городских скоростях просто не считает
            // (тот же урок, что в админке, v1.99.84).
            /**
             * ПОРОГ СКОРОСТИ, А НЕ ТОЛЬКО РАССТОЯНИЯ (1.5.51).
             *
             * Стоящая машина всё равно «ползёт» по координатам: приёмник
             * шумит, и за минуту на светофоре набегает больше пятнадцати
             * метров случайного блуждания — расстояние наберётся, а
             * направление у него будет произвольное. Так стрелка и
             * разворачивалась на 180° у машины, едущей прямо.
             *
             * `speed` в expo-location — метры в секунду; `-1` или
             * `undefined` означает «приёмник не знает», и тогда решает
             * только расстояние, как раньше.
             */
            const speed = loc.coords.speed;
            const movingFast = speed == null || speed < 0 || speed >= MIN_SPEED_MPS;

            const anchor = headingAnchorRef.current;
            if (!anchor) {
              headingAnchorRef.current = next;
            } else if (movingFast && distanceMeters(anchor, next) >= MIN_SPAN_M) {
              // Резкие скачки сглаживаем: машина не разворачивается за секунду.
              setMovementHeading((prev) => limitTurn(prev, bearingDegrees(anchor, next)));
              headingAnchorRef.current = next;
            } else if (!movingFast) {
              // Машина стоит — начинаем отсчёт заново с текущей точки, иначе
              // накопленное за стоянку блуждание сойдёт за поездку.
              headingAnchorRef.current = next;
            }

            setDriverLocation(next);
          },
        );

        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      })();

      return () => {
        cancelled = true;
        subscription?.remove();
        // Пауза в съёмке — не темп съёмки: иначе после возврата на экран
        // первая же анимация растянулась бы на всё время отсутствия.
        lastFixAtRef.current = null;
      };
    }, []),
  );

  const route = useOrderRoute({
    orderId: order.id,
    status: order.status,
    lat: driverLocation?.latitude,
    lng: driverLocation?.longitude,
  });
  // С 1.5.49 хук отдаёт не только линию, но и выбор варианта пути:
  // `route.route` — то, что рисуем, остальное — управление выбором.
  const routeCoords = route.route?.coordinates ?? NO_ROUTE;

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
  driverPointRef.current = driverPoint;

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
  /**
   * ПРОЕКЦИЯ НА МАРШРУТ — ХОРОШИЙ ИСТОЧНИК КУРСА, НО НЕ БЕЗУСЛОВНЫЙ.
   *
   * Она даёт курс того куска дороги, к которому машина оказалась ближе
   * всего, — а на двусторонней улице, на развязке и на устаревшей линии
   * этот кусок бывает ВСТРЕЧНЫМ. Тогда стрелка честно показывает назад,
   * пока водитель едет вперёд (жалоба владельца 09.09.2026).
   *
   * Собственное перемещение так не врёт: оно измерено, а не выбрано. Если
   * проекция расходится с ним больше чем на 120°, верим перемещению.
   */
  const snapBearing =
    snap?.bearing != null && isSnapBearingSane(snap.bearing, movementHeading)
      ? snap.bearing
      : null;
  const driverHeading = snapBearing ?? movementHeading ?? headingAlong(routeCoords);
  // Курс нужен эффекту смены режима, но не должен его запускать: иначе он
  // стал бы вторым хозяином камеры и оборвал бы анимацию слежения.
  const driverHeadingRef = useRef(driverHeading);
  driverHeadingRef.current = driverHeading;

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
   * Куда камера повёрнута ПРЯМО СЕЙЧАС — то есть куда её довели последней
   * командой. Отдельный ref нужен, потому что состояние обновляется не на
   * каждый фикс (порог гасит дрожание курса), а сравнивать надо с последним
   * ОТПРАВЛЕННЫМ значением, а не с последним отрисованным.
   */
  const appliedHeadingRef = useRef(0);

  /** Центр, отправленный камере последней командой. */
  const lastCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);

  /**
   * Угол стрелки НА ЭКРАНЕ: курс минус поворот карты. В режиме «по курсу»
   * камера довёрнута под машину, и стрелка смотрит вверх; в режиме «север
   * сверху» — по курсу, как было до 1.5.42.
   *
   * ОТКУДА БРАЛСЯ РЫВОК ДО 1.5.45. `cameraHeading` выставлялся в целевое
   * значение СРАЗУ, а карта доворачивалась триста миллисекунд — и всё это
   * время угол стрелки был посчитан под поворот, которого ещё не случилось:
   * стрелка вскидывалась вверх, пока дорога под ней лежала по-старому. В
   * режиме слежения этого больше не может произойти в принципе: стрелка
   * нарисована в центре кадра, а не в координате, и в режиме «по курсу»
   * всегда смотрит вверх.
   */
  const hasHeading = driverHeading != null;
  const arrowHeading = hasHeading ? screenHeading(driverHeading, cameraHeading) : 0;


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
    // Подгонка охвата — это тоже «камера не у слежения»: иначе первый же фикс
    // GPS оборвал бы её на полпути. Перехват заодно даёт правильное поведение
    // на смене стадии: водитель видит новый участок целиком, а как тронулся —
    // карта снова ведёт.
    interruptFollow();
    fitAll();
    // fitAll намеренно НЕ в зависимостях: он пересоздаётся при каждом новом
    // маршруте, и эффект снова стал бы срабатывать на движение.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /**
   * Камера ведёт машину: центр и поворот — ОДНОЙ командой на каждый фикс.
   *
   * ПОЧЕМУ ОДНОЙ. Две команды на одну камеру всегда обрывают друг друга —
   * это тот же урок, что записан у `fitAll`. Сдвиг центра и доворот приходят
   * в один и тот же момент (обновилась позиция), так что разделить их
   * означало бы гарантированную гонку.
   *
   * ПОЧЕМУ ДЛИТЕЛЬНОСТЬ СЧИТАЕТСЯ, А НЕ ЗАДАНА КОНСТАНТОЙ. Плавность даёт не
   * длина анимации сама по себе, а то, что следующая начинается раньше, чем
   * закончилась предыдущая. Постоянные 300 мс при фиксах раз в секунду
   * означали бы 700 мс неподвижной карты между кадрами — ровно те «рывки», на
   * которые жалуется водитель. Правило запаса — в `@/lib/map-follow`.
   *
   * ПОЧЕМУ ПОРОГ ОСТАЛСЯ. Он больше не решает, поворачивать ли: центр едет в
   * любом случае, и поворот едет вместе с ним. Он решает только, менять ли
   * ЦЕЛЬ — иначе карта мелко качалась бы вслед за дрожанием курса.
   *
   * ВОЗВРАТ СЛЕЖЕНИЯ проверяется здесь же, а не по таймеру, и это не
   * экономия: фиксы приходят только когда машина едет (порог смещения), а
   * правило возврата как раз и требует, чтобы она ехала. Стоящая машина не
   * рождает событий — и её карта остаётся у водителя сама собой.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!follow) {
      // Перехват мог случиться до того, как приёмник дал первую точку
      // (открытие экрана) — тогда отсчёт расстояния начинается отсюда.
      const interrupt = interruptRef.current;
      if (interrupt && !interrupt.from && driverPoint) interrupt.from = driverPoint;

      /**
       * САМО СЛЕЖЕНИЕ ВКЛЮЧАЕТСЯ, ТОЛЬКО ЕСЛИ ВОДИТЕЛЬ ЭТОГО ХОЧЕТ (1.5.51).
       *
       * По умолчанию хочет — так приложение и вело себя с 1.5.45. Но у
       * части водителей телефон работает обзорной картой: они отодвигают
       * её, чтобы посмотреть обстановку, а слежение забирает камеру назад
       * через полтораста метров. Настройка «Карта едет за машиной» гасит
       * именно ЭТОТ автоматический возврат; кнопка с прицелом продолжает
       * включать слежение по нажатию — и становится не «вернуть», а
       * «вести».
       */
      if (
        autoFollowRef.current &&
        shouldResumeFollow(interruptRef.current, Date.now(), driverPoint)
      ) {
        interruptRef.current = null;
        setFollow(true);
      }
      return;
    }
    if (!driverPoint) return;

    const applied = appliedHeadingRef.current;
    const target = targetCameraHeading(mapOrientation, driverHeading);
    const heading = shouldTurnCamera(applied, target) ? target : applied;

    // Тот же кадр второй раз не отправляем. Иначе перестроение линии маршрута
    // (раз в 60–110 м) пересобирало бы `driverPoint` новой ссылкой на те же
    // координаты — и рестартовало анимацию с полпути, что как раз и читается
    // как подёргивание.
    const last = lastCenterRef.current;
    const sameCenter =
      last != null &&
      last.latitude === driverPoint.latitude &&
      last.longitude === driverPoint.longitude;
    if (sameCenter && heading === applied) return;
    lastCenterRef.current = driverPoint;

    if (heading !== applied) {
      appliedHeadingRef.current = heading;
      // Состояние нужно ТОЛЬКО отпущенной камере — метке водителя. В
      // зависимости эффекта его класть нельзя: он бы перезапускал сам себя и
      // слал вторую анимацию на тот же кадр.
      setCameraHeading(heading);
    }

    map.animateCamera(
      { center: driverPoint, heading },
      { duration: followCameraDuration(intervalRef.current) },
    );
  }, [follow, mapOrientation, driverHeading, driverPoint]);

  /**
   * Смена режима ориентации действует сразу — даже если камера отпущена.
   *
   * Слежение доворачивает карту только пока оно включено. Водитель, который
   * отодвинул карту пальцем, зашёл в настройки и переключил «север сверху»,
   * без этого эффекта вернулся бы на карту, повёрнутую по старому курсу, и
   * ждал бы тридцати метров пути, чтобы настройка подействовала. Переключение
   * режима — сознательное действие, на него карта отвечает немедленно.
   *
   * Зависимость ровно одна: реагируем на смену РЕЖИМА, а не на каждый градус
   * курса, иначе эффект превратился бы во второго хозяина камеры.
   */
  useEffect(() => {
    if (followRef.current) return;
    const heading = targetCameraHeading(mapOrientation, driverHeadingRef.current);
    if (heading === appliedHeadingRef.current) return;
    appliedHeadingRef.current = heading;
    setCameraHeading(heading);
    mapRef.current?.setCamera({ heading });
  }, [mapOrientation]);

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
   * Слежение при этом просто перехватывается — теми же правилами, что и
   * жестом пальцем. До 1.5.45 у кнопки был свой механизм возврата, знавший
   * только про поворот: общий план после неё держался вечно, потому что
   * центр никто не возвращал.
   */
  const handleOverview = useCallback(() => {
    interruptFollow();
    mapRef.current?.setCamera({ heading: 0 });
    appliedHeadingRef.current = 0;
    setCameraHeading(0);
    fitAll(true);
  }, [fitAll, interruptFollow]);

  /**
   * Жест по карте забирает камеру у слежения.
   *
   * Два обработчика, а не один: `onPanDrag` ловит перетаскивание, а
   * `isGesture` в `onRegionChangeComplete` — щипок и двойное касание, которые
   * перетаскиванием не считаются. Своя же анимация приходит сюда с
   * `isGesture: false` и слежение не рвёт.
   */
  const handleUserGesture = useCallback(() => {
    // Без проверки «а следим ли сейчас» намеренно: перехват обновляет отметку
    // времени и точку, поэтому отсчёт возврата идёт от ПОСЛЕДНЕГО касания.
    // Иначе водитель, который десять секунд возит карту пальцем, получал бы
    // её обратно через две.
    interruptFollow();
  }, [interruptFollow]);

  const handleRegionChangeComplete = useCallback(
    (_region: unknown, details?: { isGesture?: boolean }) => {
      if (details?.isGesture) handleUserGesture();
    },
    [handleUserGesture],
  );

  /** Кнопка «вернуть камеру к машине» — мгновенно, без ожидания правила. */
  const handleRecenter = useCallback(() => {
    interruptRef.current = null;
    setFollow(true);
  }, []);

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
        // Любой жест водителя забирает камеру у слежения — это и есть его
        // право отодвинуть карту и посмотреть, что впереди.
        onPanDrag={handleUserGesture}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {/* `hidden` гасит только ОТРИСОВКУ. Сама линия остаётся посчитанной:
            на неё проецируется машина (иначе метка спрыгнет с дороги) и по
            ней подгоняется масштаб. Водитель просил убрать линию с глаз, а не
            выключить навигацию. */}
        {!route.hidden && lineCoords.length >= 2 && (
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

        {/* Метка нужна ТОЛЬКО когда камера отпущена. В слежении машина
            нарисована неподвижно в центре кадра (см. шапку файла): метка там
            каждую секунду оказывалась бы впереди центра и догоняла его всю
            анимацию. */}
        {!follow && driverPoint && (
          <Marker
            key={`driver-${markerEpoch}`}
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
            key={`pickup-${markerEpoch}`}
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
              key={`stop-${i}-${markerEpoch}`}
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
            key={`dropoff-${markerEpoch}`}
            coordinate={{ latitude: order.dropoffLat!, longitude: order.dropoffLng! }}
            title="Назначение"
            description={order.dropoffAddress || ''}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MapPin color={theme.colors.pointDropoff} icon="flag" />
          </Marker>
        )}
      </MapView>

      {/* Машина в режиме слежения: неподвижно в центре кадра, дорога едет под
          ней. Центр кадра — не центр видимой части: снизу карту накрывает
          шторка, поэтому геометрическая середина приходится примерно на
          четыре пятых видимой полосы, и впереди машины остаётся ровно то
          место, куда водитель смотрит. */}
      {follow && driverPoint && (
        <View pointerEvents="none" style={styles.followArrow}>
          <DriverArrow
            color={theme.colors.primary}
            hasHeading={hasHeading}
            rotation={arrowHeading}
          />
        </View>
      )}

      {/* Вернуть камеру машине немедленно, не дожидаясь правила возврата.
          Показывается только когда есть что возвращать — постоянная кнопка
          «я здесь» на карте, которая и так следит, читалась бы как поломка. */}
      {!follow && (
        <Pressable
          onPress={handleRecenter}
          accessibilityRole="button"
          accessibilityLabel="Вернуть карту к машине"
          hitSlop={8}
          style={({ pressed }) => [
            styles.fitButton,
            styles.recenterButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="locate" size={20} color={theme.colors.textPrimary} />
        </Pressable>
      )}

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

      {/* Выбор варианта пути (MOB-024). Показывается, только когда пути
          расходятся ощутимо: `hasRealChoice` отсеивает объезд одного двора,
          ради которого отвлекать водителя за рулём не стоит. Варианты берём
          из `route.variants`, а не из последнего ответа: после выбора роутер
          отдаёт один путь, и список бы схлопнулся ровно тогда, когда им
          пользуются. `route.hidden` держит кнопку на экране и без вариантов —
          иначе вернуть скрытую линию было бы нечем. */}
      {(hasRealChoice(route.variants) || route.chosen || route.hidden) && (
        <RouteChoiceBar
          variants={route.variants}
          chosenIndex={route.chosenIndex}
          hidden={route.hidden}
          onChoose={route.choose}
          onHide={() => route.setHidden(true)}
          bottomInset={bottomInset}
        />
      )}
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
 * УГОЛ ЗАДАЁТСЯ ДВУМЯ РАЗНЫМИ СПОСОБАМИ, И ЭТО НЕ ДУБЛИРОВАНИЕ. Меткой на
 * карте шеврон поворачивает нативный проп `rotation` — по причине, описанной
 * в `@/lib/map-orientation` (разметку Android держит растром и о повороте не
 * узнаёт). Неподвижной стрелке в центре кадра карта не помогает ничем: она не
 * метка, поэтому угол ей передаётся пропом и применяется трансформом. В
 * режиме «по курсу» он равен нулю — камера уже довёрнута под машину.
 */
function DriverArrow({
  color,
  hasHeading,
  rotation = 0,
}: {
  color: string;
  hasHeading: boolean;
  /** Угол на экране, градусы. 0 — шеврон смотрит вверх. */
  rotation?: number;
}) {
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
    <View style={[styles.arrow, { transform: [{ rotate: `${rotation}deg` }] }]}>
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
  // Машина в режиме слежения. Растягиваем на весь кадр и центрируем
  // содержимое — так стрелка стоит ровно там, куда смотрит камера, и не
  // зависит ни от высоты экрана, ни от шторки.
  followArrow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Под кнопкой общего плана: обе управляют камерой, и держать их рядом
  // понятнее, чем разносить по углам.
  recenterButton: {
    top: 60,
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
