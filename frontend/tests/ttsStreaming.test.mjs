import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(file) {
  return readFile(path.resolve(file), "utf8");
}

test("api exposes websocket MediaSource streaming TTS with REST fallback left intact", async () => {
  const source = await readSource("src/lib/api.ts");

  assert.match(source, /export interface StreamingSpeechPlayback/);
  assert.match(source, /export async function playStreamingSpeech/);
  assert.match(source, /new WebSocket\(resolveWsUrl\("\/ws\/tts"\)\)/);
  assert.match(source, /new MediaSource\(\)/);
  assert.match(source, /MediaSource\.isTypeSupported\("audio\/mpeg"\)/);
  assert.match(source, /sourceBuffer\.appendBuffer/);
  assert.match(source, /export async function synthesizeSpeech/);
});

test("narrative and companion voices try streaming before legacy whole-file TTS", async () => {
  const narrative = await readSource("src/components/NarrativeCard.tsx");
  const companion = await readSource("src/lib/companionVoice.ts");

  assert.match(narrative, /playStreamingSpeech\(result\.narrative,\s*result\.emotion\)/);
  assert.match(narrative, /await synthesizeSpeech\(result\.narrative,\s*result\.emotion\)/);
  assert.match(companion, /playStreamingSpeech\(clean,\s*emotion,\s*voice \?\? undefined\)/);
  assert.match(companion, /await synthesizeSpeech\(clean,\s*emotion,\s*voice \?\? undefined\)/);
});

test("streaming TTS detaches audio before revoking the MediaSource object URL", async () => {
  const source = await readSource("src/lib/api.ts");

  assert.match(source, /let objectUrlActive = true/);
  assert.match(source, /audio\.removeAttribute\("src"\)/);
  assert.match(source, /audio\.load\(\)/);

  const detachIndex = source.indexOf('audio.removeAttribute("src")');
  const revokeIndex = source.indexOf("URL.revokeObjectURL(objectUrl)");
  assert.ok(detachIndex > -1 && revokeIndex > -1 && detachIndex < revokeIndex);
});
