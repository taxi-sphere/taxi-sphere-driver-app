/**
 * @file: src/lib/arrow-tracker.ts
 * @description:
 *   Стрелка водителя «с памятью»: где нарисовать машину и куда она смотрит.
 *
 *   ЗАЧЕМ (жалоба владельца 13.09.2026). Водитель едет прямо, а карта резко
 *   переворачивается назад; стрелка перескакивает на соседнюю дорогу и сразу
 *   возвращается. До этой версии каждый фикс решался С ЧИСТОГО ЛИСТА: точка от
 *   приёмника шла на карту как есть, а притягивание искало ближайший кусок во
 *   ВСЁМ маршруте, не помня, где машина была секунду назад.
 *
 *   ЧТО ПОКАЗАЛ КОНТРОЛЬНЫЙ ОПЫТ (модель городского GPS, по 300 поездок на
 *   сценарий, те же функции, что в 1.5.61):
 *   • одна точка «по вышкам» в 70 м — стрелка на секунду на соседней улице в
 *     100% поездок: карта не отсеивала неточные фиксы. На проде таких фиксов
 *     35% (2 водителя, 7 суток, 9063 точки), а карта диспетчера их отсеивает
 *     с v1.99.73;
 *   • маршрут вокруг квартала — стрелка перескакивает на другой кусок
 *     маршрута в 61% поездок;
 *   • подача позади, маршрут туда и обратно по одной улице — в первые секунды
 *     после открытия карты стрелка разворачивается назад в 38%;
 *   • а «одна плохая точка разворачивает курс» НЕ подтвердилось: три
 *     устаревших фикса подряд — ноль разворотов, это уже гасили база 15 м и
 *     предел поворота из 1.5.51.
 *
 *   ЧЕТЫРЕ ПРАВИЛА, КАЖДОЕ ПРОТИВ СВОЕЙ ПРИЧИНЫ.
 *   1. Отсев фиксов (`judgeFix`): хуже 50 м, не новее прошлого, дальше, чем
 *      машина могла проехать. Отсеянный фикс карту не двигает — стрелка едет
 *      по маршруту своей скоростью, но не дольше `MAX_COAST_MS`.
 *   2. Притягивание с памятью: машину ищем рядом с тем местом на маршруте, где
 *      она была, и только на куске, который идёт в её сторону. Уйти на другой
 *      кусок маршрута или сойти с него — только если `CONFIRM_FIXES` фиксов
 *      подряд согласны.
 *   3. Первый захват — самый ранний по ходу из почти самых близких кусков:
 *      маршрут строится ОТ водителя, значит водитель в его начале, а не на
 *      обратной ноге разворота.
 *   4. Курс: поворот движения больше `TURN_CONFIRM_DEG` принимается, только
 *      когда его подтвердил следующий замер, а стрелка поворачивается не
 *      больше чем на 45° за фикс — камера не переворачивается за один кадр.
 *
 *   ЖУРНАЛ. Если стрелка на ходу развернулась больше чем на `REVERSAL_DEG`,
 *   шаг возвращает `reversal` с последними фиксами — карта пишет его в журнал
 *   приложения. Так видны настоящие случаи, а не только модель.
 *
 *   ЧИСТЫЕ ФУНКЦИИ. Состояние — обычный объект, шаг возвращает новый. Модуль
 *   проверяется тестами и прогоном модели без эмулятора, а карта
 *   (`OrderMap`) лишь держит состояние в ref.
 *
 * @dependencies: @/lib/heading, @/lib/route-snap
 * @created: 2026-09-13 (1.5.62)
 */

import {
  angleDelta,
  bearingDegrees,
  distanceMeters,
  headingAlong,
  isSnapBearingSane,
  limitTurn,
  MIN_SPAN_M,
  MIN_SPEED_MPS,
  type HeadingPoint,
} from '@/lib/heading';
import {
  bearingAhead,
  pointAlong,
  routeCandidates,
  type RouteCandidate,
  type RouteSnap,
} from '@/lib/route-snap';

/* ─── Пороги ─────────────────────────────────────────────────────────────── */

/**
 * Фикс хуже этого радиуса карту не двигает, метры.
 *
 * Тот же порог, что у карты диспетчера (`scripts/gps-quality.js`,
 * `ACCURACY_LIMIT_M`, сервер v1.99.73), и по той же причине: спутниковый фикс
 * в застройке — 20–35 м, положение по вышкам — от полусотни до сотен.
 */
export const MAX_FIX_ACCURACY_M = 50;

/** Быстрее этого машина от прошлого фикса не перемещается, м/с (≈250 км/ч). */
export const MAX_PLAUSIBLE_SPEED_MPS = 70;

/**
 * Сколько фиксов подряд должны согласиться, чтобы стрелка ушла с того места
 * маршрута, где она была: на другой кусок маршрута или с маршрута вовсе.
 *
 * Три — это три секунды на такте карты. Одиночный выброс так не проходит, а
 * настоящий съезд виден почти сразу.
 */
export const CONFIRM_FIXES = 3;

/** Насколько НАЗАД по маршруту от прошлого места ищем машину, метры. */
export const WINDOW_BACK_M = 30;

/** Насколько ВПЕРЁД от ожидаемого места ищем машину, метры. */
export const WINDOW_AHEAD_M = 60;

/**
 * Кусок «против хода» всё же принимается, если он ВПЕРЕДИ по маршруту и
 * там, где машина и должна быть по скорости. Так проходится разворот,
 * заложенный в сам маршрут: машина едет по его геометрии, а курс
 * собственного движения догоняет с опозданием в несколько секунд.
 */
export const PREDICTION_TOLERANCE_M = 25;

/**
 * Кусок в пределах этого расстояния от прошлого места принимается при любом
 * курсе движения, метры. В пробке курс гуляет от шума, и без этого стрелка
 * отбрасывала бы свою же дорогу как «встречную» и сходила с маршрута.
 */
export const IN_PLACE_M = 15;

/** Кусок маршрута, расходящийся с движением больше этого, считается встречным. */
export const MAX_DIRECTION_MISMATCH_DEG = 100;

/**
 * Насколько дальше самого близкого может лежать кусок, который выбирается
 * при захвате за то, что он РАНЬШЕ по маршруту, метры.
 *
 * Пятнадцать — больше разницы между полосами одной улицы (обратная нога
 * разворота бывает в 6–10 м и оказывается ближе из-за шума), но меньше
 * расстояния до соседней улицы.
 */
export const ACQUIRE_TOLERANCE_M = 15;

/** Поворот движения больше этого ждёт подтверждения следующим замером. */
export const TURN_CONFIRM_DEG = 45;

/**
 * Сколько стрелка едет по маршруту сама, без подтверждённого фикса.
 *
 * Пять секунд перекрывают пачку отсеянных фиксов между домами; дольше
 * догадка о том, где машина, становится враньём.
 */
export const MAX_COAST_MS = 5_000;

/** Разворот стрелки на ходу, который попадает в журнал, градусы. */
export const REVERSAL_DEG = 120;

/** За какое время разворот считается резким. */
export const REVERSAL_WINDOW_MS = 5_000;

/** Не чаще раза в минуту: журнал не должен превратиться в трафик. */
export const JOURNAL_COOLDOWN_MS = 60_000;

/** Сколько последних фиксов уходит в журнал вместе с разворотом. */
export const JOURNAL_FIXES = 20;

/* ─── Типы ──────────────────────────────────────────────────────────────── */

/** Фикс приёмника — ровно то, что нужно стрелке. */
export interface TrackerFix {
  latitude: number;
  longitude: number;
  /** Радиус погрешности, метры; `null` — приёмник не сообщил. */
  accuracy: number | null;
  /** Скорость, м/с; `null` или отрицательная — неизвестна. */
  speed: number | null;
  /** Время СЪЁМКИ фикса, мс (`loc.timestamp`), а не время получения. */
  timestamp: number;
}

/** Что решено про фикс. */
export type FixVerdict = 'accepted' | 'stale' | 'inaccurate' | 'jump';

/** Откуда взят курс стрелки. */
export type HeadingSource = 'route' | 'movement' | 'route-start';

/** Что рисовать на карте. */
export interface TrackerOutput {
  point: HeadingPoint;
  /** Курс, градусы от севера; `null` — направление неизвестно, рисуется точка. */
  heading: number | null;
  /** Место на маршруте для `routeAhead`; `null` — машина не на маршруте. */
  snap: Pick<RouteSnap, 'point' | 'index'> | null;
  /** Маршрут, к которому относится `snap`. */
  route: readonly HeadingPoint[] | null;
  source: HeadingSource | null;
}

/** Фикс в журнале разворота. Округлён: метр и десятая — больше не нужно. */
export interface JournalFix {
  at: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  verdict: FixVerdict;
  heading: number | null;
}

/** Резкий разворот стрелки на ходу. */
export interface ArrowReversal {
  at: number;
  from: number;
  to: number;
  source: HeadingSource | null;
  onRoute: boolean;
  fixes: JournalFix[];
}

interface HeadingMark {
  at: number;
  heading: number;
  moving: boolean;
}

export interface TrackerState {
  /** Последний ПРИНЯТЫЙ фикс. */
  lastFix: TrackerFix | null;
  /** Сколько фиксов подряд отсеяно как скачок. */
  jumpRejects: number;
  /** Точка, от которой считается следующий замер направления. */
  anchor: HeadingPoint | null;
  /** Подтверждённое направление собственного движения. */
  movement: number | null;
  /** Большой поворот, ждущий подтверждения. */
  pendingTurn: number | null;
  /** Скорость, м/с: из приёмника, а без неё — по пройденному. */
  speedMps: number | null;
  /** Маршрут, к которому относится `progressM`. */
  route: readonly HeadingPoint[] | null;
  /** Где машина на маршруте, метры от начала; `null` — не на маршруте. */
  progressM: number | null;
  /** Когда `progressM` подтверждён фиксом. */
  progressAt: number | null;
  /** Фиксов подряд, не нашедших машину рядом с прошлым местом. */
  missStreak: number;
  /** Другой кусок маршрута, куда фиксы зовут стрелку, и сколько раз подряд. */
  jumpCandidate: { alongM: number; count: number } | null;
  output: TrackerOutput | null;
  recent: JournalFix[];
  marks: HeadingMark[];
  lastJournalAt: number | null;
}

export interface TrackerStep {
  state: TrackerState;
  verdict: FixVerdict;
  reversal: ArrowReversal | null;
}

type RouteMemory = Pick<
  TrackerState,
  'route' | 'progressM' | 'progressAt' | 'missStreak' | 'jumpCandidate'
>;

interface RoutePlace {
  memory: RouteMemory;
  /** Где рисовать машину на маршруте; `null` — не на маршруте. */
  alongM: number | null;
  /**
   * Место найдено продолжением движения ПО маршруту, хотя кусок спорит с
   * курсом движения. Тогда курс берётся с маршрута: машина проходит его
   * собственный разворот, а движение отстаёт.
   */
  trustRoute: boolean;
}

/* ─── Состояние ─────────────────────────────────────────────────────────── */

export function createTracker(): TrackerState {
  return {
    lastFix: null,
    jumpRejects: 0,
    anchor: null,
    movement: null,
    pendingTurn: null,
    speedMps: null,
    route: null,
    progressM: null,
    progressAt: null,
    missStreak: 0,
    jumpCandidate: null,
    output: null,
    recent: [],
    marks: [],
    lastJournalAt: null,
  };
}

/* ─── 1. Отсев фиксов ───────────────────────────────────────────────────── */

function isPoor(fix: TrackerFix): boolean {
  return fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > MAX_FIX_ACCURACY_M;
}

/**
 * Годится ли фикс, чтобы двигать по нему стрелку.
 *
 * ПЕРВЫЙ ФИКС ПРИНИМАЕТСЯ ЛЮБЫМ: неточная точка лучше пустой карты, а
 * сравнивать её пока не с чем. После неточного фикса не проверяется и скачок
 * — иначе первый же хороший фикс, честно далёкий от плохого, отсеялся бы.
 *
 * СКАЧОК НЕ ЗАЛИПАЕТ. Если отсеять пришлось `CONFIRM_FIXES - 1` фиксов
 * подряд, следующий принимается: значит, ложным был прошлый, а не они.
 */
export function judgeFix(
  last: TrackerFix | null,
  fix: TrackerFix,
  jumpRejects = 0,
): FixVerdict {
  if (!last) return 'accepted';
  if (!(fix.timestamp > last.timestamp)) return 'stale';
  if (isPoor(fix)) return 'inaccurate';

  if (!isPoor(last) && jumpRejects < CONFIRM_FIXES - 1) {
    const seconds = (fix.timestamp - last.timestamp) / 1000;
    if (distanceMeters(last, fix) / seconds > MAX_PLAUSIBLE_SPEED_MPS) return 'jump';
  }

  return 'accepted';
}

/* ─── Движение ──────────────────────────────────────────────────────────── */

function toPoint(fix: TrackerFix): HeadingPoint {
  return { latitude: fix.latitude, longitude: fix.longitude };
}

function reportedSpeed(fix: TrackerFix): number | null {
  return fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null;
}

/** Неизвестная скорость — «едет»: решает расстояние, как до 1.5.51. */
function isMoving(speed: number | null): boolean {
  return speed == null || speed >= MIN_SPEED_MPS;
}

function nextSpeed(state: TrackerState, fix: TrackerFix): number | null {
  const reported = reportedSpeed(fix);
  if (reported != null) return reported;

  const last = state.lastFix;
  if (!last) return state.speedMps;
  const seconds = (fix.timestamp - last.timestamp) / 1000;
  // Через длинную паузу пройденное — не скорость, а разрыв съёмки.
  if (seconds <= 0 || seconds > 5) return state.speedMps;
  return distanceMeters(last, fix) / seconds;
}

/**
 * Направление собственного движения.
 *
 * Замер — угол между точками, разнесёнными хотя бы на `MIN_SPAN_M` (почему не
 * ближе — в `@/lib/heading`). Малый поворот принимается сразу; большой —
 * только если следующий замер его подтвердил. Одиночный выброс даёт один
 * «разворот», которого второй замер уже не повторит.
 */
function nextMovement(
  state: TrackerState,
  fix: TrackerFix,
): Pick<TrackerState, 'anchor' | 'movement' | 'pendingTurn'> {
  const here = toPoint(fix);
  const { anchor, movement, pendingTurn } = state;

  // Стоящая машина смотрит туда же, куда ехала; отсчёт начинается заново,
  // иначе блуждание приёмника на светофоре сошло бы за поездку.
  if (!anchor || !isMoving(reportedSpeed(fix))) return { anchor: here, movement, pendingTurn };
  if (distanceMeters(anchor, here) < MIN_SPAN_M) return { anchor, movement, pendingTurn };

  const measured = bearingDegrees(anchor, here);
  const confirmsPending =
    pendingTurn != null && Math.abs(angleDelta(pendingTurn, measured)) <= TURN_CONFIRM_DEG;

  if (
    movement == null ||
    Math.abs(angleDelta(movement, measured)) <= TURN_CONFIRM_DEG ||
    confirmsPending
  ) {
    return { anchor: here, movement: measured, pendingTurn: null };
  }
  return { anchor: here, movement, pendingTurn: measured };
}

/* ─── 2–3. Место на маршруте ────────────────────────────────────────────── */

/**
 * Оставить по одному кандидату на каждый проход маршрута мимо точки.
 *
 * Соседние отрезки дают почти одинаковых кандидатов: проекция на прошлый
 * отрезок зажата в его конце и лежит чуть дальше настоящей. Без этого отбора
 * «самый ранний из близких» выбирал бы вершину позади машины.
 */
function localMinima(candidates: RouteCandidate[]): RouteCandidate[] {
  return candidates.filter((candidate, k) => {
    const prev = candidates[k - 1];
    const next = candidates[k + 1];
    const beatsPrev =
      !prev || prev.index !== candidate.index - 1 || prev.distanceM >= candidate.distanceM;
    const beatsNext =
      !next || next.index !== candidate.index + 1 || next.distanceM > candidate.distanceM;
    return beatsPrev && beatsNext;
  });
}

function agreesWith(candidate: RouteCandidate, movement: number | null): boolean {
  if (movement == null || candidate.bearing == null) return true;
  return Math.abs(angleDelta(movement, candidate.bearing)) <= MAX_DIRECTION_MISMATCH_DEG;
}

/** Захват без памяти: самый ранний по ходу из почти самых близких кусков в свою сторону. */
function acquire(minima: RouteCandidate[], movement: number | null): RouteCandidate | null {
  let nearest = Infinity;
  for (const candidate of minima) {
    if (agreesWith(candidate, movement)) nearest = Math.min(nearest, candidate.distanceM);
  }

  let best: RouteCandidate | null = null;
  for (const candidate of minima) {
    if (!agreesWith(candidate, movement)) continue;
    if (candidate.distanceM > nearest + ACQUIRE_TOLERANCE_M) continue;
    if (!best || candidate.alongM < best.alongM) best = candidate;
  }
  return best;
}

function offRoute(route: readonly HeadingPoint[] | null): RouteMemory {
  return { route, progressM: null, progressAt: null, missStreak: 0, jumpCandidate: null };
}

function placedAt(route: readonly HeadingPoint[], alongM: number, at: number): RouteMemory {
  return { route, progressM: alongM, progressAt: at, missStreak: 0, jumpCandidate: null };
}

/** Где стрелка сейчас, если едет по маршруту сама. */
function coastAlong(memory: RouteMemory, now: number, speedMps: number | null): number | null {
  if (memory.progressM == null || memory.progressAt == null) return null;
  const elapsed = Math.min(Math.max(now - memory.progressAt, 0), MAX_COAST_MS);
  return memory.progressM + (speedMps ?? 0) * (elapsed / 1000);
}

function followRoute(
  state: TrackerState,
  here: HeadingPoint,
  route: readonly HeadingPoint[],
  now: number,
  speedMps: number | null,
  movement: number | null,
): RoutePlace {
  if (route.length < 2) return { memory: offRoute(route), alongM: null, trustRoute: false };

  const minima = localMinima(routeCandidates(here, route));

  // Новый маршрут или машина не на маршруте — помнить нечего, захват заново.
  if (state.route !== route || state.progressM == null) {
    const found = acquire(minima, movement);
    if (!found) return { memory: offRoute(route), alongM: null, trustRoute: false };
    return { memory: placedAt(route, found.alongM, now), alongM: found.alongM, trustRoute: false };
  }

  const progressM = state.progressM;
  const memory: RouteMemory = {
    route,
    progressM,
    progressAt: state.progressAt,
    missStreak: state.missStreak,
    jumpCandidate: state.jumpCandidate,
  };
  const expected = coastAlong(memory, now, speedMps) ?? progressM;

  let best: RouteCandidate | null = null;
  let bestAgainstMovement = false;
  for (const candidate of minima) {
    if (candidate.alongM < progressM - WINDOW_BACK_M) continue;
    if (candidate.alongM > expected + WINDOW_AHEAD_M) continue;
    const agrees = agreesWith(candidate, movement);
    // «По графику» — только ВПЕРЁД по маршруту. Машина, которая едет по линии
    // назад, сюда не попадает: её курс даёт движение, а не дорога.
    const onSchedule =
      candidate.alongM >= progressM &&
      Math.abs(candidate.alongM - expected) <= PREDICTION_TOLERANCE_M;
    // Там же, где машина и была, кусок годится при любом курсе движения: в
    // пробке курс гуляет от шума, а место машины от этого не меняется.
    const inPlace = Math.abs(candidate.alongM - progressM) <= IN_PLACE_M;
    if (!agrees && !onSchedule && !inPlace) continue;
    if (!best || candidate.distanceM < best.distanceM) {
      best = candidate;
      bestAgainstMovement = !agrees && onSchedule;
    }
  }

  if (best) {
    // Стоящая машина назад по маршруту не ползёт: это шум приёмника.
    const standing = speedMps != null && speedMps < MIN_SPEED_MPS;
    const alongM = standing ? Math.max(best.alongM, progressM) : best.alongM;
    return { memory: placedAt(route, alongM, now), alongM, trustRoute: bestAgainstMovement };
  }

  // Рядом с прошлым местом машины нет: ждём подтверждения, а пока едем сами.
  const elsewhere = acquire(minima, movement);
  const missStreak = state.missStreak + 1;
  const previous = state.jumpCandidate;
  const jumpCandidate = elsewhere
    ? {
        alongM: elsewhere.alongM,
        count:
          previous && Math.abs(previous.alongM - elsewhere.alongM) <= WINDOW_AHEAD_M
            ? previous.count + 1
            : 1,
      }
    : null;

  if (elsewhere && jumpCandidate && jumpCandidate.count >= CONFIRM_FIXES) {
    return {
      memory: placedAt(route, elsewhere.alongM, now),
      alongM: elsewhere.alongM,
      trustRoute: false,
    };
  }
  // Фиксы разбредаются по разным кускам — это уже не выброс, а съезд.
  if ((!elsewhere && missStreak >= CONFIRM_FIXES) || missStreak >= CONFIRM_FIXES * 2) {
    return { memory: offRoute(route), alongM: null, trustRoute: false };
  }
  return {
    memory: { ...memory, missStreak, jumpCandidate },
    alongM: coastAlong(memory, now, speedMps),
    trustRoute: false,
  };
}

/* ─── 4. Что рисовать ───────────────────────────────────────────────────── */

function compose(
  previous: TrackerOutput | null,
  here: HeadingPoint | null,
  alongM: number | null,
  route: readonly HeadingPoint[] | null,
  movement: number | null,
  trustRoute = false,
): TrackerOutput | null {
  let point = here ?? previous?.point ?? null;
  let snap: TrackerOutput['snap'] = null;
  let routeHeading: number | null = null;

  if (route && alongM != null) {
    const place = pointAlong(route, alongM);
    if (place) {
      point = place.point;
      snap = place;
      routeHeading = bearingAhead(route, place.index, place.point);
    }
  }
  if (!point) return null;

  // Порядок источников — тот же, что был в карте с 1.5.51: дорога под
  // машиной, если она не спорит с движением (или машина идёт по ней вперёд
  // по графику); движение; начало маршрута.
  let candidate: number | null = null;
  let source: HeadingSource | null = null;
  if (routeHeading != null && (trustRoute || isSnapBearingSane(routeHeading, movement))) {
    candidate = routeHeading;
    source = 'route';
  } else if (movement != null) {
    candidate = movement;
    source = 'movement';
  } else if (route) {
    candidate = headingAlong(route);
    source = candidate != null ? 'route-start' : null;
  }

  if (candidate == null) {
    return {
      point,
      heading: previous?.heading ?? null,
      snap,
      route: snap ? route : null,
      source: previous?.source ?? null,
    };
  }
  return {
    point,
    heading: limitTurn(previous?.heading ?? null, candidate),
    snap,
    route: snap ? route : null,
    source,
  };
}

/* ─── Журнал ────────────────────────────────────────────────────────────── */

function round(value: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

function journal(
  state: TrackerState,
  fix: TrackerFix,
  verdict: FixVerdict,
  output: TrackerOutput | null,
  speedMps: number | null,
  onRoute: boolean,
): Pick<TrackerState, 'recent' | 'marks' | 'lastJournalAt'> & { reversal: ArrowReversal | null } {
  const heading = output?.heading ?? null;
  const recent = [
    ...state.recent,
    {
      at: fix.timestamp,
      lat: round(fix.latitude, 6),
      lng: round(fix.longitude, 6),
      accuracy: fix.accuracy == null ? null : round(fix.accuracy, 1),
      speed: fix.speed == null ? null : round(fix.speed, 1),
      verdict,
      heading: heading == null ? null : Math.round(heading),
    },
  ].slice(-JOURNAL_FIXES);

  // Устаревший фикс несёт прошлое время — на шкалу разворотов ему нельзя.
  if (verdict === 'stale' || heading == null) {
    return { recent, marks: state.marks, lastJournalAt: state.lastJournalAt, reversal: null };
  }

  const now = fix.timestamp;
  const moving = isMoving(speedMps);
  const marks = [
    ...state.marks.filter((mark) => now - mark.at <= REVERSAL_WINDOW_MS),
    { at: now, heading, moving },
  ];

  const cooled = state.lastJournalAt == null || now - state.lastJournalAt >= JOURNAL_COOLDOWN_MS;
  const turned =
    moving && cooled
      ? marks.find((mark) => mark.moving && Math.abs(angleDelta(mark.heading, heading)) > REVERSAL_DEG)
      : undefined;

  if (!turned) return { recent, marks, lastJournalAt: state.lastJournalAt, reversal: null };

  return {
    recent,
    marks: [{ at: now, heading, moving }],
    lastJournalAt: now,
    reversal: {
      at: now,
      from: Math.round(turned.heading),
      to: Math.round(heading),
      source: output?.source ?? null,
      onRoute,
      fixes: recent,
    },
  };
}

/* ─── Шаги ──────────────────────────────────────────────────────────────── */

/** Обработать новый фикс приёмника. */
export function trackFix(
  state: TrackerState,
  fix: TrackerFix,
  route: readonly HeadingPoint[],
): TrackerStep {
  const verdict = judgeFix(state.lastFix, fix, state.jumpRejects);

  if (verdict !== 'accepted') {
    // Отсеянный фикс карту не двигает: стрелка едет по маршруту сама.
    const coasting =
      verdict !== 'stale' && state.route === route && state.progressM != null
        ? compose(state.output, null, coastAlong(state, fix.timestamp, state.speedMps), route, state.movement)
        : state.output;
    const logged = journal(state, fix, verdict, coasting, state.speedMps, state.progressM != null);
    return {
      state: {
        ...state,
        jumpRejects: verdict === 'jump' ? state.jumpRejects + 1 : state.jumpRejects,
        output: coasting,
        recent: logged.recent,
        marks: logged.marks,
        lastJournalAt: logged.lastJournalAt,
      },
      verdict,
      reversal: logged.reversal,
    };
  }

  const here = toPoint(fix);
  const speedMps = nextSpeed(state, fix);
  const measured = nextMovement(state, fix);
  const place = followRoute(state, here, route, fix.timestamp, speedMps, measured.movement);
  // Фикс, не нашедший машину рядом с её местом на маршруте, ещё не
  // подтверждён: ни курс движения, ни точку отсчёта следующего замера он не
  // двигает. Иначе выброс становился бы и замером курса, и его началом.
  const motion =
    place.memory.missStreak > 0
      ? { anchor: state.anchor, movement: state.movement, pendingTurn: state.pendingTurn }
      : measured;
  const output = compose(state.output, here, place.alongM, route, motion.movement, place.trustRoute);
  const logged = journal(state, fix, verdict, output, speedMps, place.memory.progressM != null);

  return {
    state: {
      ...state,
      ...motion,
      ...place.memory,
      lastFix: fix,
      jumpRejects: 0,
      speedMps,
      output,
      recent: logged.recent,
      marks: logged.marks,
      lastJournalAt: logged.lastJournalAt,
    },
    verdict,
    reversal: logged.reversal,
  };
}

/**
 * Пришёл новый маршрут, а фикса нет.
 *
 * Линия перестраивается каждые 60–110 метров, и старое место на маршруте к
 * новой линии не относится: индекс отрезка там значит другое. Без этого шага
 * до следующего фикса линия обрезалась бы по чужому индексу.
 */
export function trackRoute(state: TrackerState, route: readonly HeadingPoint[]): TrackerState {
  if (state.route === route) return state;

  const fix = state.lastFix;
  if (!fix) return { ...state, ...offRoute(route) };

  // Последний фикс не нашёл машину рядом с её местом (стрелка едет по
  // маршруту сама) — он и есть неподтверждённый выброс. Место на новой линии
  // ищется от стрелки: иначе она на кадр вставала бы в точку выброса.
  const here =
    state.missStreak > 0 && state.output?.snap ? state.output.point : toPoint(fix);
  const place = followRoute(state, here, route, fix.timestamp, state.speedMps, state.movement);
  return {
    ...state,
    ...place.memory,
    output: compose(state.output, here, place.alongM, route, state.movement, place.trustRoute),
  };
}

/**
 * От какой точки просить у сервера новый маршрут.
 *
 * Пока машина на маршруте — от её места НА маршруте, а не от фикса. Отсев
 * пропускает выброс, если приёмник занизил погрешность или между фиксами
 * была пауза; такой фикс не должен становиться началом новой линии — иначе
 * линия пошла бы от точки в стороне, и стрелка, заново захватывая её,
 * встала бы на «подъезд» от выброса к дороге. Сошла с маршрута (три фикса
 * подряд) или маршрута ещё нет — от последнего принятого фикса: тогда он и
 * есть лучшее знание о том, где машина.
 */
export function routeOrigin(state: TrackerState): HeadingPoint | null {
  if (state.output?.snap) return state.output.point;
  return state.lastFix ? toPoint(state.lastFix) : null;
}
