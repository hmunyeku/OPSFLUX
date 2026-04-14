/**
 * useDriverPosition — React hook binding a TrackingSocket to component lifecycle.
 *
 * Usage:
 *
 *   const { position, status, lastSeenAt } = useDriverPosition(vehicleId);
 *
 *   <FleetMap positions={position ? [{...position}] : []} />
 *
 * The hook:
 *  - Starts a socket when `vehicleId` changes (or on mount)
 *  - Stops it on unmount or when `vehicleId` becomes null
 *  - Exposes a React-state-friendly view: the latest position, a
 *    status string, and the timestamp of the last message received
 */

import { useEffect, useRef, useState } from "react";
import {
  DriverPosition,
  TrackingSocket,
  TrackingStatus,
} from "../services/trackingSocket";

export interface UseDriverPositionResult {
  /** Most recent position or null if nothing received yet. */
  position: DriverPosition | null;
  /** Connection status — useful to show "Reconnexion…" / "Hors ligne". */
  status: TrackingStatus;
  /** Optional human-readable status detail (close reason). */
  statusDetail?: string;
  /** Millis of the last message received (for "last seen X min ago"). */
  lastSeenAt: number | null;
}

export function useDriverPosition(
  vehicleId: string | null | undefined
): UseDriverPositionResult {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const socketRef = useRef<TrackingSocket | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setPosition(null);
      setStatus("idle");
      setLastSeenAt(null);
      return;
    }

    const socket = new TrackingSocket(vehicleId, {
      onPosition: (p) => {
        setPosition(p);
        setLastSeenAt(Date.now());
      },
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail);
      },
    });
    socketRef.current = socket;
    socket.start();

    return () => {
      socket.stop();
      socketRef.current = null;
    };
    // We intentionally only depend on vehicleId — the socket instance
    // is stable for a given id and manages its own internal state.
  }, [vehicleId]);

  return { position, status, statusDetail, lastSeenAt };
}
