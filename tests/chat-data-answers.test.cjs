const { test } = require('node:test');
const assert = require('node:assert/strict');
const { answerDataQuestion } = require('../src/chat/data-answers.ts');
const { calculatePricesTableWidths } = require('../src/others/content-model.ts');

const now = Date.parse('2026-09-25T00:00:00Z');
const period = { condition: 'rainy', temperatureC: 27, rainChancePct: 80, humidityPct: 88, windKph: 12, overridden: false };
const content = {
  prices: [{ id: 'eggplant', commodityName: 'Eggplant', category: 'vegetable', amount: 75,
    previousAmount: 60, observedAt: '2026-09-24' }],
  weather: [{ schemaVersion: 2, locationCode: 'davao-del-sur', timezone: 'Asia/Manila', isActive: true,
    forecastDate: '2026-09-26', minTemperatureC: 27, maxTemperatureC: 27,
    periods: { midnight: period, morning: period, lunch: period, afternoon: period, evening: period },
    updatedAt: now }],
  revisions: { prices: 1, weather: 1 }, loadedAt: { prices: now, weather: now },
};
const crops = [{ id: 'kamatis', name: 'Tomato', localName: 'Kamatis', scientificName: 'Solanum lycopersicum',
  summary: 'A fruiting crop.', plantingSeason: 'Year-round', daysToHarvest: '70 days',
  soilAndWater: 'Well-drained soil', sunlight: 'Full sun', growingTips: ['Stake plants.'] },
{ id: 'talong', name: 'Eggplant', localName: 'Talong', scientificName: 'Solanum melongena',
  summary: 'A vegetable crop.', plantingSeason: 'Year-round', daysToHarvest: '80 days',
  soilAndWater: 'Well-drained soil', sunlight: 'Full sun', growingTips: ['Mulch plants.'] }];

test('chat answers weather and prices from saved records with provenance', () => {
  const weather = answerDataQuestion('Will it rain tomorrow afternoon?', content, crops, now);
  assert.match(weather.answer, /Davao del Sur, 2026-09-26/);
  assert.match(weather.answer, /Afternoon: Rainy, 27°C, rain chance 80%/);
  assert.doesNotMatch(weather.answer, /Morning:/);
  assert.equal(weather.needsAI, false);
  assert.deepEqual(weather.cards.map(card => card.kind), ['weather']);
  assert.equal(weather.cards[0].period, 'afternoon');
  assert.match(weather.displayAnswer, /forecast for Davao del Sur/);
  assert.doesNotMatch(weather.displayAnswer, /humidity 88%/);
  const price = answerDataQuestion('What is the price of Eggplant?', content, crops, now);
  assert.match(price.answer, /Eggplant: ₱75\.00/);
  assert.match(price.answer, /observed 2026-09-24/);
  assert.match(price.answer, /\+25\.0%/);
  assert.deepEqual(price.cards.map(card => card.kind), ['prices']);
  assert.equal(price.cards[0].rows[0].commodityName, 'Eggplant');
  assert.match(answerDataQuestion('Presyo ng talong?', content, crops, now).answer, /Eggplant: ₱75\.00/);
  assert.match(answerDataQuestion('What is the price of Dragonfruit?', content, crops, now).answer,
    /No saved price matches/);
});

test('chat uses local almanac facts and reports missing forecasts', () => {
  const guide = answerDataQuestion('Tell me about kamatis', content, crops, now);
  assert.match(guide.answer, /Tomato \(Kamatis/);
  assert.match(guide.answer, /Stake plants/);
  assert.deepEqual(guide.cards, [{ version: 1, kind: 'crop', cropId: 'kamatis' }]);
  assert.match(answerDataQuestion('What crops are in the almanac?', content, crops, now).answer,
    /Available crops: Tomato \(Kamatis\)/);
  const advice = answerDataQuestion('Should I plant tomatoes tomorrow?', content, crops, now);
  assert.equal(advice.needsAI, true);
  assert.match(advice.context, /Weather — Davao del Sur/);
  assert.match(advice.context, /Almanac — Tomato/);
  assert.deepEqual(advice.cards.map(card => card.kind), ['weather', 'crop']);
  const unavailable = answerDataQuestion('Weather on 2026-10-10?', content, crops, now);
  assert.match(unavailable.answer, /No saved forecast for 2026-10-10/);
  assert.deepEqual(unavailable.cards, []);
  assert.equal(answerDataQuestion('Remind me to plant tomatoes tomorrow at 6 AM', content, crops, now), null);
  assert.equal(answerDataQuestion('Hello there', content, crops, now), null);
});

test('a combined data request creates cards in answer order', () => {
  const answer = answerDataQuestion('Show weather tomorrow, market prices, and the almanac for kamatis', content, crops, now);
  assert.deepEqual(answer.cards.map(card => card.kind), ['weather', 'prices', 'crop']);
  assert.equal(answer.cards[2].cropId, 'kamatis');
});

test('calculatePricesTableWidths produces compact, content-aware column widths', () => {
  const widths = calculatePricesTableWidths(content.prices);
  assert.ok(widths.product <= 130 && widths.product >= 96);
  assert.ok(widths.category <= 88 && widths.category >= 68);
  assert.ok(widths.price <= 88 && widths.price >= 70);
  assert.ok(widths.change <= 135 && widths.change >= 92);
  assert.ok(widths.total < 380, `Expected total ${widths.total} to be < 380`);
});
