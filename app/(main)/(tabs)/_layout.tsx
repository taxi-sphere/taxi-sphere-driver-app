/**
 * @file: app/(main)/(tabs)/_layout.tsx
 * @description:
 *   Layout нижних вкладок: Заказы, Заказ, Деньги.
 *
 *   v1.5.17: вкладок стало три вместо четырёх. «Предварительные» и
 *   «Встречные» были заглушками и занимали половину главной навигации;
 *   предзаказы переехали внутрь «Заказов» вторым режимом, встречный заказ —
 *   на экран активного заказа, рядом с первым. Освободившееся место отдано
 *   «Деньгам».
 *
 *   v1.5.24: вкладок снова три, но другие — «Заказы», «Заказ»,
 *   «Предзаказы». Предзаказы вернулись из «Заказов», где были вторым
 *   режимом переключателя: там в одном контроле жили ЧУЖИЕ заказы, которые
 *   можно взять, и СВОИ, уже взятые. «Деньги» уехали в боковое меню —
 *   решение пользователя: нижние места отданы заказам, потому что их
 *   перебирают всю смену, а заработок смотрят между заказами.
 *   «Встречный» вкладкой не стал: это второй активный заказ того же
 *   водителя, и место ему рядом с первым — переключателем в шторке.
 *   TopBar (гамбургер + статус + GPS + баланс) — общий для всех вкладок.
 *   DrawerMenu открывается по гамбургеру.
 * @dependencies: expo-router, @expo/vector-icons, TopBar, DrawerMenu, @/lib/theme
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, подписи вкладок 12px вместо 10px)
 */

import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { DrawerMenu } from '@/components/DrawerMenu';
import { useScheduledOrders } from '@/hooks/useScheduledOrders';
import { spacing, text, useTheme } from '@/lib/theme';

/** Высота полосы вкладок без учёта системных отступов. */
const TAB_BAR_HEIGHT = 58;

export default function TabsLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // Счётчик на вкладке «Предзаказы». Запрос уже кэширован экраном — здесь
  // он не создаёт нового обращения к серверу.
  const scheduledCount = useScheduledOrders().data?.length ?? 0;

  // Учитываем системные кнопки Android (navigation bar)
  const bottomPadding = Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, spacing.sm);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
        <TopBar onMenuPress={() => setDrawerOpen(true)} />
      </SafeAreaView>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          sceneStyle: { backgroundColor: colors.background },
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: bottomPadding,
            paddingTop: spacing.sm,
            height: TAB_BAR_HEIGHT + bottomPadding,
            // Тень уводим в ноль: полосу вкладок и так отделяет обводка, а в
            // тёмной теме тень под ней выглядит грязным пятном.
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarLabelStyle: {
            // Было 10px — на ходу подпись под иконкой не читалась.
            fontSize: text.caption.fontSize,
            fontWeight: '600',
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Заказы',
            tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="current"
          options={{
            title: 'Заказ',
            tabBarIcon: ({ color, size }) => <Ionicons name="car" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="preliminary"
          options={{
            title: 'Предзаказы',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
            // Число заказов на вкладке. Предзаказ легко забыть: он на
            // будущее, и напомнить о нём больше нечему.
            tabBarBadge: scheduledCount > 0 ? scheduledCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.primary,
              color: colors.textInverse,
              fontSize: 11,
            },
          }}
        />
        {/* Профиль — в боковом меню: туда заходят раз в месяц, а не за смену. */}
        <Tabs.Screen name="profile" options={{ href: null }} />
        {/* Деньги — тоже в меню (решение 03.09.2026). Нижние места отданы
            заказам: их водитель перебирает всю смену, а заработок смотрит
            между заказами, когда руки свободны. Экран остался прежним,
            менялось только то, откуда на него попадают. */}
        <Tabs.Screen name="earnings" options={{ href: null }} />
        {/* Встречный заказ — не отдельное место, а второй активный заказ на
            экране «Заказ». Маршрут оставлен редиректом ради ссылок. */}
        <Tabs.Screen name="counter" options={{ href: null }} />
      </Tabs>

      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
