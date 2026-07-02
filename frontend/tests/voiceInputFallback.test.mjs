import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(file) {
  return readFile(path.resolve(file), "utf8");
}

test("voice input degrades gracefully when browser speech service is unreachable", async () => {
  const source = await readSource("src/components/VoiceInputButton.tsx");

  assert.match(source, /function isServiceUnavailableError\(error: string\): boolean/);
  assert.match(source, /error === "network" \|\| error === "service-not-allowed"/);
  assert.match(source, /setServiceUnavailable\(true\)/);
  assert.match(source, /语音服务连不上，已切回文字输入/);
  assert.match(source, /浏览器语音连不上，改用服务端识别/);
  assert.match(source, />\s*重试\s*</);

  const errorBranch = source.indexOf("isServiceUnavailableError(event.error)");
  const degradedState = source.indexOf("setServiceUnavailable(true)", errorBranch);
  assert.ok(errorBranch > -1, "network/service errors should be detected in onerror");
  assert.ok(degradedState > errorBranch, "service-unavailable state should be set after detecting the error");
});

test("voice retry uses server-side speech recognition after browser service failure", async () => {
  const component = await readSource("src/components/VoiceInputButton.tsx");
  const serverSpeech = await readSource("src/lib/serverSpeech.ts");
  const api = await readSource("src/lib/api.ts");

  assert.match(component, /startServerFallback/);
  assert.match(component, /startServerSpeech/);
  assert.match(component, /onClick=\{\(\) => startServerFallback\(\)\}/);
  assert.match(component, /浏览器语音连不上，改用服务端识别/);
  assert.match(serverSpeech, /export async function startServerSpeech/);
  assert.match(serverSpeech, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(serverSpeech, /downsampleTo16k/);
  assert.match(serverSpeech, /floatTo16BitPcm/);
  assert.match(serverSpeech, /transcribeSpeech/);
  assert.match(api, /export async function transcribeSpeech/);
  assert.match(api, /\/api\/asr/);
});

test("server speech fallback streams microphone audio and live transcripts", async () => {
  const component = await readSource("src/components/VoiceInputButton.tsx");
  const serverSpeech = await readSource("src/lib/serverSpeech.ts");
  const api = await readSource("src/lib/api.ts");

  assert.match(serverSpeech, /export async function startRealtimeServerSpeech/);
  assert.match(serverSpeech, /onTranscript: \(text: string, final: boolean\) => void/);
  assert.match(serverSpeech, /socket\.send\(floatTo16BitPcm\(downsampled\)\)/);
  assert.match(serverSpeech, /event\.event === "transcript"/);
  assert.match(api, /export function resolveAsrWsUrl/);
  assert.match(api, /resolveWsUrl\("\/ws\/asr"\)/);
  assert.match(component, /startRealtimeServerSpeech/);
  assert.match(component, /正在实时识别/);
});
