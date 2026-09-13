/**
 * @file: src/types/address.ts
 * @description:
 *   Подсказки адресов для смены адреса в поездке
 *   (`GET /api/v1/driver/address-suggest`, сервер v1.100.15).
 *
 *   Строки для показа (`title`, `subtitle`) и подъезд для поля считает
 *   СЕРВЕР — теми же функциями, что рисуют список в пульте. Приложение их
 *   только показывает: две копии разбора адреса разошлись бы.
 * @dependencies: нет
 * @created: 2026-09-13 (1.5.61)
 */

export interface AddressSuggestion {
  name: string;
  address: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  /** `local` — адресная книга службы, иначе внешний поиск. */
  source: string | null;
  /** Крупная строка: улица, дом, подъезд или название организации. */
  title: string;
  /** Улица и дом организации — у адреса пусто. */
  secondary: string | null;
  /** Серая строка: населённый пункт и регион. */
  subtitle: string | null;
  /** Подъезд, который подставится в поле. Пустая строка — не найден. */
  entrance: string;
}

export interface AddressSuggestPage {
  items: AddressSuggestion[];
  /** Поиск сейчас не работает — не то же самое, что «ничего не нашлось». */
  searchUnavailable: boolean;
}
