import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PET_VOICE_CONFIG,
  LOCAL_TTS_DEFAULT_BASE_URL,
  LOCAL_TTS_DEFAULT_MODEL,
  LOCAL_TTS_DEFAULT_VOICE_ID,
  normalizePetConfig,
  normalizePetVoiceConfig,
  PetVariant,
  PetVoiceAuthMode,
  PetVoiceProvider,
  PetVoiceSource,
  PetVoiceTtsModel,
} from './constants';

describe('pet voice config normalization', () => {
  it('normalizes defaults and keeps the default WeSight voice profile', () => {
    const config = normalizePetVoiceConfig(null);

    expect(config.enabled).toBe(false);
    expect(config.authMode).toBe(PetVoiceAuthMode.ReuseModelProvider);
    expect(config.model).toBe(PetVoiceTtsModel.Speech28Hd);
    expect(config.voiceProfilesByVariant[PetVariant.WeSightAgent]?.voiceId).toBe('male-qn-qingse');
  });

  it('clamps speed and volume while preserving per-pet cloned voices', () => {
    const config = normalizePetVoiceConfig({
      enabled: true,
      authMode: PetVoiceAuthMode.PetApiKey,
      speed: 9,
      volume: -1,
      voiceProfilesByVariant: {
        [PetVariant.BlueBot]: {
          voiceId: 'custom-blue',
          displayName: 'Blue Voice',
          source: PetVoiceSource.Cloned,
          model: PetVoiceTtsModel.Speech26Turbo,
          speed: 3,
          volume: 0,
          createdAt: 123,
        },
      },
    });

    expect(config.speed).toBe(2);
    expect(config.volume).toBe(0.1);
    expect(config.voiceProfilesByVariant[PetVariant.BlueBot]).toMatchObject({
      voiceId: 'custom-blue',
      displayName: 'Blue Voice',
      source: PetVoiceSource.Cloned,
      model: PetVoiceTtsModel.Speech26Turbo,
      speed: 2,
      volume: 0.1,
      createdAt: 123,
    });
  });

  it('normalizes voice together with the desktop pet config', () => {
    const config = normalizePetConfig({
      enabled: true,
      variant: PetVariant.AstroBot,
      voice: {
        ...DEFAULT_PET_VOICE_CONFIG,
        enabled: true,
        apiKey: 'pet-key',
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.variant).toBe(PetVariant.AstroBot);
    expect(config.voice.enabled).toBe(true);
    expect(config.voice.apiKey).toBe('pet-key');
  });

  it('normalizes local TTS custom config with optional API key', () => {
    const config = normalizePetVoiceConfig({
      enabled: true,
      provider: PetVoiceProvider.LocalTts,
      apiKey: '',
      baseUrl: ' http://127.0.0.1:9000/ ',
      model: '',
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
    });

    expect(config.provider).toBe(PetVoiceProvider.LocalTts);
    expect(config.apiKey).toBe('');
    expect(config.baseUrl).toBe('http://127.0.0.1:9000');
    expect(config.model).toBe(LOCAL_TTS_DEFAULT_MODEL);
    expect(config.voiceProfilesByVariant[PetVariant.WeSightAgent]?.voiceId).toBe(LOCAL_TTS_DEFAULT_VOICE_ID);
  });

  it('uses local TTS defaults when no custom base URL is provided', () => {
    const config = normalizePetVoiceConfig({
      provider: PetVoiceProvider.LocalTts,
    });

    expect(config.baseUrl).toBe(LOCAL_TTS_DEFAULT_BASE_URL);
    expect(config.model).toBe(LOCAL_TTS_DEFAULT_MODEL);
  });
});
