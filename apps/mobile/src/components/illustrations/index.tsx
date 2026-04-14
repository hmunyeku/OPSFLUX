/**
 * Illustration components — UnDraw-style, single-color, brand-customizable.
 *
 * All illustrations use the project's primary color (with neutral grays
 * for secondary elements) so they automatically follow the brand. They
 * are pure SVG components (react-native-svg) — no external assets to
 * download, no network dependency, perfectly responsive.
 *
 * Inspired by https://undraw.co — same minimalist flat aesthetic.
 *
 * Usage:
 *   <EmptyInbox width={200} />
 *   <ScanningPhone width={240} color="#10b981" />
 *
 * To add a new illustration:
 *   1. Find one on undraw.co
 *   2. Download the SVG
 *   3. Replace fill colors with `{color}` and `{accent}`
 *   4. Add as a new export here
 */
import React from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { colors } from "../../utils/colors";

export interface IllustrationProps {
  /** Logical width in dp; height auto-scales to preserve aspect. */
  width?: number;
  /** Primary brand color. Defaults to colors.primary. */
  color?: string;
  /** Secondary accent color (lighter). */
  accent?: string;
  /** Neutral gray. */
  neutral?: string;
}

const DEFAULTS = {
  color: colors.primary,
  accent: "#dbeafe", // primary-100
  neutral: "#9ca3af", // gray-400
};

/* ── Empty state — empty inbox / no items ─────────────────────────── */
export function EmptyInbox({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 240) / 320;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 320 240">
      {/* Floor shadow */}
      <Ellipse cx="160" cy="220" rx="120" ry="8" fill={neutral} opacity={0.2} />
      {/* Box body */}
      <Path d="M70 120 L250 120 L240 200 L80 200 Z" fill={accent} />
      {/* Box lid */}
      <Path d="M60 100 L260 100 L250 130 L70 130 Z" fill={color} />
      <Path d="M70 130 L250 130 L245 140 L75 140 Z" fill={color} opacity={0.7} />
      {/* Tape */}
      <Rect x="155" y="100" width="10" height="30" fill={color} opacity={0.6} />
      {/* Floating dots — empty */}
      <Circle cx="100" cy="60" r="6" fill={neutral} opacity={0.3} />
      <Circle cx="220" cy="50" r="4" fill={neutral} opacity={0.3} />
      <Circle cx="160" cy="40" r="5" fill={neutral} opacity={0.3} />
      {/* Plant decoration */}
      <Path d="M40 200 Q40 180 30 170 Q40 160 45 170 Z" fill={color} opacity={0.5} />
      <Rect x="35" y="200" width="20" height="10" fill={neutral} opacity={0.4} />
    </Svg>
  );
}

/* ── Scanning phone — for QR scan / pairing flow ───────────────────── */
export function ScanningPhone({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 280) / 280;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 280 280">
      <Ellipse cx="140" cy="265" rx="100" ry="6" fill={neutral} opacity={0.2} />
      {/* Phone body */}
      <Rect x="100" y="50" width="80" height="160" rx="12" fill={color} />
      {/* Screen */}
      <Rect x="108" y="65" width="64" height="125" rx="4" fill="#ffffff" />
      {/* Camera dot */}
      <Circle cx="140" cy="200" r="6" fill="#ffffff" opacity={0.6} />
      {/* QR pattern on screen */}
      <Rect x="115" y="80" width="10" height="10" fill={color} />
      <Rect x="155" y="80" width="10" height="10" fill={color} />
      <Rect x="115" y="120" width="10" height="10" fill={color} />
      <Rect x="135" y="100" width="6" height="6" fill={color} />
      <Rect x="145" y="115" width="6" height="6" fill={color} />
      <Rect x="125" y="135" width="6" height="6" fill={color} />
      <Rect x="155" y="125" width="6" height="6" fill={color} />
      <Rect x="155" y="155" width="10" height="10" fill={color} />
      <Rect x="115" y="160" width="6" height="6" fill={color} />
      <Rect x="135" y="160" width="6" height="6" fill={color} />
      {/* Scan beam */}
      <Rect x="108" y="120" width="64" height="2" fill={color} opacity={0.7} />
      {/* Sparkles around */}
      <Circle cx="60" cy="80" r="4" fill={color} opacity={0.5} />
      <Circle cx="220" cy="100" r="5" fill={color} opacity={0.5} />
      <Circle cx="50" cy="180" r="3" fill={color} opacity={0.5} />
      <Circle cx="230" cy="200" r="4" fill={color} opacity={0.5} />
    </Svg>
  );
}

/* ── Welcome / onboarding ─────────────────────────────────────────── */
export function WelcomeWave({ width = 240, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 280;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 280 200">
      <Ellipse cx="140" cy="190" rx="100" ry="6" fill={neutral} opacity={0.2} />
      {/* Person body */}
      <Rect x="120" y="80" width="40" height="80" rx="8" fill={color} />
      {/* Head */}
      <Circle cx="140" cy="60" r="22" fill={accent} />
      {/* Hand waving */}
      <Path d="M170 75 Q190 55 175 35 Q200 50 195 75" fill={accent} stroke={color} strokeWidth={3} fill={accent} />
      {/* Legs */}
      <Rect x="125" y="155" width="14" height="30" fill={color} opacity={0.7} />
      <Rect x="141" y="155" width="14" height="30" fill={color} opacity={0.7} />
      {/* Speech bubble */}
      <Path d="M40 60 Q30 60 30 75 L30 95 Q30 110 45 110 L70 110 L80 120 L80 110 L100 110 Q115 110 115 95 L115 75 Q115 60 100 60 Z" fill="#ffffff" stroke={color} strokeWidth={2} />
      <Circle cx="60" cy="85" r="3" fill={color} />
      <Circle cx="75" cy="85" r="3" fill={color} />
      <Circle cx="90" cy="85" r="3" fill={color} />
    </Svg>
  );
}

/* ── Success / done ──────────────────────────────────────────────── */
export function SuccessCheck({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Big circle */}
      <Circle cx="120" cy="100" r="60" fill={accent} />
      <Circle cx="120" cy="100" r="60" fill="none" stroke={color} strokeWidth={4} />
      {/* Check mark */}
      <Path d="M90 100 L115 125 L155 80" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      {/* Confetti */}
      <Rect x="40" y="50" width="6" height="6" fill={color} transform="rotate(30 43 53)" />
      <Rect x="200" y="60" width="6" height="6" fill={color} transform="rotate(-20 203 63)" opacity={0.7} />
      <Rect x="50" y="160" width="6" height="6" fill={color} transform="rotate(45 53 163)" opacity={0.5} />
      <Circle cx="190" cy="40" r="4" fill={color} opacity={0.6} />
      <Circle cx="30" cy="100" r="3" fill={color} opacity={0.7} />
      <Circle cx="215" cy="155" r="4" fill={color} opacity={0.5} />
    </Svg>
  );
}

/* ── No connection / offline ─────────────────────────────────────── */
export function NoConnection({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Cloud */}
      <Path d="M70 110 Q60 110 55 100 Q50 80 70 75 Q75 55 100 55 Q125 50 135 70 Q160 70 165 90 Q175 95 170 110 Z" fill={accent} />
      {/* Slash through */}
      <Path d="M50 50 L190 160" stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Path d="M50 52 L190 162" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      {/* WiFi waves crossed */}
      <Path d="M120 140 Q120 140 120 140" fill={color} />
      <Circle cx="120" cy="140" r="4" fill={color} />
    </Svg>
  );
}

/* ── Search empty / no results ──────────────────────────────────── */
export function NoResults({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Magnifier circle */}
      <Circle cx="100" cy="80" r="40" fill="none" stroke={color} strokeWidth={6} />
      <Circle cx="100" cy="80" r="32" fill={accent} opacity={0.6} />
      {/* Magnifier handle */}
      <Path d="M130 110 L170 150" stroke={color} strokeWidth={8} strokeLinecap="round" />
      {/* Question mark inside */}
      <Path d="M92 75 Q92 65 100 65 Q108 65 108 73 Q108 80 100 82 L100 90" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Circle cx="100" cy="98" r="3" fill={color} />
    </Svg>
  );
}

/* ── GPS location ───────────────────────────────────────────────── */
export function GpsLocation({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Map background */}
      <Rect x="40" y="40" width="160" height="120" rx="8" fill={accent} opacity={0.4} />
      {/* Map lines */}
      <Path d="M40 80 L200 80" stroke={neutral} strokeWidth={1} opacity={0.5} strokeDasharray="4 4" />
      <Path d="M40 120 L200 120" stroke={neutral} strokeWidth={1} opacity={0.5} strokeDasharray="4 4" />
      <Path d="M100 40 L100 160" stroke={neutral} strokeWidth={1} opacity={0.5} strokeDasharray="4 4" />
      <Path d="M150 40 L150 160" stroke={neutral} strokeWidth={1} opacity={0.5} strokeDasharray="4 4" />
      {/* Pin */}
      <Path d="M120 130 Q90 100 90 80 Q90 60 120 60 Q150 60 150 80 Q150 100 120 130 Z" fill={color} />
      <Circle cx="120" cy="80" r="10" fill="#ffffff" />
      {/* GPS pulse */}
      <Circle cx="120" cy="130" r="12" fill="none" stroke={color} strokeWidth={2} opacity={0.4} />
      <Circle cx="120" cy="130" r="20" fill="none" stroke={color} strokeWidth={1} opacity={0.2} />
    </Svg>
  );
}

/* ── Identity card / badge ───────────────────────────────────────── */
export function IdCard({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Card */}
      <Rect x="40" y="40" width="160" height="110" rx="8" fill="#ffffff" stroke={color} strokeWidth={3} />
      {/* Photo placeholder */}
      <Rect x="55" y="55" width="50" height="60" rx="4" fill={accent} />
      <Circle cx="80" cy="78" r="10" fill={color} />
      <Path d="M65 110 Q80 95 95 110 Z" fill={color} />
      {/* Lines (text) */}
      <Rect x="115" y="60" width="70" height="6" rx="3" fill={color} />
      <Rect x="115" y="74" width="55" height="4" rx="2" fill={neutral} opacity={0.5} />
      <Rect x="115" y="84" width="45" height="4" rx="2" fill={neutral} opacity={0.5} />
      <Rect x="115" y="100" width="65" height="4" rx="2" fill={neutral} opacity={0.5} />
      {/* Header band */}
      <Rect x="40" y="40" width="160" height="14" rx="8" fill={color} />
      <Rect x="40" y="48" width="160" height="6" fill={color} />
      {/* Sparkle */}
      <Circle cx="190" cy="60" r="3" fill={color} opacity={0.6} />
    </Svg>
  );
}

/* ── Email verification ─────────────────────────────────────────── */
export function EmailEnvelope({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 200) / 240;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 240 200">
      <Ellipse cx="120" cy="185" rx="80" ry="6" fill={neutral} opacity={0.2} />
      {/* Envelope back */}
      <Rect x="50" y="60" width="140" height="100" rx="6" fill="#ffffff" stroke={color} strokeWidth={3} />
      {/* Envelope flap */}
      <Path d="M50 60 L120 115 L190 60 Z" fill={accent} />
      <Path d="M50 60 L120 115 L190 60" fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
      {/* @ Symbol or small lines */}
      <Rect x="80" y="135" width="80" height="3" rx="1.5" fill={neutral} opacity={0.5} />
      <Rect x="90" y="145" width="60" height="3" rx="1.5" fill={neutral} opacity={0.5} />
      {/* Notification dot */}
      <Circle cx="180" cy="60" r="10" fill={color} />
      <Path d="M176 60 L179 63 L184 57" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* ── Phone OTP ──────────────────────────────────────────────────── */
export function PhoneOtp({ width = 200, color = DEFAULTS.color, accent = DEFAULTS.accent, neutral = DEFAULTS.neutral }: IllustrationProps) {
  const aspectHeight = (width * 240) / 200;
  return (
    <Svg width={width} height={aspectHeight} viewBox="0 0 200 240">
      <Ellipse cx="100" cy="225" rx="70" ry="5" fill={neutral} opacity={0.2} />
      {/* Phone */}
      <Rect x="60" y="40" width="80" height="160" rx="12" fill={color} />
      <Rect x="68" y="55" width="64" height="125" rx="4" fill="#ffffff" />
      {/* OTP digits on screen */}
      <Rect x="76" y="100" width="8" height="14" rx="2" fill={color} />
      <Rect x="90" y="100" width="8" height="14" rx="2" fill={color} />
      <Rect x="104" y="100" width="8" height="14" rx="2" fill={color} />
      <Rect x="118" y="100" width="8" height="14" rx="2" fill={color} opacity={0.3} />
      <Rect x="76" y="80" width="50" height="6" rx="3" fill={accent} />
      {/* SMS bubble */}
      <Path d="M40 70 Q30 70 30 80 L30 100 Q30 110 40 110 L60 110 Q70 110 70 100 L70 80 Q70 70 60 70 Z" fill={accent} />
      <Circle cx="42" cy="90" r="2" fill={color} />
      <Circle cx="50" cy="90" r="2" fill={color} />
      <Circle cx="58" cy="90" r="2" fill={color} />
    </Svg>
  );
}

export default {
  EmptyInbox,
  ScanningPhone,
  WelcomeWave,
  SuccessCheck,
  NoConnection,
  NoResults,
  GpsLocation,
  IdCard,
  EmailEnvelope,
  PhoneOtp,
};
