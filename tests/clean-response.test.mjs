import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanResponse } from '../src/chat/clean-response.ts';

test('preserves clean Bisaya text with no translation', () => {
  const input = `## Pag-atiman sa Kamatis\n\n1. Tubigi matag buntag.\n2. Butangi og abono.`;
  assert.equal(cleanResponse(input), input);
});

test('preserves clean English text with no translation', () => {
  const input = `## Tomato Care\n\n1. Water every morning.\n2. Apply 14-14-14 complete fertilizer.`;
  assert.equal(cleanResponse(input), input);
});

test('strips trailing English Translation header with markdown heading', () => {
  const input = `## Pagtanom og Talong\n\nIbutang ang liso sa tabunok nga yuta.\n\n## English Translation\n\nPlant the seeds in fertile soil.`;
  const expected = `## Pagtanom og Talong\n\nIbutang ang liso sa tabunok nga yuta.`;
  assert.equal(cleanResponse(input), expected);
});

test('strips trailing bold English Translation label', () => {
  const input = `Maayong adlaw! Unsay akong ikaabag kanimo karon?\n\n**English Translation:**\nGood day! How can I help you today?`;
  const expected = `Maayong adlaw! Unsay akong ikaabag kanimo karon?`;
  assert.equal(cleanResponse(input), expected);
});

test('strips trailing parenthesized Translation block', () => {
  const input = `Ayaw palabii og bubo og tubig ang binhi.\n\n(Translation: Do not overwater the seedlings.)`;
  const expected = `Ayaw palabii og bubo og tubig ang binhi.`;
  assert.equal(cleanResponse(input), expected);
});

test('strips trailing translation preceded by horizontal rule', () => {
  const input = `Ipalayo sa mga peste gamit ang organic spray.\n\n---\nEnglish Version:\nKeep pests away using organic spray.`;
  const expected = `Ipalayo sa mga peste gamit ang organic spray.`;
  assert.equal(cleanResponse(input), expected);
});
