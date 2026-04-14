import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import type { CurrentOrder } from '../../types/order';

interface OrderMapProps {
  order: CurrentOrder;
  height?: number;
}

export function OrderMap({ order, height = 200 }: OrderMapProps) {
  const mapRef = useRef<MapView>(null);
  const [driverLocation, setDriverLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Отслеживание позиции водителя
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          setDriverLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );
    })();

    return () => { subscription?.remove(); };
  }, []);

  // Авто-zoom на все маркеры
  useEffect(() => {
    if (!mapRef.current) return;

    const coords: Array<{ latitude: number; longitude: number }> = [];

    if (order.pickupLat && order.pickupLng) {
      coords.push({ latitude: order.pickupLat, longitude: order.pickupLng });
    }
    if (order.dropoffLat && order.dropoffLng) {
      coords.push({ latitude: order.dropoffLat, longitude: order.dropoffLng });
    }
    order.stops?.forEach((s) => {
      if (s.lat && s.lng) coords.push({ latitude: s.lat, longitude: s.lng });
    });
    if (driverLocation) {
      coords.push(driverLocation);
    }

    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion({
        ...coords[0],
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [order.pickupLat, order.pickupLng, order.dropoffLat, order.dropoffLng, driverLocation]);

  const hasPickup = order.pickupLat != null && order.pickupLng != null;
  const hasDropoff = order.dropoffLat != null && order.dropoffLng != null;

  if (!hasPickup) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Координаты не указаны</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: order.pickupLat!,
          longitude: order.pickupLng!,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {/* Водитель */}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            title="Вы здесь"
            pinColor="#3b82f6"
          />
        )}

        {/* Подача */}
        {hasPickup && (
          <Marker
            coordinate={{ latitude: order.pickupLat!, longitude: order.pickupLng! }}
            title="Подача"
            description={order.pickupAddress}
            pinColor="#22c55e"
          />
        )}

        {/* Промежуточные остановки */}
        {order.stops?.map((stop, i) =>
          stop.lat && stop.lng ? (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              title={`Остановка ${i + 1}`}
              description={stop.address}
              pinColor="#f59e0b"
            />
          ) : null,
        )}

        {/* Назначение */}
        {hasDropoff && (
          <Marker
            coordinate={{ latitude: order.dropoffLat!, longitude: order.dropoffLng! }}
            title="Назначение"
            description={order.dropoffAddress || ''}
            pinColor="#ef4444"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  placeholder: {
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
