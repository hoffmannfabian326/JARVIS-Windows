import { round1 } from './numbers';

const CODES: Record<number, string> = {
  0: 'klar',
  1: 'überwiegend klar',
  2: 'teilweise bewölkt',
  3: 'bedeckt',
  45: 'neblig',
  48: 'Reifnebel',
  51: 'leichter Nieselregen',
  53: 'Nieselregen',
  55: 'starker Nieselregen',
  56: 'gefrierender Nieselregen',
  57: 'gefrierender Nieselregen',
  61: 'leichter Regen',
  63: 'Regen',
  65: 'starker Regen',
  66: 'gefrierender Regen',
  67: 'gefrierender Regen',
  71: 'leichter Schneefall',
  73: 'Schneefall',
  75: 'starker Schneefall',
  77: 'Schneegriesel',
  80: 'leichte Regenschauer',
  81: 'Regenschauer',
  82: 'heftige Regenschauer',
  85: 'Schneeschauer',
  86: 'starke Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit Hagel',
  99: 'Gewitter mit Hagel',
};

const describeCode = (code: number): string => CODES[code] ?? 'wechselhaft';

interface GeoResult {
  name?: string;
  latitude?: number;
  longitude?: number;
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

const WEATHER_TIMEOUT_MS = 9000;

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Liefert einen sprechbaren Wetterbericht. Bricht nach 9 Sekunden ab. */
export async function getWeatherReport(city: string): Promise<string> {
  // Ein gemeinsames Zeitbudget für Geocoding und Vorhersage, damit ein
  // hängender Request Jarvis nicht im Verarbeitungsmodus festhält.
  const signal = AbortSignal.timeout(WEATHER_TIMEOUT_MS);

  const geo = await json<{ results?: GeoResult[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=de&format=json`,
    signal,
  );
  const place = geo.results?.[0];
  if (!place || place.latitude == null || place.longitude == null) {
    throw new Error('Stadt unbekannt');
  }

  const data = await json<ForecastResponse>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto&forecast_days=2',
    signal,
  );

  const current = data.current ?? {};
  const daily = data.daily ?? {};
  const name = place.name ?? city;
  const temp = round1(current.temperature_2m ?? 0);
  const feels = round1(current.apparent_temperature ?? 0);
  const wind = Math.round(current.wind_speed_10m ?? 0);
  const desc = describeCode(current.weather_code ?? 0);
  const maxToday = round1(daily.temperature_2m_max?.[0] ?? temp);
  const minToday = round1(daily.temperature_2m_min?.[0] ?? temp);
  const descTomorrow = describeCode(daily.weather_code?.[1] ?? 0);
  const maxTomorrow = round1(daily.temperature_2m_max?.[1] ?? maxToday);
  const minTomorrow = round1(daily.temperature_2m_min?.[1] ?? minToday);

  return (
    `In ${name} sind es aktuell ${temp} Grad, gefühlt ${feels}. ${desc.charAt(0).toUpperCase()}${desc.slice(1)}, ` +
    `Wind ${wind} Kilometer pro Stunde. Heute zwischen ${minToday} und ${maxToday} Grad. ` +
    `Morgen ${descTomorrow}, zwischen ${minTomorrow} und ${maxTomorrow} Grad.`
  );
}
