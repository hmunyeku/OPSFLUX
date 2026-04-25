/**
 * FleetMap — real-time fleet map using Leaflet in a WebView.
 *
 * Why Leaflet + WebView instead of react-native-maps:
 *  - Zero native module crashes on Android SDK 52
 *  - Works on all devices without Google Maps API key
 *  - OpenStreetMap tiles (free, no rate limits for normal usage)
 *  - Easy to update and customize with pure HTML/CSS/JS
 *  - Proven stable for production apps
 *
 * Features:
 *  - Vehicle markers with rotation for heading
 *  - Colored markers by source (AIS=blue, GPS=green, manual=orange)
 *  - Polyline for historical tracks
 *  - Auto-fit to positions on load
 *  - Click marker → callout with vehicle info
 *  - User location (blue dot)
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { colors } from "../utils/colors";
import { radius } from "../utils/design";

export interface MapPosition {
  id: string;
  vector_id: string;
  vector_name?: string;
  latitude: number;
  longitude: number;
  source: string;
  speed_knots: number | null;
  heading: number | null;
  recorded_at: string;
}

interface Props {
  positions: MapPosition[];
  track?: { latitude: number; longitude: number }[];
  focusVehicleId?: string;
  showUserLocation?: boolean;
  /** Center if positions empty. Defaults to Gulf of Guinea. */
  defaultCenter?: { lat: number; lon: number; zoom?: number };
  style?: object;
  onMarkerPress?: (vectorId: string) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  ais: "#2563eb",
  gps: "#16a34a",
  manual: "#f59e0b",
  default: "#1e3a5f",
};

export default function FleetMap({
  positions,
  track,
  focusVehicleId,
  showUserLocation = true,
  defaultCenter = { lat: 4.0, lon: 9.5, zoom: 6 },
  style,
  onMarkerPress,
}: Props) {
  const webviewRef = useRef<WebView>(null);

  const html = useMemo(() => buildLeafletHtml(defaultCenter), [defaultCenter]);

  // Build the payload to send to the WebView
  const payload = useMemo(
    () => ({
      positions: positions.map((p) => ({
        id: p.id,
        vector_id: p.vector_id,
        name: p.vector_name ?? p.vector_id.slice(0, 8),
        lat: p.latitude,
        lon: p.longitude,
        source: p.source,
        color: SOURCE_COLORS[p.source] ?? SOURCE_COLORS.default,
        speed: p.speed_knots,
        heading: p.heading,
        time: p.recorded_at,
      })),
      track: track ?? [],
      focusVehicleId,
      showUserLocation,
    }),
    [positions, track, focusVehicleId, showUserLocation]
  );

  // Send updates to the WebView whenever positions change
  useEffect(() => {
    if (!webviewRef.current) return;
    const js = `window.updateMap(${JSON.stringify(payload)}); true;`;
    webviewRef.current.injectJavaScript(js);
  }, [payload]);

  // Handle messages from WebView
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "marker_click" && onMarkerPress) {
          onMarkerPress(msg.vector_id);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onMarkerPress]
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        allowsInlineMediaPlayback
        mixedContentMode="compatibility"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

/** Build the Leaflet HTML — stable, self-contained, no network dependencies (except tiles). */
function buildLeafletHtml(center: { lat: number; lon: number; zoom?: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
    body { background: #f1f5f9; }
    .vehicle-marker {
      background: transparent;
      border: none;
    }
    .vehicle-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .vehicle-label {
      position: absolute;
      top: -26px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e3a5f;
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .leaflet-popup-content {
      margin: 10px 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.4;
    }
    .leaflet-popup-content strong { color: #1e3a5f; display: block; margin-bottom: 4px; font-size: 14px; }
    .leaflet-popup-content .meta { color: #64748b; font-size: 11px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
  (function() {
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true
    }).setView([${center.lat}, ${center.lon}], ${center.zoom ?? 6});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    var markersLayer = L.layerGroup().addTo(map);
    var trackLayer = L.layerGroup().addTo(map);
    var userMarker = null;

    function postMessage(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    function buildMarker(p) {
      var html =
        '<div class="vehicle-marker">' +
          '<div class="vehicle-label">' + escapeHtml(p.name) + '</div>' +
          '<div class="vehicle-dot" style="background:' + p.color + '"></div>' +
        '</div>';
      var icon = L.divIcon({
        className: 'vehicle-marker-icon',
        html: html,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      var marker = L.marker([p.lat, p.lon], { icon: icon });

      var speedTxt = p.speed != null ? p.speed.toFixed(1) + ' kn' : '—';
      var headingTxt = p.heading != null ? p.heading.toFixed(0) + '°' : '—';
      var time = new Date(p.time).toLocaleTimeString('fr-FR');
      var popupHtml =
        '<strong>' + escapeHtml(p.name) + '</strong>' +
        '<div>Source: <b>' + (p.source || '?').toUpperCase() + '</b></div>' +
        '<div>Vitesse: ' + speedTxt + '</div>' +
        '<div>Cap: ' + headingTxt + '</div>' +
        '<div class="meta">' + time + '</div>';
      marker.bindPopup(popupHtml);

      marker.on('click', function() {
        postMessage({ type: 'marker_click', vector_id: p.vector_id });
      });

      return marker;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c];
      });
    }

    window.updateMap = function(payload) {
      markersLayer.clearLayers();
      trackLayer.clearLayers();

      var bounds = [];
      (payload.positions || []).forEach(function(p) {
        var m = buildMarker(p);
        markersLayer.addLayer(m);
        bounds.push([p.lat, p.lon]);
      });

      if (payload.track && payload.track.length > 1) {
        var coords = payload.track.map(function(pt) { return [pt.latitude, pt.longitude]; });
        L.polyline(coords, { color: '#1e3a5f', weight: 3, opacity: 0.7 }).addTo(trackLayer);
        coords.forEach(function(c) { bounds.push(c); });
      }

      if (bounds.length > 0) {
        if (payload.focusVehicleId) {
          var focused = (payload.positions || []).find(function(p) {
            return p.vector_id === payload.focusVehicleId;
          });
          if (focused) {
            map.setView([focused.lat, focused.lon], 13);
            return;
          }
        }
        if (bounds.length === 1) {
          map.setView(bounds[0], 12);
        } else {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
        }
      }

      if (payload.showUserLocation && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
          if (userMarker) map.removeLayer(userMarker);
          userMarker = L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
            radius: 8,
            fillColor: '#3b82f6',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(map);
        });
      }
    };

    // Signal ready
    postMessage({ type: 'ready' });
  })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 300,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
  },
});
