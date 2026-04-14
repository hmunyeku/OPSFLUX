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

export type VehicleIconType =
  | "car"
  | "truck"
  | "bus"
  | "van"
  | "ship"
  | "boat"
  | "helicopter"
  | "plane"
  | "default";

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
  /** Visual icon type — drives the SVG shape rendered at the marker. */
  vehicle_type?: VehicleIconType;
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
        vehicle_type: p.vehicle_type ?? "default",
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
      width: 36px;
      height: 36px;
      position: relative;
    }
    .vehicle-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    /* Rotation wrapper so the icon points along the heading. */
    .vehicle-rot {
      width: 36px;
      height: 36px;
      transform-origin: 50% 50%;
      transition: transform 0.5s linear;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .vehicle-icon svg {
      width: 30px;
      height: 30px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
    }
    .vehicle-label {
      position: absolute;
      top: -24px;
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
      pointer-events: none;
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

    var trackLayer = L.layerGroup().addTo(map);
    var userMarker = null;
    // Live-map registry keyed by vector_id so we can animate instead of
    // destroying markers every update (Yango/Uber-like feel).
    var markerRegistry = {};  // vector_id -> { marker, state, rotEl }

    function postMessage(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c];
      });
    }

    // ── SVG icons by vehicle type ───────────────────────────────────
    // The icon is authored pointing UP (north = 0°); CSS rotation then
    // aligns it with the vehicle's heading.
    function iconSvg(type, color) {
      var c = color || '#1e3a5f';
      if (type === 'car' || type === 'van' || type === 'default') {
        // compact sedan, top-down
        return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
          '<path stroke="#fff" stroke-width="1" d="M7 3h10l1.5 6H5.5L7 3zm-1.5 7h13v9a1 1 0 0 1-1 1H14v-2h-4v2H6.5a1 1 0 0 1-1-1v-9zm2 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm8 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>' +
        '</svg>';
      }
      if (type === 'truck' || type === 'bus') {
        return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
          '<path stroke="#fff" stroke-width="1" d="M6 3h8l1 4h4v11h-2.2a2 2 0 0 1-3.6 0H8.8a2 2 0 0 1-3.6 0H4V6a3 3 0 0 1 3-3h-1zm1 2v3h6V5H7zm-1 10.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm10 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>' +
        '</svg>';
      }
      if (type === 'ship' || type === 'boat') {
        return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
          '<path stroke="#fff" stroke-width="1" d="M12 2l1 5 5 1-6 3-6-3 5-1 1-5zm-8 11h16l-2 6a3 3 0 0 1-3 2H9a3 3 0 0 1-3-2L4 13z"/>' +
        '</svg>';
      }
      if (type === 'plane') {
        return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
          '<path stroke="#fff" stroke-width="1" d="M12 2l2 8 8 3-8 2-2 8-2-8-8-2 8-3 2-8z"/>' +
        '</svg>';
      }
      if (type === 'helicopter') {
        return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
          '<path stroke="#fff" stroke-width="1" d="M2 6h20v1H2V6zm9 2h2v4h5l1 2h-5l-1 5h-2l-1-5H5l1-2h5V8z"/>' +
        '</svg>';
      }
      // fallback: filled dot
      return '<svg viewBox="0 0 24 24" fill="' + c + '" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2"/></svg>';
    }

    function buildDivIconHtml(p) {
      var heading = (p.heading != null) ? p.heading : 0;
      return '' +
        '<div class="vehicle-marker">' +
          '<div class="vehicle-label">' + escapeHtml(p.name) + '</div>' +
          '<div class="vehicle-rot" style="transform:rotate(' + heading + 'deg)">' +
            '<div class="vehicle-icon">' + iconSvg(p.vehicle_type, p.color) + '</div>' +
          '</div>' +
        '</div>';
    }

    function popupHtmlFor(p) {
      var speedTxt = p.speed != null ? p.speed.toFixed(1) + ' kn' : '—';
      var headingTxt = p.heading != null ? p.heading.toFixed(0) + '°' : '—';
      var time = p.time ? new Date(p.time).toLocaleTimeString('fr-FR') : '—';
      return '<strong>' + escapeHtml(p.name) + '</strong>' +
        '<div>Source: <b>' + (p.source || '?').toUpperCase() + '</b></div>' +
        '<div>Vitesse: ' + speedTxt + '</div>' +
        '<div>Cap: ' + headingTxt + '</div>' +
        '<div class="meta">' + time + '</div>';
    }

    // Linearly interpolate a marker from (fromLat, fromLon) to
    // (toLat, toLon) over durationMs — gives the "gliding" effect.
    function animateMarker(marker, fromLat, fromLon, toLat, toLon, durationMs) {
      if (marker.__animHandle) cancelAnimationFrame(marker.__animHandle);
      var start = performance.now();
      function step(now) {
        var t = Math.min(1, (now - start) / durationMs);
        var lat = fromLat + (toLat - fromLat) * t;
        var lon = fromLon + (toLon - fromLon) * t;
        marker.setLatLng([lat, lon]);
        if (t < 1) {
          marker.__animHandle = requestAnimationFrame(step);
        } else {
          marker.__animHandle = null;
        }
      }
      marker.__animHandle = requestAnimationFrame(step);
    }

    function upsertMarker(p) {
      var existing = markerRegistry[p.vector_id];
      if (!existing) {
        var icon = L.divIcon({
          className: 'vehicle-marker-icon',
          html: buildDivIconHtml(p),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        var marker = L.marker([p.lat, p.lon], { icon: icon });
        marker.bindPopup(popupHtmlFor(p));
        marker.on('click', function() {
          postMessage({ type: 'marker_click', vector_id: p.vector_id });
        });
        marker.addTo(map);
        markerRegistry[p.vector_id] = { marker: marker, lat: p.lat, lon: p.lon };
        return;
      }

      // Update popup content
      existing.marker.setPopupContent(popupHtmlFor(p));

      // Rotate the inner <div class="vehicle-rot"> via CSS transform
      // rather than rebuilding the icon — preserves the DOM node and
      // lets the CSS transition animate smoothly.
      var el = existing.marker.getElement();
      if (el) {
        var rot = el.querySelector('.vehicle-rot');
        if (rot && p.heading != null) {
          rot.style.transform = 'rotate(' + p.heading + 'deg)';
        }
      }

      // Animate position change over 1s for a natural feel. The
      // actual GPS update interval is ~30s, but animating every
      // single transition over 30s would feel sluggish; 1s matches
      // Yango/Uber's perceived cadence.
      animateMarker(existing.marker, existing.lat, existing.lon, p.lat, p.lon, 1000);
      existing.lat = p.lat;
      existing.lon = p.lon;
    }

    function removeStaleMarkers(activeIds) {
      Object.keys(markerRegistry).forEach(function(id) {
        if (activeIds.indexOf(id) === -1) {
          map.removeLayer(markerRegistry[id].marker);
          delete markerRegistry[id];
        }
      });
    }

    window.updateMap = function(payload) {
      trackLayer.clearLayers();

      var activeIds = [];
      (payload.positions || []).forEach(function(p) {
        upsertMarker(p);
        activeIds.push(p.vector_id);
      });
      removeStaleMarkers(activeIds);

      if (payload.track && payload.track.length > 1) {
        var coords = payload.track.map(function(pt) { return [pt.latitude, pt.longitude]; });
        L.polyline(coords, { color: '#1e3a5f', weight: 3, opacity: 0.7 }).addTo(trackLayer);
      }

      // Initial fit / focus (only when markers appear, not on every update
      // — otherwise the camera would jump every 30s while a passenger is
      // watching a single vehicle).
      if (!window.__hasFitted) {
        var bounds = (payload.positions || []).map(function(p) { return [p.lat, p.lon]; });
        if (payload.track) {
          (payload.track || []).forEach(function(pt) { bounds.push([pt.latitude, pt.longitude]); });
        }
        if (bounds.length > 0) {
          if (payload.focusVehicleId) {
            var focused = (payload.positions || []).find(function(p) {
              return p.vector_id === payload.focusVehicleId;
            });
            if (focused) {
              map.setView([focused.lat, focused.lon], 14);
              window.__hasFitted = true;
              return;
            }
          }
          if (bounds.length === 1) {
            map.setView(bounds[0], 14);
          } else {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          }
          window.__hasFitted = true;
        }
      } else if (payload.focusVehicleId) {
        // When following a single vehicle, keep the camera on it softly
        // (pan only, no zoom change).
        var toFollow = (payload.positions || []).find(function(p) {
          return p.vector_id === payload.focusVehicleId;
        });
        if (toFollow) {
          map.panTo([toFollow.lat, toFollow.lon], { animate: true, duration: 0.8 });
        }
      }

      if (payload.showUserLocation && navigator.geolocation && !userMarker) {
        navigator.geolocation.getCurrentPosition(function(pos) {
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
