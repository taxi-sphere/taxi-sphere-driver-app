/**
 * @file: app/(main)/(tabs)/_layout.tsx
 * @description:
 *   Layout нижних вкладок: Заказы, Заказ, Деньги.
 *
 *   v1.5.17: вкладок стало три вместо четырёх. «Предварительные» и
 *   «Встречные» были заглушками и занимали половину главной навигации;
 *   предзаказы переехали внутрь «Заказов» вторым режимом, встречный заказ —
 *   на экран активного заказа, рядом с первым. Освободившееся место отдано
 *   «Деньгам»: заработок и баланс водитель смотрит каждую смену, а лежали
 *   они в боковом меню.
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
import { spacing, text, useTheme } from '@/lib/theme';

/** Высота полосы вкладок без учёта системных отступов. */
const TAB_BAR_HEIGHT = 58;

export default function TabsLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

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
          name="earnings"
          options={{
            title: 'Деньги',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet" size={size} color={color} />
            ),
          }}
        />

        {/* Профиль — в боковом меню: туда заходят раз в месяц, а не за смену. */}
        <Tabs.Screen name="profile" options={{ href: null }} />
        {/* Старые маршруты: оставлены редиректами, из вкладок убраны. */}
        <Tabs.Screen name="preliminary" options={{ href: null }} />
        <Tabs.Screen name="counter" options={{ href: null }} />
      </Tabs>

      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
