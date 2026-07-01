import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PET_VOICE_CONFIG,
  LOCAL_TTS_DEFAULT_MODEL,
  LOCAL_TTS_DEFAULT_VOICE_ID,
  PetVariant,
  PetVoiceProvider,
  PetVoiceSource,
} from '../../shared/pet/constants';
import { generateMiniMaxVoiceId, synthesizeLocalPetVoice, validateMiniMaxAudioFile } from './desktopPetVoiceService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop pet MiniMax voice helpers', () => {
  it('generates MiniMax-compatible voice ids', () => {
    const voiceId = generateMiniMaxVoiceId(PetVariant.WeSightAgent, 1_786_800_000_000);

    expect(voiceId).toMatch(/^[A-Za-z][A-Za-z0-9_-]+[A-Za-z0-9_]$/);
    expect(voiceId).toContain('wesight_agent');
  });

  it('accepts supported audio files up to 20MB', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wesight-pet-voice-test-'));
    const audioPath = path.join(tempDir, 'sample.mp3');
    await fs.writeFile(audioPath, Buffer.from([1, 2, 3]));

    const result = await validateMiniMaxAudioFile(audioPath);

    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.size).toBe(3);
  });

  it('rejects unsupported audio extensions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wesight-pet-voice-test-'));
    const audioPath = path.join(tempDir, 'sample.txt');
    await fs.writeFile(audioPath, 'hello');

    await expect(validateMiniMaxAudioFile(audioPath)).rejects.toThrow(/mp3, m4a, or wav/);
  });

  it('synthesizes local TTS audio without requiring an API key', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wesight-local-tts-test-'));

    const result = await synthesizeLocalPetVoice({
      variant: PetVariant.WeSightAgent,
      text: 'hello',
      tempDir,
      voiceConfig: {
        ...DEFAULT_PET_VOICE_CONFIG,
        provider: PetVoiceProvider.LocalTts,
        apiKey: '',
        baseUrl: 'http://127.0.0.1:9000',
        model: LOCAL_TTS_DEFAULT_MODEL,
        voiceProfilesByVariant: {
          [PetVariant.WeSightAgent]: {
            voiceId: LOCAL_TTS_DEFAULT_VOICE_ID,
            displayName: 'Local Voice',
            source: PetVoiceSource.System,
            model: LOCAL_TTS_DEFAULT_MODEL,
            speed: 1,
            volume: 1,
            createdAt: 0,
          },
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9000/v1/audio/speech');
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: LOCAL_TTS_DEFAULT_MODEL,
      voice: LOCAL_TTS_DEFAULT_VOICE_ID,
      input: 'hello',
      response_format: 'mp3',
      speed: 1,
    });
    expect(await fs.readFile(result.audioPath)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('sends Authorization for local TTS when a key is configured', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from([4, 5, 6]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wesight-local-tts-test-'));

    await synthesizeLocalPetVoice({
      variant: PetVariant.WeSightAgent,
      text: 'hello',
      tempDir,
      voiceConfig: {
        ...DEFAULT_PET_VOICE_CONFIG,
        provider: PetVoiceProvider.LocalTts,
        apiKey: 'local-key',
        baseUrl: 'http://127.0.0.1:9000',
        model: LOCAL_TTS_DEFAULT_MODEL,
        voiceProfilesByVariant: {
          [PetVariant.WeSightAgent]: {
            voiceId: LOCAL_TTS_DEFAULT_VOICE_ID,
            displayName: 'Local Voice',
            source: PetVoiceSource.System,
            model: LOCAL_TTS_DEFAULT_MODEL,
            speed: 1,
            volume: 1,
            createdAt: 0,
          },
        },
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toHaveProperty('Authorization', 'Bearer local-key');
  });

  it('surfaces local TTS JSON errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'bad local token' },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wesight-local-tts-test-'));

    await expect(synthesizeLocalPetVoice({
      variant: PetVariant.WeSightAgent,
      text: 'hello',
      tempDir,
      voiceConfig: {
        ...DEFAULT_PET_VOICE_CONFIG,
        provider: PetVoiceProvider.LocalTts,
        baseUrl: 'http://127.0.0.1:9000',
        model: LOCAL_TTS_DEFAULT_MODEL,
        voiceProfilesByVariant: {
          [PetVariant.WeSightAgent]: {
            voiceId: LOCAL_TTS_DEFAULT_VOICE_ID,
            displayName: 'Local Voice',
            source: PetVoiceSource.System,
            model: LOCAL_TTS_DEFAULT_MODEL,
            speed: 1,
            volume: 1,
            createdAt: 0,
          },
        },
      },
    })).rejects.toThrow('bad local token');
  });
});
