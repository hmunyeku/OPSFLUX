"""External weather connectors for TravelWiz.

Provides a small normalized adapter layer so TravelWiz can switch weather
providers through admin settings instead of hard-coding provider logic in the
module service itself.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass
class WeatherObservation:
    """Normalized weather payload returned by a provider connector."""

    recorded_at: datetime
    source: str
    wind_speed_knots: float | None = None
    wind_direction_deg: int | None = None
    wave_height_m: float | None = None
    visibility_nm: float | None = None
    sea_state: str | None = None
    temperature_c: float | None = None
    weather_code: str | None = None
    flight_conditions: str | None = None
    raw_data: dict[str, Any] | None = None
    notes: str | None = None


def _knots_from_ms(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) * 1.94384, 2)


def _nm_from_meters(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) / 1852.0, 2)


def _derive_flight_conditions(
    *,
    visibility_nm: float | None,
    wind_speed_knots: float | None,
    weather_code: str | None,
) -> str:
    code = (weather_code or "").lower()
    if visibility_nm is not None and visibility_nm < 1:
        return "lifr"
    if visibility_nm is not None and visibility_nm < 3:
        return "ifr"
    if code in {"thunderstorm", "storm"}:
        return "ifr"
    if wind_speed_knots is not None and wind_speed_knots >= 35:
        return "ifr"
    if visibility_nm is not None and visibility_nm < 5:
        return "mvfr"
    return "vfr"


class WeatherConnector(ABC):
    provider_id: str = ""
    provider_name: str = ""

    def __init__(self, settings: dict[str, str]):
        self.settings = settings
        timeout = settings.get("timeout_seconds") or "15"
        try:
            self.timeout_seconds = max(5.0, float(timeout))
        except (TypeError, ValueError):
            self.timeout_seconds = 15.0

    @abstractmethod
    async def test_connection(self) -> tuple[str, str]:
        ...

    @abstractmethod
    async def fetch_current_weather(self, *, latitude: float, longitude: float) -> WeatherObservation:
        ...


_CONNECTORS: dict[str, type[WeatherConnector]] = {}


def register_weather_connector(provider_id: str):
    def decorator(cls: type[WeatherConnector]):
        cls.provider_id = provider_id
        _CONNECTORS[provider_id] = cls
        return cls

    return decorator


def get_weather_connector_class(provider_id: str) -> type[WeatherConnector] | None:
    return _CONNECTORS.get(provider_id)


def create_weather_connector(provider_id: str, settings: dict[str, str]) -> WeatherConnector | None:
    cls = get_weather_connector_class(provider_id)
    if not cls:
        logger.error("Unknown weather connector: %s", provider_id)
        return None
    return cls(settings)


@register_weather_connector("open_meteo")
class OpenMeteoConnector(WeatherConnector):
    provider_name = "Open-Meteo"

    def _base_url(self) -> str:
        return self.settings.get("base_url") or "https://api.open-meteo.com/v1/forecast"

    def _weather_code_label(self, code: int | None) -> str:
        mapping = {
            0: "clear",
            1: "mainly_clear",
            2: "partly_cloudy",
            3: "overcast",
            45: "fog",
            48: "depositing_rime_fog",
            51: "drizzle",
            53: "drizzle",
            55: "drizzle",
            61: "rain",
            63: "rain",
            65: "heavy_rain",
            71: "snow",
            73: "snow",
            75: "snow",
            80: "rain_showers",
            81: "rain_showers",
            82: "rain_showers",
            95: "thunderstorm",
            96: "thunderstorm",
            99: "thunderstorm",
        }
        return mapping.get(code or -1, "unknown")

    async def _request(self, *, latitude: float, longitude: float) -> dict[str, Any]:
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": [
                "temperature_2m",
                "wind_speed_10m",
                "wind_direction_10m",
                "visibility",
                "weather_code",
            ],
            "wind_speed_unit": "kn",
            "timezone": "UTC",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(self._base_url(), params=params)
            response.raise_for_status()
            return response.json()

    async def test_connection(self) -> tuple[str, str]:
        test_latitude = self.settings.get("test_latitude") or "4.788"
        test_longitude = self.settings.get("test_longitude") or "11.867"
        try:
            payload = await self._request(latitude=float(test_latitude), longitude=float(test_longitude))
        except Exception as exc:
            return "error", f"Échec connexion Open-Meteo: {str(exc)[:300]}"
        current = payload.get("current") or {}
        if "wind_speed_10m" not in current:
            return "error", "Réponse Open-Meteo invalide"
        return "ok", "Connexion Open-Meteo réussie"

    async def fetch_current_weather(self, *, latitude: float, longitude: float) -> WeatherObservation:
        payload = await self._request(latitude=latitude, longitude=longitude)
        current = payload.get("current") or {}
        weather_code_raw = current.get("weather_code")
        weather_code = self._weather_code_label(int(weather_code_raw)) if weather_code_raw is not None else None
        visibility_nm = _nm_from_meters(current.get("visibility"))
        wind_speed_knots = (
            round(float(current["wind_speed_10m"]), 2)
            if current.get("wind_speed_10m") is not None
            else None
        )
        recorded_at_raw = current.get("time")
        recorded_at = datetime.now(timezone.utc)
        if isinstance(recorded_at_raw, str):
            try:
                recorded_at = datetime.fromisoformat(recorded_at_raw.replace("Z", "+00:00"))
            except ValueError:
                pass
        return WeatherObservation(
            recorded_at=recorded_at,
            source="api_open_meteo",
            wind_speed_knots=wind_speed_knots,
            wind_direction_deg=int(current["wind_direction_10m"]) if current.get("wind_direction_10m") is not None else None,
            visibility_nm=visibility_nm,
            temperature_c=float(current["temperature_2m"]) if current.get("temperature_2m") is not None else None,
            weather_code=weather_code,
            flight_conditions=_derive_flight_conditions(
                visibility_nm=visibility_nm,
                wind_speed_knots=wind_speed_knots,
                weather_code=weather_code,
            ),
            raw_data=payload,
        )


@register_weather_connector("openweather")
class OpenWeatherConnector(WeatherConnector):
    provider_name = "OpenWeather"

    def _base_url(self) -> str:
        return self.settings.get("base_url") or "https://api.openweathermap.org/data/2.5/weather"

    def _api_key(self) -> str:
        return self.settings.get("api_key") or ""

    async def _request(self, *, latitude: float, longitude: float) -> dict[str, Any]:
        api_key = self._api_key()
        if not api_key:
            raise ValueError("Clé API OpenWeather non configurée")
        params = {
            "lat": latitude,
            "lon": longitude,
            "appid": api_key,
            "units": "metric",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(self._base_url(), params=params)
            response.raise_for_status()
            return response.json()

    async def test_connection(self) -> tuple[str, str]:
        test_latitude = self.settings.get("test_latitude") or "4.788"
        test_longitude = self.settings.get("test_longitude") or "11.867"
        try:
            payload = await self._request(latitude=float(test_latitude), longitude=float(test_longitude))
        except Exception as exc:
            return "error", f"Échec connexion OpenWeather: {str(exc)[:300]}"
        if not payload.get("weather"):
            return "error", "Réponse OpenWeather invalide"
        return "ok", "Connexion OpenWeather réussie"

    async def fetch_current_weather(self, *, latitude: float, longitude: float) -> WeatherObservation:
        payload = await self._request(latitude=latitude, longitude=longitude)
        main = payload.get("main") or {}
        wind = payload.get("wind") or {}
        weather_list = payload.get("weather") or []
        weather_item = weather_list[0] if weather_list else {}
        visibility_nm = _nm_from_meters(payload.get("visibility"))
        wind_speed_knots = _knots_from_ms(wind.get("speed"))
        recorded_at = datetime.now(timezone.utc)
        if payload.get("dt") is not None:
            try:
                recorded_at = datetime.fromtimestamp(int(payload["dt"]), tz=timezone.utc)
            except (TypeError, ValueError, OSError):
                pass
        weather_code = str(weather_item.get("main") or weather_item.get("description") or "unknown").lower().replace(" ", "_")
        return WeatherObservation(
            recorded_at=recorded_at,
            source="api_openweather",
            wind_speed_knots=wind_speed_knots,
            wind_direction_deg=int(wind["deg"]) if wind.get("deg") is not None else None,
            visibility_nm=visibility_nm,
            temperature_c=float(main["temp"]) if main.get("temp") is not None else None,
            weather_code=weather_code,
            flight_conditions=_derive_flight_conditions(
                visibility_nm=visibility_nm,
                wind_speed_knots=wind_speed_knots,
                weather_code=weather_code,
            ),
            raw_data=payload,
        )
