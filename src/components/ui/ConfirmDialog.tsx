/**
 * @file: src/components/ui/ConfirmDialog.tsx
 * @description:
 *   Диалог подтверждения и выбора — свой, а не системный `Alert.alert`.
 *
 *   ЗАЧЕМ. В приложении 22 вызова `Alert.alert` в девяти файлах: выход из
 *   смены, подтверждение прибытия, вывод денег, смена сервера. Все они
 *   рисуются оболочкой Android и к приложению отношения не имеют — чужие
 *   шрифты, чужие цвета, чужие отступы, и на светлой теме они светлые, даже
 *   когда приложение тёмное. Место, где водитель принимает решение, —
 *   последнее, где уместно выглядеть чужим.
 *
 *   ПОЧЕМУ ИМПЕРАТИВНЫЙ API, А НЕ ПРОПСЫ. `Alert.alert` вызывают из
 *   обработчика: «спросить и дождаться ответа». Декларативный диалог
 *   потребовал бы в каждом экране пары `useState` и разнесённой на два
 *   места логики, а таких мест 22. `useConfirm()` возвращает функцию,
 *   которая ждёт ответа, — переписывание получается построчным.
 *
 *   ВЫБОР ИЗ НЕСКОЛЬКИХ, А НЕ ТОЛЬКО «ДА/НЕТ». Кнопка звонка предлагает
 *   позвонить клиенту или диспетчеру; таких развилок будет больше. Поэтому
 *   основа — список действий, а привычное подтверждение сделано обёрткой
 *   над ним.
 *
 *   ПОГАШЕННОЕ ДЕЙСТВИЕ ОСТАЁТСЯ ВИДНЫМ. Прятать недоступный пункт нельзя:
 *   если трубка иногда открывает выбор, а иногда звонит сразу, водитель на
 *   ходу нажмёт её по памяти и позвонит не тому. Одно действие — один
 *   исход, всегда. Причина, по которой пункт погашен, пишется под ним:
 *   это ещё и заявка администратору, что в службе не заполнен телефон.
 *
 * @dependencies: react-native, @expo/vector-icons, @/lib/theme, ./Text, ./Button
 * @created: 2026-09-02 (v1.5.23)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  radius,
  spacing,
  useTheme,
  useThemedStyles,
  type Theme,
} from '@/lib/theme';
import { AppText } from './Text';
import { Button, type ButtonVariant } from './Button';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface DialogAction {
  label: string;
  variant?: ButtonVariant;
  icon?: IoniconName;
  /** Пункт виден, но нажать нельзя. Причина — в `hint`. */
  disabled?: boolean;
  /** Подпись под кнопкой: обычно объяснение, почему она погашена. */
  hint?: string;
}

export interface DialogRequest {
  title: string;
  message?: string;
  /** Действия сверху вниз. Первое — основное. */
  actions: DialogAction[];
  /** Подпись кнопки отказа. `null` — кнопки отказа нет вовсе. */
  cancelLabel?: string | null;
}

/** Индекс выбранного действия либо `null`, если водитель отказался. */
export type DialogResult = number | null;

type Ask = (request: DialogRequest) => Promise<DialogResult>;

const DialogContext = createContext<Ask | null>(null);

/* ─── Провайдер ───────────────────────────────────────────────────────── */

interface PendingDialog {
  request: DialogRequest;
  resolve: (result: DialogResult) => void;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  // Незакрытый диалог не должен пережить размонтирование провайдера:
  // иначе вызвавший его `await` не разрешится никогда и обработчик
  // останется висеть.
  const pendingRef = useRef<PendingDialog | null>(null);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      pendingRef.current?.resolve(null);
    },
    [],
  );

  const ask = useCallback<Ask>(
    (request) =>
      new Promise<DialogResult>((resolve) => {
        setPending((previous) => {
          // Второй вопрос поверх первого — почти всегда ошибка вызывающего.
          // Первый закрываем отказом, чтобы его `await` не завис.
          previous?.resolve(null);
          return { request, resolve };
        });
      }),
    [],
  );

  const close = useCallback((result: DialogResult) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  return (
    <DialogContext.Provider value={ask}>
      {children}
      {pending ? <DialogView request={pending.request} onClose={close} /> : null}
    </DialogContext.Provider>
  );
}

/* ─── Хуки ────────────────────────────────────────────────────────────── */

/**
 * Спросить водителя и дождаться ответа.
 *
 * Возвращает индекс выбранного действия или `null` при отказе.
 */
export function useDialog(): Ask {
  const ask = useContext(DialogContext);
  if (!ask) {
    throw new Error('useDialog вызван вне ConfirmDialogProvider');
  }
  return ask;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Подпись подтверждающей кнопки. По умолчанию — «Подтвердить». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` — для необратимого: выйти, отменить заказ, удалить. */
  variant?: ButtonVariant;
}

/**
 * Привычное «да/нет» — построчная замена `Alert.alert` с двумя кнопками.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ask = useDialog();

  return useCallback(
    async ({ title, message, confirmLabel, cancelLabel, variant }: ConfirmOptions) => {
      const result = await ask({
        title,
        message,
        cancelLabel: cancelLabel ?? 'Отмена',
        actions: [{ label: confirmLabel ?? 'Подтвердить', variant: variant ?? 'primary' }],
      });
      return result === 0;
    },
    [ask],
  );
}

/**
 * Сообщение без выбора — замена `Alert.alert` с одной кнопкой.
 */
export function useNotify(): (title: string, message?: string) => Promise<void> {
  const ask = useDialog();

  return useCallback(
    async (title: string, message?: string) => {
      await ask({ title, message, cancelLabel: null, actions: [{ label: 'Понятно' }] });
    },
    [ask],
  );
}

/* ─── Отрисовка ───────────────────────────────────────────────────────── */

function DialogView({
  request,
  onClose,
}: {
  request: DialogRequest;
  onClose: (result: DialogResult) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const cancelLabel = request.cancelLabel === undefined ? 'Отмена' : request.cancelLabel;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Аппаратная «назад» на Android обязана закрывать так же, как «Отмена»:
      // иначе водитель выходит из диалога, а обработчик продолжает ждать.
      onRequestClose={() => onClose(null)}
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: colors.scrim }]}
        onPress={() => onClose(null)}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
      >
        {/* Нажатие внутри окна не должно закрывать его — гасим всплытие. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <AppText variant="subheading" style={styles.title}>
            {request.title}
          </AppText>

          {request.message ? (
            <AppText variant="body" tone="secondary" style={styles.message}>
              {request.message}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            {request.actions.map((action, index) => (
              <View key={action.label} style={styles.actionBlock}>
                <Button
                  onPress={() => onClose(index)}
                  variant={action.variant ?? (index === 0 ? 'primary' : 'secondary')}
                  size="md"
                  icon={action.icon}
                  disabled={action.disabled}
                  fullWidth
                >
                  {action.label}
                </Button>
                {action.disabled && action.hint ? (
                  <AppText variant="caption" tone="muted" center style={styles.hint}>
                    {action.hint}
                  </AppText>
                ) : null}
              </View>
            ))}

            {cancelLabel ? (
              <Button onPress={() => onClose(null)} variant="ghost" size="md" fullWidth>
                {cancelLabel}
              </Button>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.sm,
      backgroundColor: t.colors.surfaceElevated,
      // Обводка, а не тень: на тёмной теме тень под окном не читается, а на
      // светлой окно иначе сливается с затемнением фона.
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    title: { marginBottom: spacing.xs },
    message: { marginBottom: spacing.sm },
    actions: { gap: spacing.sm },
    actionBlock: { gap: spacing.xs },
    hint: { paddingHorizontal: spacing.sm },
  });
