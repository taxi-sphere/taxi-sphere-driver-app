/**
 * @file: src/components/map/day-map-style.ts
 * @description:
 *   Дневной стиль Google Maps — карта в светлой теме приложения.
 *
 *   ЗАЧЕМ ОН ВООБЩЕ НУЖЕН. Казалось бы, светлая карта — это карта без
 *   стиля, и в 1.5.38 в `customMapStyle` уходил пустой массив именно с этим
 *   расчётом. Оказалось, что пустой массив означает «своего стиля нет», а
 *   без своего стиля Google Maps SDK 19 (`play-services-maps:19.1.0`) сам
 *   красит карту по системной теме телефона — у него по умолчанию
 *   `MapColorScheme.FOLLOW_SYSTEM`. У водителя телефон в тёмной теме, а
 *   приложение — в светлой, и карта оставалась тёмной внутри белого
 *   интерфейса. Свой стиль эту автоматику отключает, потому светлая тема
 *   тоже обязана его иметь.
 *
 *   `react-native-maps` 1.26 прокинуть `mapColorScheme` не умеет, так что
 *   стиль — единственный способ, не требующий патча нативного модуля.
 *
 *   КАК ПОДБИРАЛСЯ. Дороги белые, всё остальное — оттенки того же холодного
 *   серого, что и `mapPlaceholder` в светлой палитре. Магистрали отличаются
 *   только чуть более тёмной обводкой: цветовые акценты на карте оставлены
 *   линии маршрута и меткам, спорить с ними дорогам незачем.
 *
 *   ОГРАНИЧЕНИЕ ПЛАТФОРМЫ то же, что у ночного стиля: работает только с
 *   провайдером Google.
 *
 * @dependencies: нет
 * @created: 2026-09-07 (1.5.39)
 */

/** Формат — тот же, что у Google Maps Styling Wizard. */
export const DAY_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#eef0f3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b6472' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d5dae1' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#464e5c' }],
  },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e5e8ec' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#828b99' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcebd9' }] },
  // Дороги — единственное белое на карте: по ним водитель её и читает.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e2e6ec' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#cfd6df' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e3e6ea' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe0f0' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#88a2bd' }] },
];
