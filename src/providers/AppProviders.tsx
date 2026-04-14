/**
 * @file: src/providers/AppProviders.tsx
 * @description:
 *   Корневой провайдер: объединяет все провайдеры приложения.
 * @dependencies: react-query, AuthProvider, SocketProvider, LocationProvider
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './AuthProvider';
import { SocketProvider } from './SocketProvider';
import { LocationProvider } from './LocationProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <LocationProvider>{children}</LocationProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
