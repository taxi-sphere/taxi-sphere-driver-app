/**
 * @file: src/components/map/RouteChoiceBar.tsx
 * @description:
 *   Выбор варианта пути — панель над шторкой (MOB-024).
 *
 *   ЗАЧЕМ. Роутер отдаёт самый БЫСТРЫЙ путь; альтернатива нередко на 4-5 км
 *   короче при том же времени. Разница в километрах — это топливо водителя
 *   и, при нефиксированной цене, деньги клиента. До 1.5.49 выбора не было
 *   вовсе: приложение показывало то, что решил роутер.
 *
 *   ПОЧЕМУ ВНИЗУ, А НЕ СВЕРХУ. Верх карты занят рядом чипов («Итого»,
 *   ожидание), и он же — дорога впереди в режиме слежения. Низ карты у
 *   границы шторки — место, куда водитель и так смотрит, переводя взгляд с
 *   дороги на адрес.
 *
 *   СВЁРНУТО ПО УМОЛЧАНИЮ (1.5.57). До этого пара вариантов висела на карте
 *   всё время, пока водитель не ткнёт в один из них: убрать её, не выбирая,
 *   было нечем — и она закрывала кусок карты у самой шторки. Теперь внизу
 *   справа стоит одна кнопка, а ряд раскрывается по нажатию.
 *
 *   РЯД ЗАКРЫВАЕТСЯ ДВУМЯ СПОСОБАМИ, И ОБА — ПРО ВОДИТЕЛЯ (1.5.58).
 *   Повторным нажатием на ту кнопку, которую он сам только что нажал, и сам
 *   собой через `ROUTE_PANEL_AUTOHIDE_MS`, если водитель выбрал путь и
 *   поехал. Любое нажатие отсчёт сбрасывает, поэтому долгое сравнение путей
 *   ряд не закроет. Решение о нажатии считает `@/lib/route-panel` — там же
 *   объяснено, почему оно опирается на нажатия, а не на подсветку, и там же
 *   тесты.
 *
 *   СВЁРНУТАЯ КНОПКА ГОВОРИТ СОСТОЯНИЕ. Если линия убрана, она пишет
 *   «Маршрут скрыт», а не «Маршруты»: иначе пустая карта читается как «не
 *   построился», и водитель гадает, ждать ему или нажимать.
 *
 * @dependencies: @/lib/theme, @/components/ui, @/api/routing.api,
 *   @/lib/route-panel (что значит нажатие — там же и тесты)
 * @created: 2026-09-09 (1.5.49)
 * @updated: 2026-09-11 (1.5.58 — переключение больше не сворачивает ряд)
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { Surface } from '@/components/ui/Surface';
import { useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { radius, spacing } from '@/lib/design/tokens';
import type { RouteVariant } from '@/api/routing.api';
import {
  isRoutePanelTargetActive,
  routePanelAction,
  routePanelKey,
  ROUTE_PANEL_AUTOHIDE_MS,
  type RoutePanelTarget,
} from '@/lib/route-panel';

/**
 * Сколько вариантов показывать.
 *
 * Два, хотя роутер иногда отдаёт три: рядом с ними стоит «Без маршрута», и
 * четыре подписи с числами в ширину телефона уже не читаются на ходу. Две
 * первые — самая быстрая и самая непохожая на неё, то есть ровно тот выбор,
 * ради которого панель и заведена.
 */
const MAX_VARIANTS = 2;

interface RouteChoiceBarProps {
  variants: RouteVariant[];
  /** Какой вариант ведёт сейчас; 0 — быстрый. */
  chosenIndex: number;
  /** Линия убрана с карты. */
  hidden: boolean;
  onChoose: (index: number) => void;
  onHide: () => void;
  /** Высота шторки: панель стоит НАД ней, а не под. */
  bottomInset: number;
}

/** «3.6 км · 6 мин» — то, чем варианты и отличаются. */
function variantLabel(variant: RouteVariant): string {
  const km = variant.distanceMeters != null ? variant.distanceMeters / 1000 : null;
  const min =
    variant.durationSeconds != null ? Math.round(variant.durationSeconds / 60) : null;
  const parts = [
    km != null ? `${km.toFixed(1)} км` : null,
    min != null ? `${min} мин` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'маршрут';
}

export function RouteChoiceBar({
  variants,
  chosenIndex,
  hidden,
  onChoose,
  onHide,
  bottomInset,
}: RouteChoiceBarProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  /**
   * Что водитель нажал сам с момента раскрытия ряда.
   *
   * Сбрасывается при каждом открытии: «повторное нажатие» считается внутри
   * одного раскрытия, иначе кнопка, нажатая десять минут назад, свернула бы
   * ряд сразу после следующего открытия.
   */
  const [lastTapped, setLastTapped] = useState<string | null>(null);

  const openPanel = useCallback(() => {
    setLastTapped(null);
    setOpen(true);
  }, []);

  const handleTap = useCallback(
    (target: RoutePanelTarget) => {
      const action = routePanelAction(target, lastTapped);
      if (action === 'collapse') {
        setOpen(false);
        return;
      }
      // Запоминаем ДО действия: `onChoose` перестраивает маршрут, и к тому
      // моменту, как ответ придёт, нажатие должно быть уже учтено.
      setLastTapped(routePanelKey(target));
      if (action === 'hide') onHide();
      else if (target.kind === 'variant') onChoose(target.index);
    },
    [lastTapped, onChoose, onHide],
  );

  /**
   * Спрятать ряд, если водитель перестал им пользоваться.
   *
   * Зависимость от `lastTapped` — это и есть сброс отсчёта: каждое нажатие
   * меняет значение, эффект перезапускается, таймер начинается заново.
   */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), ROUTE_PANEL_AUTOHIDE_MS);
    return () => clearTimeout(timer);
  }, [open, lastTapped]);

  if (!open) {
    return (
      <View style={[styles.wrap, { bottom: bottomInset + spacing.md }]}>
        <Pressable
          onPress={openPanel}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Маршрут скрыт, открыть выбор' : 'Варианты маршрута'}
          style={({ pressed }) => [styles.collapsed, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Surface level={2} padded={false} radius={radius.pill} style={styles.pill}>
            <AppText variant="labelStrong" tone={hidden ? 'warning' : 'secondary'}>
              {hidden ? 'Маршрут скрыт' : 'Маршруты'}
            </AppText>
          </Surface>
        </Pressable>
      </View>
    );
  }

  const shown = variants.slice(0, MAX_VARIANTS);

  return (
    <View style={[styles.wrap, { bottom: bottomInset + spacing.md }]}>
      <View style={styles.row}>
        {shown.map((variant, index) => {
          const target: RoutePanelTarget = { kind: 'variant', index };
          const active = isRoutePanelTargetActive(target, { chosenIndex, hidden });
          const collapses = routePanelAction(target, lastTapped) === 'collapse';
          return (
            <Pressable
              key={index}
              onPress={() => handleTap(target)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                collapses
                  ? `${variantLabel(variant)}. Нажмите, чтобы свернуть`
                  : `Вариант пути: ${variantLabel(variant)}`
              }
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Surface
                level={2}
                padded={false}
                radius={radius.lg}
                style={[
                  styles.card,
                  active && {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
              >
                {/* Первый вариант роутера — самый быстрый. Подпись нужна:
                    без неё два числа рядом не говорят, чем они отличаются. */}
                <AppText
                  variant="caption"
                  tone={active ? 'brand' : index === 0 ? 'success' : 'muted'}
                >
                  {index === 0 ? 'быстрее' : 'другой путь'}
                </AppText>
                <AppText
                  variant="labelStrong"
                  style={{ color: active ? colors.primary : colors.textPrimary }}
                >
                  {variantLabel(variant)}
                </AppText>
              </Surface>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => handleTap({ kind: 'noRoute' })}
          accessibilityRole="button"
          accessibilityState={{ selected: hidden }}
          accessibilityLabel={
            routePanelAction({ kind: 'noRoute' }, lastTapped) === 'collapse'
              ? 'Маршрут скрыт. Нажмите, чтобы свернуть'
              : 'Убрать маршрут с карты'
          }
          style={({ pressed }) => [styles.noRoute, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Surface
            level={2}
            padded={false}
            radius={radius.lg}
            style={[
              styles.card,
              hidden && {
                backgroundColor: colors.primarySoft,
                borderColor: colors.primary,
              },
            ]}
          >
            {/* Без чисел: их у этого варианта нет, а место в ряду есть у всех
                троих только пока подпись короткая. */}
            <AppText variant="labelStrong" tone={hidden ? 'brand' : 'muted'} center>
              Без{'\n'}маршрута
            </AppText>
          </Surface>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      alignItems: 'center',
    },
    /** Свёрнутая — внизу СПРАВА, как её и просили: под большой палец. */
    collapsed: { alignSelf: 'flex-end' },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
    item: { flexShrink: 1 },
    /** Третья кнопка уже двух остальных: у неё нет чисел. */
    noRoute: { flexShrink: 0 },
    card: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: t.colors.border,
      height: '100%',
    },
  });
