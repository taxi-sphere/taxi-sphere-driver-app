/**
 * @file: app/(main)/(tabs)/_layout.tsx
 * @description:
 *   Layout нижних вкладок: Заказы, Текущий, Предварительные, Встречные.
 *   TopBar (гамбургер + статус + GPS + баланс) — общий для всех вкладок.
 *   DrawerMenu открывается по гамбургеру.
 * @dependencies: expo-router, @expo/vector-icons, TopBar, DrawerMenu
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-18 07:00:00
 */

import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { DrawerMenu } from '@/components/DrawerMenu';

export default function TabsLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Учитываем системные кнопки Android (navigation bar)
  const bottomPadding = Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff' }}>
        <TopBar onMenuPress={() => setDrawerOpen(true)} />
      </SafeAreaView>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#4f46e5',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopColor: '#e5e7eb',
            borderTopWidth: 1,
            paddingBottom: bottomPadding,
            paddingTop: 6,
            height: tabBarHeight,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Заказы',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="current"
          options={{
            title: 'Текущий',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="car" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="preliminary"
          options={{
            title: 'Предвар.',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="counter"
          options={{
            title: 'Встречные',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="swap-horizontal" size={size} color={color} />
            ),
          }}
        />
        {/* Скрытые экраны — доступны через Drawer */}
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>

      <DrawerMenu visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
