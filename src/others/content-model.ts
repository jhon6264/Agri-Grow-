import { dayLabel, frontFirst, phDateKey } from '../calendar/calendar-time.ts';

export const PERIODS = [
  { id: 'midnight', label: 'Midnight', hours: '12 AM – 6 AM' },
  { id: 'morning', label: 'Morning', hours: '6 AM – 11 AM' },
  { id: 'lunch', label: 'Lunch', hours: '11 AM – 1 PM' },
  { id: 'afternoon', label: 'Afternoon', hours: '1 PM – 6 PM' },
  { id: 'evening', label: 'Evening', hours: '6 PM – 12 AM' },
] as const;
export type PeriodId = typeof PERIODS[number]['id'];
export const CONDITIONS = {
  sunny: 'Sunny', cloudy: 'Cloudy', rainy: 'Rainy',
  'heavy-rain': 'Heavy Rain', 'heavy-rain-thunder': 'Heavy Rain with Thunder',
} as const;
export type Condition = keyof typeof CONDITIONS;
export type ContentKind = 'prices' | 'weather';
export type Revisions = Record<ContentKind, number | null>;

export type PriceRecord = {
  id: string; commodityName: string; category: 'fruit' | 'vegetable' | 'spice';
  amount: number; previousAmount: number | null; observedAt: string | null;
};
export type WeatherPeriod = {
  condition: Condition; temperatureC: number; rainChancePct: number;
  humidityPct: number; windKph: number; overridden: boolean;
};
export type WeatherDay = {
  schemaVersion: 2; locationCode: 'davao-del-sur'; timezone: 'Asia/Manila'; isActive: true;
  forecastDate: string; minTemperatureC: number; maxTemperatureC: number;
  periods: Record<PeriodId, WeatherPeriod>; updatedAt: number | null;
};
export type ContentData = {
  prices: PriceRecord[]; weather: WeatherDay[];
  revisions: Revisions; loadedAt: Record<ContentKind, number | null>;
};
export const emptyContent = (): ContentData => ({
  prices: [], weather: [], revisions: { prices: null, weather: null },
  loadedAt: { prices: null, weather: null },
});

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const dateKey = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function normalizePrice(id: string, value: unknown): PriceRecord | null {
  const data = object(value);
  if (!data || data.isActive === false || typeof data.commodityName !== 'string' || !data.commodityName.trim()) return null;
  if (!['fruit', 'vegetable', 'spice'].includes(String(data.category))) return null;
  const amount = number(data.amount);
  if (amount === null || amount <= 0) return null;
  const previous = number(data.previousAmount);
  return {
    id, commodityName: data.commodityName.trim(), category: data.category as PriceRecord['category'],
    amount, previousAmount: previous !== null && previous > 0 ? previous : null,
    observedAt: dateKey(data.observedAt) ? data.observedAt as string : null,
  };
}

export function normalizeWeather(value: unknown, expectedDate?: string): WeatherDay | null {
  const data = object(value);
  if (!data || data.schemaVersion !== 2 || data.locationCode !== 'davao-del-sur' ||
    data.timezone !== 'Asia/Manila' || data.isActive === false || !dateKey(data.forecastDate) ||
    (expectedDate && data.forecastDate !== expectedDate)) return null;
  const rawPeriods = object(data.periods);
  if (!rawPeriods) return null;
  const periods = {} as Record<PeriodId, WeatherPeriod>;
  for (const { id } of PERIODS) {
    const raw = object(rawPeriods[id]);
    if (!raw || typeof raw.condition !== 'string' || !(raw.condition in CONDITIONS)) return null;
    const condition = raw.condition as Condition;
    if ((id === 'midnight' || id === 'evening') && condition === 'sunny') return null;
    const temperatureC = number(raw.temperatureC), rainChancePct = number(raw.rainChancePct);
    const humidityPct = number(raw.humidityPct), windKph = number(raw.windKph);
    if (temperatureC === null || temperatureC < 10 || temperatureC > 45 ||
      rainChancePct === null || rainChancePct < 0 || rainChancePct > 100 ||
      humidityPct === null || humidityPct < 0 || humidityPct > 100 ||
      windKph === null || windKph < 0 || windKph > 150) return null;
    periods[id] = { condition, temperatureC, rainChancePct, humidityPct, windKph, overridden: raw.overridden === true };
  }
  const temperatures = PERIODS.map(period => periods[period.id].temperatureC);
  const minTemperatureC = Math.min(...temperatures), maxTemperatureC = Math.max(...temperatures);
  if (data.minTemperatureC !== minTemperatureC || data.maxTemperatureC !== maxTemperatureC) return null;
  return {
    schemaVersion: 2, locationCode: 'davao-del-sur', timezone: 'Asia/Manila', isActive: true,
    forecastDate: data.forecastDate as string, periods, minTemperatureC, maxTemperatureC,
    updatedAt: number(data.updatedAt),
  };
}

export function phNow(now = Date.now()) {
  const hour = new Date(now + 8 * 3600000).getUTCHours();
  const period = hour < 6 ? 'midnight' : hour < 11 ? 'morning' : hour < 13 ? 'lunch' : hour < 18 ? 'afternoon' : 'evening';
  return { date: phDateKey(now), period: period as PeriodId };
}
export const weatherWindow = (now = Date.now()) => frontFirst(phDateKey(now));
export const weatherDateLabel = (date: string, weekday: 'short' | 'long' = 'short') =>
  dayLabel(date, { weekday, month: 'short', day: 'numeric', year: 'numeric' });

export function priceMovement(item: PriceRecord) {
  if (item.previousAmount === null) return null;
  const difference = item.amount - item.previousAmount;
  return { difference, percent: difference / item.previousAmount * 100 };
}
export function topMovers(prices: PriceRecord[], direction: 'up' | 'down', limit = 3) {
  return prices.map(price => ({ price, change: priceMovement(price) }))
    .filter((item): item is { price: PriceRecord; change: NonNullable<ReturnType<typeof priceMovement>> } =>
      item.change !== null && (direction === 'up' ? item.change.difference > 0 : item.change.difference < 0))
    .sort((a, b) => direction === 'up' ? b.change.percent - a.change.percent || a.price.commodityName.localeCompare(b.price.commodityName)
      : a.change.percent - b.change.percent || a.price.commodityName.localeCompare(b.price.commodityName))
    .slice(0, limit);
}
export const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
export const percentText = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export type PricesTableWidths = {
  product: number;
  category: number;
  price: number;
  change: number;
  total: number;
};

export function calculatePricesTableWidths(rows: PriceRecord[]): PricesTableWidths {
  let maxProduct = 'Product'.length;
  let maxCategory = 'Category'.length;
  let maxPrice = 'Price'.length;
  let maxChange = 'Change'.length;

  for (const item of rows) {
    if (item.commodityName && item.commodityName.length > maxProduct) maxProduct = item.commodityName.length;
    if (item.category && item.category.length > maxCategory) maxCategory = item.category.length;
    const pStr = peso(item.amount);
    if (pStr.length > maxPrice) maxPrice = pStr.length;
    const m = priceMovement(item);
    const mStr = m ? `${m.difference > 0 ? '+' : ''}${peso(m.difference)}  (${percentText(m.percent)})` : '—';
    if (mStr.length > maxChange) maxChange = mStr.length;
  }

  const product = Math.max(96, Math.min(130, Math.round(maxProduct * 7 + 18)));
  const category = Math.max(68, Math.min(88, Math.round(maxCategory * 6.5 + 14)));
  const price = Math.max(70, Math.min(88, Math.round(maxPrice * 7.5 + 14)));
  const change = Math.max(92, Math.min(135, Math.round(maxChange * 6.5 + 16)));

  return { product, category, price, change, total: product + category + price + change };
}

export function upcomingWeather(days: WeatherDay[], now = Date.now(), limit = 3) {
  const current = phNow(now), currentIndex = PERIODS.findIndex(period => period.id === current.period);
  return weatherWindow(now).flatMap(date => {
    const day = days.find(item => item.forecastDate === date);
    if (!day) return [];
    return PERIODS.flatMap((period, index) => date === current.date && index <= currentIndex ? [] :
      [{ date, period: period.id, weather: day.periods[period.id] }]);
  }).slice(0, limit);
}

export function contentSignature(kind: ContentKind, content: ContentData) {
  if (kind === 'prices') return JSON.stringify([...content.prices].sort((a, b) => a.id.localeCompare(b.id)));
  return JSON.stringify([...content.weather].sort((a, b) => a.forecastDate.localeCompare(b.forecastDate))
    .map(day => ({ date: day.forecastDate, periods: day.periods, low: day.minTemperatureC, high: day.maxTemperatureC })));
}
