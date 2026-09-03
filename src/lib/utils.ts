/**
 * @file: src/lib/utils.ts
 * @description:
 *   Чистые утилиты без зависимостей от react-native: форматирование (валюта,
 *   расстояние, время), нормализация и маска телефона, разбор адресных строк
 *   и шаг селектора времени подачи.
 *
 *   Модуль намеренно свободен от импортов RN — его функции переиспользуются
 *   на экране входа, в модалке принятия заказа и на экране текущего заказа,
 *   и проверяются без нативного окружения.
 * @dependencies: нет
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-28 (v1.5.12)
 */

/**
 * Форматировать сумму в рублях: «150 ₽»
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${Math.round(amount)} ₽`;
}

/**
 * Форматировать расстояние в км: «2.3 км» или «450 м»
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

/**
 * Форматировать длительность в минутах: «5 мин» или «1 ч 20 мин»
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} ч ${rest} мин` : `${h} ч`;
}

/**
 * Форматировать время из ISO-строки: «14:35»
 */
export function formatTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматировать дату из ISO-строки: «12 мар 2026»
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Время подачи предзаказа: «Сегодня 18:30», «Завтра 09:00», «12 мар, 09:00».
 *
 * Водителю важно не столько число, сколько «сегодня это или нет» — от
 * этого зависит, планировать ли смену вокруг заказа. Голая дата такого
 * ответа не даёт, поэтому ближайшие двое суток называются словами.
 *
 * @param now подставляется в тестах; по умолчанию — текущий момент
 */
export function formatScheduledAt(
  isoDate: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';

  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  // Сравниваем календарные дни, а не разницу в часах: заказ в 00:30 —
  // это «завтра», даже если до него сорок минут.
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);

  if (days === 0) return `Сегодня ${time}`;
  if (days === 1) return `Завтра ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Маскировать телефон: «+7 900 *** ** 44»
 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  const visible = phone.slice(0, 5);
  const last2 = phone.slice(-2);
  return `${visible} *** ** ${last2}`;
}

/**
 * Форматировать секунды в «MM:SS»
 */
export function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  Телефон                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Оставить только цифры номера, без кода страны.
 *
 * Ведущая «7» или «8» снимается ВСЕГДА, ровно одна. Это не эвристика по длине,
 * а следствие того, что функция работает в паре с `formatPhoneInput`: та
 * рисует префикс «+7», и её вывод возвращается сюда на следующем нажатии
 * клавиши. Если снимать семёрку только у длинных строк, префикс на каждом
 * шаге дочитывается как цифра номера и значение лавинообразно портится —
 * ввод «8923018» превращался в «+7 777 793 19 96» (проверено на эмуляторе).
 * При безусловном снятии функция идемпотентна: f(f(x)) === f(x).
 *
 * Ограничение осознанное: десятизначный номер, начинающийся с 7 или 8, ввести
 * нельзя. Для российских мобильных это не ограничение вовсе — они начинаются
 * с девятки, а «8» в начале это код выхода на межгород.
 */
function localDigits(input: string): string {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
  return d.slice(0, 10);
}

/**
 * Привести номер к формату хранения: «+79230189196».
 *
 * ВАЖНО: бэкенд ищет пользователя ТОЧНЫМ совпадением строки
 * (`db.user.findUnique({ where: { phone } })`, src/app/api/v1/auth/login),
 * без какой-либо нормализации на своей стороне. Поэтому привести номер к
 * единому виду обязан клиент — иначе водитель с верным паролем получает
 * «Неверный номер телефона или пароль».
 *
 * Логика повторяет `normalizePhone` из админки (src/lib/utils.ts там же),
 * чтобы формат по обе стороны был один.
 */
export function normalizePhone(input: string): string {
  const d = String(input ?? '').replace(/\D/g, '');

  if (d.length === 11 && d.startsWith('8')) return `+7${d.slice(1)}`;
  if (d.length === 11 && d.startsWith('7')) return `+${d}`;
  if (d.length === 10) return `+7${d}`;

  return `+${d}`;
}

/**
 * Маска ввода: что видит водитель, пока набирает. «+7 923 018 91 96».
 *
 * Принимает любой мусор (вставка из контактов со скобками и дефисами,
 * набор через «8») и отдаёт единый вид. Пустой ввод остаётся пустым, чтобы
 * placeholder не перекрывался префиксом «+7».
 */
export function formatPhoneInput(input: string): string {
  const d = localDigits(input);
  if (!d) return '';

  const groups = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  return `+7 ${groups.filter(Boolean).join(' ')}`.trimEnd();
}

/** Введены ли все десять цифр номера. */
export function isPhoneComplete(input: string): boolean {
  return localDigits(input).length === 10;
}

/* -------------------------------------------------------------------------- */
/*  Адреса                                                                     */
/* -------------------------------------------------------------------------- */

export interface AddressWithEntrance {
  /** Адрес без хвоста «подъезд N». */
  address: string;
  /** Номер подъезда или null. */
  entrance: string | null;
}

/**
 * Развести адрес и подъезд, если подъезд продублирован внутри адресной строки.
 *
 * ЗАЧЕМ: диспетчер выбирает подсказку, где подъезд уже входит в строку
 * («Бортникова, д. 48 подъезд 1»), и одновременно заполняется отдельное поле
 * `pickupEntrance`. Приложение честно рисовало оба, и водитель видел подъезд
 * дважды подряд.
 *
 * Вырезаем только тот подъезд, что совпадает с переданным номером: если в
 * адресе указан другой — это не дубль, и трогать строку нельзя. Ничего не
 * совпало — адрес возвращается как есть.
 */
export function splitAddressEntrance(
  address: string | null | undefined,
  entrance: string | null | undefined,
): AddressWithEntrance {
  const addr = String(address ?? '').trim();
  const ent = String(entrance ?? '').trim();

  if (!addr) return { address: '', entrance: ent || null };
  if (!ent) return { address: addr, entrance: null };

  const escaped = ent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Формы записи: «подъезд 1», «подъезда 1», «под. 1», «пд 1», «п1», «п № 1».
  // Слева обязателен разделитель — иначе «п» поймается внутри слова.
  const pattern = new RegExp(
    `(^|[\\s,])(?:подъезда|подъезд|под|пд|п)\\.?\\s*№?\\s*${escaped}(?!\\d)`,
    'gi',
  );

  const cleaned = addr
    .replace(pattern, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/[\s,]+$/, '')
    .trim();

  return { address: cleaned || addr, entrance: ent };
}

/**
 * Снять общий префикс города у набора адресов одного заказа.
 *
 * ЗАЧЕМ: на экране принятия ширина 320 px, а название города повторяется в
 * каждой строке и съедает её треть — при том что для водителя оно не несёт
 * информации, город и так его собственный.
 *
 * Город определяется не из настроек, а из самих данных: если первый сегмент
 * (до запятой) одинаков у ВСЕХ адресов заказа — он избыточен и снимается.
 * Как только адреса в разных городах, префикс сохраняется у обоих — это уже
 * сигнал «выезд за город», и прятать его нельзя. Такой способ не требует ни
 * запроса базового города с сервера, ни новой настройки.
 */
export function stripSharedCityPrefix(
  addresses: (string | null | undefined)[],
): string[] {
  const list = addresses.map((a) => String(a ?? '').trim());
  const filled = list.filter(Boolean);
  if (filled.length < 2) return list;

  const head = (s: string) => (s.split(',')[0] ?? '').trim().toLowerCase();
  const city = head(filled[0] as string);
  if (!city) return list;
  if (!filled.every((a) => head(a) === city)) return list;

  return list.map((a) => {
    if (!a) return a;
    const comma = a.indexOf(',');
    if (comma < 0) return a;
    // Если кроме города в адресе ничего нет — оставляем как было.
    return a.slice(comma + 1).trim() || a;
  });
}

/* -------------------------------------------------------------------------- */
/*  Время подачи                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Шаг изменения времени подачи, соразмерный самому значению.
 *
 * ЗАЧЕМ: шаг был фиксированный в 1 минуту при диапазоне до 1440. Чтобы дойти
 * от 5 минут до часа, требовалось 55 нажатий, а при оценке в сотни минут
 * кнопки становились бесполезны вовсе.
 */
export function pickupEtaStep(value: number): number {
  if (!Number.isFinite(value) || value < 30) return 1;
  if (value < 120) return 5;
  return 15;
}

/**
 * Пресеты под рекомендацию сервера.
 *
 * Считаются от РЕКОМЕНДАЦИИ, а не от текущего значения: иначе набор кнопок
 * прыгал бы под пальцем, пока водитель крутит стрелки.
 */
export function pickupEtaPresets(recommended: number): number[] {
  if (!Number.isFinite(recommended) || recommended <= 20) return [3, 5, 7, 10, 15];
  if (recommended <= 45) return [10, 15, 20, 30, 45];
  if (recommended <= 90) return [20, 30, 45, 60, 90];
  return [30, 45, 60, 90, 120];
}

/* -------------------------------------------------------------------------- */
/*  Адрес: сокращения типов улиц                                               */
/* -------------------------------------------------------------------------- */

/**
 * Тип улицы целиком → общепринятое сокращение.
 *
 * Ключи в нижнем регистре: сверка идёт по приведённому токену.
 */
const STREET_TYPE_SHORT: Record<string, string> = {
  улица: 'ул.',
  проспект: 'пр-т',
  переулок: 'пер.',
  бульвар: 'б-р',
  набережная: 'наб.',
  шоссе: 'ш.',
  площадь: 'пл.',
  микрорайон: 'мкр.',
  тупик: 'туп.',
  проезд: 'пр-д',
};

/**
 * Сократить тип улицы в адресе: «проспект Красноярский рабочий» →
 * «пр-т Красноярский рабочий».
 *
 * ЗАЧЕМ. Заголовок в шторке — две строки крупным шрифтом, и на 360 точках
 * длинный адрес в них не помещается: «проспект» съедает почти всю первую
 * строку, а водителю нужен не тип улицы, а её название и дом.
 *
 * ПОТОКЕННО, А НЕ РЕГУЛЯРКОЙ. Граница слова `\b` в JS считается по ASCII,
 * кириллица в неё не входит — на этом уже обжигались в `order-city.ts`.
 * Разбор по пробелам от этой ловушки свободен вовсе.
 *
 * Только для ПОКАЗА: навигатор ходит по координатам, а диспетчеру и в базе
 * адрес нужен полным.
 */
export function shortenStreetType(address: string): string {
  return address
    .split(',')
    .map((segment) => {
      const trimmed = segment.trimStart();
      const indent = segment.slice(0, segment.length - trimmed.length);
      const tokens = trimmed.split(' ');

      /**
       * СЛОВО-ТИП СОКРАЩАЕТСЯ, ТОЛЬКО ЕСЛИ ЗА НИМ ИДЁТ НАЗВАНИЕ.
       *
       * «Набережная» бывает и типом («набережная Обводного канала»), и
       * собственным именем улицы («Набережная, д. 76»). Первая версия
       * сокращала вслепую и съедала название целиком: адрес превращался в
       * «наб., д. 76», где от улицы не осталось ничего. То же ждало бы
       * Проезд, Площадь, Бульвар, Линию, Аллею — все они бывают именами.
       *
       * Признак имени простой: после слова в этом же сегменте больше ничего
       * нет. Признак типа — за ним идёт слово с буквами. Цифра не годится:
       * «Набережная 76» — это дом, а не название.
       */
      const next = tokens[1];
      if (!next || !/[А-Яа-яЁёA-Za-z]/.test(next)) return segment;

      const short = STREET_TYPE_SHORT[tokens[0]!.toLowerCase()];
      if (!short) return segment;

      return indent + [short, ...tokens.slice(1)].join(' ');
    })
    .join(',');
}

/**
 * Годится ли текст «Что нового» для показа водителю.
 *
 * Страховка на стороне приложения. Чистка живёт на сервере
 * (`driverChangelogFromBody`, v1.99.78), но в базе остались релизы, куда
 * автотекст GitHub уже записан: «**Full Changelog**: https://github.com/…».
 * Показывать водителю ссылку вместо описания — хуже, чем не показывать
 * ничего, поэтому такой текст здесь просто не выводится.
 */
export function usableChangelog(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  // Осталось ли что-то, кроме ссылок и разметки.
  const words = value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>\-\s:]/g, '');
  if (!words) return null;
  if (/^\**full\s+changelog\**\s*:/i.test(value)) return null;
  return value;
}

/**
 * Текст ошибки, который не стыдно показать водителю.
 *
 * Клиент API вытаскивает человеческое сообщение из тела ответа
 * (`{ error: '...' }`), но не всякая ошибка приходит с телом: маршрута нет
 * на сервере — Next.js отвечает HTML, и до экрана долетает «Request failed
 * with status code 404: POST https://…/release». Водителю такое показывать
 * нельзя: он видит ссылку и решает, что приложение сломалось.
 *
 * Технические подробности при этом не теряются — они уходят в лог админки
 * там же, где вызывается эта функция.
 */
export function humanApiError(message: string, fallback: string): string {
  const technical =
    /https?:\/\//.test(message) ||
    /status code \d{3}/i.test(message) ||
    /^\s*(Request failed|Network Error|Failed to fetch)/i.test(message);
  return technical ? fallback : message;
}

/**
 * Что сказать водителю, когда сервер ответил ошибкой без объяснения.
 *
 * ЗАЧЕМ. Обычно сервер присылает человеческий текст в теле (`{ error }`), и
 * его показывают как есть. Но не всегда: у несуществующего маршрута тела
 * нет вовсе — Next.js отвечает HTML, и до экрана долетало «Request failed
 * with status code 404: POST https://…/release». Водитель видел адрес и код
 * ответа вместо причины.
 *
 * Каждая строка отвечает на вопрос «что мне теперь делать», а не «что
 * произошло в протоколе»: код ответа водителю не поможет, а диспетчер и
 * админский лог его и так получат.
 */
export function apiErrorForStatus(status: number): string {
  if (status === 404) {
    return 'Сервер пока не умеет это делать — нужно обновление сервера. Сообщите диспетчеру.';
  }
  if (status === 401 || status === 403) {
    return 'Доступ закрыт. Войдите в приложение заново.';
  }
  if (status === 408 || status === 504) {
    return 'Сервер не ответил вовремя. Проверьте связь и попробуйте ещё раз.';
  }
  if (status === 429) {
    return 'Слишком часто. Подождите немного и повторите.';
  }
  if (status >= 500) {
    return 'Сервер не справился с запросом. Попробуйте ещё раз через минуту.';
  }
  return 'Запрос не прошёл. Попробуйте ещё раз.';
}
