/**
 * @file: src/components/map/night-map-style.ts
 * @description:
 *   Ночной стиль Google Maps — карта в тёмной теме приложения.
 *
 *   ЗАЧЕМ. Дневная карта ночью становится самым ярким предметом в салоне и
 *   бьёт по глазам на трассе. Стиль подобран под палитру приложения: фон
 *   близок к `background` тёмной темы, дороги чуть светлее фона, подписи
 *   приглушены до читаемого минимума.
 *
 *   ОГРАНИЧЕНИЕ ПЛАТФОРМЫ: `customMapStyle` работает только с провайдером
 *   Google. На Android он используется по умолчанию; на iOS без явного
 *   `PROVIDER_GOOGLE` стиль будет молча проигнорирован.
 *
 * @dependencies: нет
 * @created: 2026-09-01 (v1.5.17)
 */

/** Формат — тот же, что у Google Maps Styling Wizard. */
export const NIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f1726' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8f9bb0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#26324a' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#aab4c5' }],
  },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7789' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#13251c' }] },
  // Дороги светлее фона — по ним водитель и читает карту боковым зрением.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1d2739' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b1220' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8b93a1' }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2b3852' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#111a2b' }],
  },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1a2436' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08111e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d4a60' }] },
];
