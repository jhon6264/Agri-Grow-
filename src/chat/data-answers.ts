import { resolveScheduleDay } from '../calendar/chat-schedule.ts';
import { phDateKey } from '../calendar/calendar-time.ts';
import type { ContentData, PeriodId } from '../others/content-model.ts';
import type { AlmanacCrop } from '../others/almanac-data.ts';
import type { ChatDataCard } from './chat-types.ts';

type CropFacts = Pick<AlmanacCrop, 'id' | 'name' | 'localName' | 'scientificName' | 'summary' |
  'plantingSeason' | 'daysToHarvest' | 'soilAndWater' | 'sunlight' | 'growingTips'>;
export type DataAnswer = { answer: string; displayAnswer: string; context: string; needsAI: boolean; cards: ChatDataCard[] };
const periods: { id: PeriodId; label: string }[] = [
  { id: 'midnight', label: 'Midnight' }, { id: 'morning', label: 'Morning' },
  { id: 'lunch', label: 'Lunch' }, { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];
const conditions: Record<string, string> = {
  sunny: 'Sunny', cloudy: 'Cloudy', rainy: 'Rainy', 'heavy-rain': 'Heavy rain',
  'heavy-rain-thunder': 'Heavy rain with thunder',
};
const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const includesName = (message: string, name: string) => {
  return name.split('/').some(part => {
    const simple = part.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
    return !!simple && new RegExp(`(^|[^a-z0-9])${simple.replace(/\s+/g, '\\s+')}(?:s|es)?(?=$|[^a-z0-9])`, 'i').test(message);
  });
};
const dateNote = (stamp: number | null) => stamp ? new Date(stamp).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
}) + ' PH' : 'update time unavailable';
const currentPeriod = (now: number): PeriodId => {
  const hour = new Date(now + 8 * 3600000).getUTCHours();
  return hour < 6 ? 'midnight' : hour < 11 ? 'morning' : hour < 13 ? 'lunch' : hour < 18 ? 'afternoon' : 'evening';
};

export function answerDataQuestion(message: string, content: ContentData, crops: CropFacts[], now = Date.now()): DataAnswer | null {
  const value = message.toLowerCase();
  const crop = crops.find(item => [item.name, item.localName, item.scientificName]
    .some(name => includesName(value, name)));
  const weatherAsked = /\b(weather|forecast|rain|raining|temperature|humid|humidity|wind|ulan|panahon|umulan)\b/i.test(value)
    || !!crop && /\b(?:should|can i|would it be good to)\b.{0,40}\b(?:plant|water|harvest)\b/i.test(value);
  const priceAsked = /\b(price|prices|market|cost|presyo|magkano|how much)\b/i.test(value);
  const cropQuestion = /\?|^(?:what|how|when|why|tell me|should|can i|ano|unsa|paano)\b/i.test(value);
  const cropAsked = !!crop && (cropQuestion && /\b(?:about|grow|growing|plant|planting|harvest|soil|sunlight|season|tanim|magtanim)\b/i.test(value)
    || /\b(?:almanac|guide|tips|planting season|days to harvest|soil needs|sunlight needs)\b/i.test(value))
    || /\b(almanac|crop guide|growing guide|which crops?|what crops?)\b/i.test(value);
  if (!weatherAsked && !priceAsked && !cropAsked) return null;

  const sections: string[] = [];
  const displaySections: string[] = [];
  const cards: ChatDataCard[] = [];
  if (weatherAsked) {
    const today = phDateKey(now);
    const explicitDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(value)?.[0];
    const unsupportedDate = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{1,2}[/-]\d{1,2}\b/i.test(value);
    const requested = resolveScheduleDay(value, now) ?? explicitDate ?? (unsupportedDate ? null : today);
    if (!requested) {
      const missing = 'Weather — Davao del Sur: Please give the forecast date as YYYY-MM-DD, today, tomorrow, or a weekday.';
      sections.push(missing); displaySections.push(missing);
    }
    else {
      const day = content.weather.find(item => item.forecastDate === requested);
      const period: PeriodId | null = /\b(?:tonight|evening)\b/.test(value) ? 'evening'
        : periods.find(item => new RegExp(`\\b${item.id}\\b`).test(value))?.id ?? null;
      if (!day) {
        const missing = `Weather — Davao del Sur: No saved forecast for ${requested}. Available forecast dates: ${content.weather.map(item => item.forecastDate).join(', ') || 'none'}.`;
        sections.push(missing); displaySections.push(missing);
      }
      else {
        cards.push({ version: 1, kind: 'weather', day, period: period ?? (requested === today ? currentPeriod(now) : 'afternoon'), loadedAt: content.loadedAt.weather });
        displaySections.push(`Here’s the ${period ?? 'daily'} forecast for Davao del Sur on ${requested}.`);
        const selected = period ? periods.filter(item => item.id === period) : periods;
        const slots = selected.map(item => {
          const forecast = day.periods[item.id];
          return `${item.label}: ${conditions[forecast.condition]}, ${forecast.temperatureC}°C, rain chance ${forecast.rainChancePct}%, humidity ${forecast.humidityPct}%, wind ${forecast.windKph} km/h`;
        });
        sections.push(`Weather — Davao del Sur, ${requested} (PH). Low ${day.minTemperatureC}°C, high ${day.maxTemperatureC}°C. ${slots.join('; ')}. Forecast updated ${dateNote(day.updatedAt ?? content.loadedAt.weather)}.`);
      }
    }
  }
  if (priceAsked) {
    const matches = content.prices.filter(item => includesName(value, item.commodityName)
      || !!crop && (includesName(item.commodityName, crop.name) || includesName(item.commodityName, crop.localName)));
    const namedRequest = /\b(?:price|cost|presyo)\s+(?:of|for|ng)\s+([\w ]+)/i.exec(message)?.[1]?.trim();
    const requested = matches.length ? matches : namedRequest ? []
      : content.prices.slice().sort((a, b) => a.commodityName.localeCompare(b.commodityName)).slice(0, 10);
    if (!requested.length) {
      const missing = namedRequest && content.prices.length
        ? `Market prices — Davao del Sur: No saved price matches “${namedRequest}”.`
        : 'Market prices — Davao del Sur: No saved prices are available.';
      sections.push(missing); displaySections.push(missing);
    }
    else {
      cards.push({ version: 1, kind: 'prices', rows: requested, loadedAt: content.loadedAt.prices });
      displaySections.push(`Here are the saved ${matches.length ? 'matching' : 'market'} prices for Davao del Sur.${!matches.length && content.prices.length > 10 ? ' Showing the first 10 commodities.' : ''}`);
      const rows = requested.map(item => {
        const change = item.previousAmount ? (item.amount - item.previousAmount) / item.previousAmount * 100 : null;
        const movement = change === null ? '' : ` (${change > 0 ? '+' : ''}${change.toFixed(1)}% from previous price)`;
        return `${item.commodityName}: ${peso(item.amount)}${movement}; observed ${item.observedAt ?? 'date unavailable'}`;
      });
      sections.push(`Market prices — Davao del Sur. ${rows.join('; ')}. Saved data loaded ${dateNote(content.loadedAt.prices)}.${matches.length ? '' : content.prices.length > 10 ? ' Showing the first 10 commodities.' : ''}`);
    }
  }
  if (cropAsked) {
    if (!crop) {
      const season = /\b(?:wet|rainy)\s+season\b/.test(value) ? /\b(?:wet|rainy)\s+season\b/i
        : /\bdry\s+season\b/.test(value) ? /\bdry\s+season\b/i : null;
      const matches = crops.filter(item => !season || season.test(item.plantingSeason)).slice(0, 8);
      sections.push(matches.length
        ? `Almanac — ${season ? 'Crops listed for that season' : 'Available crops'}: ${matches.map(item => `${item.name} (${item.localName})`).join(', ')}. Name a crop for its growing details.`
        : 'Almanac: I could not find a crop listed for that season. Name a crop for its growing details.');
      displaySections.push(sections[sections.length - 1]);
    }
    else {
      cards.push({ version: 1, kind: 'crop', cropId: crop.id });
      displaySections.push(`Here’s the almanac guide for ${crop.name} (${crop.localName}).`);
      sections.push(`Almanac — ${crop.name} (${crop.localName}; ${crop.scientificName}). ${crop.summary} Planting season: ${crop.plantingSeason}. Harvest: ${crop.daysToHarvest}. Soil and water: ${crop.soilAndWater}. Sunlight: ${crop.sunlight}. Growing tips: ${crop.growingTips.join(' ')}`);
    }
  }
  const answer = sections.join('\n\n');
  const needsAI = /\b(?:should|can i|would|recommend|best way|how (?:do|can|should)|why|paano|unsaon)\b/i.test(value);
  return { answer, displayAnswer: displaySections.join('\n\n'), context: sections.map(section => section.slice(0, 600)).join('\n\n'), needsAI, cards };
}
