import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  DEFAULT_PET_VOICE_CONFIG,
  type DesktopPetTaskStatus,
  type DesktopPetVoiceReadyPayload,
  isPetVoiceTtsModel,
  normalizePetVoiceConfig,
  PetVariant,
  type PetVariant as PetVariantType,
  PetVoiceAuthMode,
  type PetVoiceConfig,
  type PetVoiceProfile,
  PetVoiceProvider,
  PetVoiceSource,
  type PetVoiceTtsModel,
  PetVoiceTtsModel as PetVoiceTtsModelValue,
} from '../../shared/pet/constants';

const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const MINIMAX_UPLOAD_PATH = '/v1/files/upload';
const MINIMAX_CLONE_PATH = '/v1/voice_clone';
const MINIMAX_TTS_PATH = '/v1/t2a_v2';
const LOCAL_TTS_SPEECH_PATH = '/v1/audio/speech';

const AUDIO_EXTENSIONS: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

type MiniMaxBaseResponse = {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
};

type MiniMaxFileUploadResponse = MiniMaxBaseResponse & {
  file?: {
    file_id?: string;
  };
};

type MiniMaxTtsResponse = MiniMaxBaseResponse & {
  data?: {
    audio?: string;
    status?: number;
    url?: string;
  };
};

export interface DesktopPetVoiceRuntimeConfig {
  voiceConfig?: PetVoiceConfig;
  modelProviderApiKey?: string;
}

export interface ClonePetVoiceInput extends DesktopPetVoiceRuntimeConfig {
  variant: PetVariantType;
  cloneAudioPath: string;
  promptAudioPath?: string | null;
  promptText?: string;
  displayName?: string;
  text?: string;
}

export interface SynthesizePetVoiceInput extends DesktopPetVoiceRuntimeConfig {
  variant: PetVariantType;
  text: string;
  profile?: PetVoiceProfile | null;
  status?: DesktopPetTaskStatus;
  sessionId?: string;
  tempDir: string;
}

export const getPetVoiceProfileForVariant = (
  config: PetVoiceConfig,
  variant: PetVariantType,
): PetVoiceProfile | null => {
  return config.voiceProfilesByVariant[variant]
    ?? config.voiceProfilesByVariant[PetVariant.WeSightAgent]
    ?? null;
};

export const generateMiniMaxVoiceId = (variant: PetVariantType, now = Date.now()): string => {
  const suffix = String(now).slice(-12);
  const normalizedVariant = variant.replace(/[^a-zA-Z0-9_]/g, '_');
  return `wspet_${normalizedVariant}_${suffix}`;
};

export const validateMiniMaxAudioFile = async (filePath: string): Promise<{ mimeType: string; size: number }> => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = AUDIO_EXTENSIONS[ext];
  if (!mimeType) {
    throw new Error('MiniMax voice cloning only supports mp3, m4a, or wav files.');
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('The selected voice file is not a regular file.');
  }
  if (stat.size > MAX_AUDIO_SIZE_BYTES) {
    throw new Error('The selected voice file is larger than 20MB.');
  }
  return { mimeType, size: stat.size };
};

const normalizeMiniMaxBaseUrl = (value: string): string => {
  const baseUrl = value.trim().replace(/\/+$/, '');
  return baseUrl || DEFAULT_PET_VOICE_CONFIG.baseUrl;
};

const normalizeLocalTtsSpeechUrl = (value: string): string => {
  const baseUrl = value.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Local TTS Base URL is required.');
  }
  if (baseUrl.endsWith(LOCAL_TTS_SPEECH_PATH)) {
    return baseUrl;
  }
  return `${baseUrl}${LOCAL_TTS_SPEECH_PATH}`;
};

const resolveMiniMaxApiKey = (
  voiceConfig: PetVoiceConfig,
  modelProviderApiKey?: string,
): string => {
  if (voiceConfig.authMode === PetVoiceAuthMode.ReuseModelProvider) {
    return (modelProviderApiKey ?? '').trim();
  }
  return voiceConfig.apiKey.trim();
};

const readResponseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MiniMax returned a non-JSON response with HTTP ${response.status}.`);
  }
};

const assertMiniMaxSuccess = <T extends MiniMaxBaseResponse>(data: T, fallbackMessage: string): T => {
  const code = data.base_resp?.status_code ?? 0;
  if (code !== 0) {
    throw new Error(data.base_resp?.status_msg || fallbackMessage);
  }
  return data;
};

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const readResponseErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
  const text = await response.text().catch(() => '');
  if (!text) {
    return `${fallbackMessage} HTTP ${response.status}.`;
  }
  try {
    const data = JSON.parse(text) as {
      error?: string | { message?: string };
      message?: string;
      base_resp?: { status_msg?: string };
    };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (
      data.error
      && typeof data.error === 'object'
      && typeof data.error.message === 'string'
      && data.error.message.trim()
    ) {
      return data.error.message.trim();
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
    if (typeof data.base_resp?.status_msg === 'string' && data.base_resp.status_msg.trim()) {
      return data.base_resp.status_msg.trim();
    }
  } catch {
    // Fall through to the raw body below.
  }
  return text.slice(0, 300);
};

const uploadMiniMaxFile = async (
  baseUrl: string,
  apiKey: string,
  filePath: string,
  purpose: 'voice_clone' | 'prompt_audio',
): Promise<string> => {
  const { mimeType } = await validateMiniMaxAudioFile(filePath);
  const buffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('purpose', purpose);
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), path.basename(filePath));

  const response = await fetchWithTimeout(`${baseUrl}${MINIMAX_UPLOAD_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`MiniMax file upload failed with HTTP ${response.status}.`);
  }

  const data = assertMiniMaxSuccess(
    await readResponseJson(response) as MiniMaxFileUploadResponse,
    'MiniMax file upload failed.',
  );
  const fileId = data.file?.file_id;
  if (!fileId) {
    throw new Error('MiniMax file upload did not return a file_id.');
  }
  return fileId;
};

const callMiniMaxVoiceClone = async (
  baseUrl: string,
  apiKey: string,
  input: {
    fileId: string;
    voiceId: string;
    promptAudioFileId?: string;
    promptText?: string;
  },
): Promise<void> => {
  const payload: Record<string, unknown> = {
    file_id: input.fileId,
    voice_id: input.voiceId,
  };

  if (input.promptAudioFileId || input.promptText?.trim()) {
    payload.clone_prompt = {
      ...(input.promptAudioFileId ? { prompt_audio: input.promptAudioFileId } : {}),
      ...(input.promptText?.trim() ? { prompt_text: input.promptText.trim() } : {}),
    };
  }

  const response = await fetchWithTimeout(`${baseUrl}${MINIMAX_CLONE_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`MiniMax voice clone failed with HTTP ${response.status}.`);
  }
  assertMiniMaxSuccess(await readResponseJson(response) as MiniMaxBaseResponse, 'MiniMax voice clone failed.');
};

const ensureVoiceCacheDir = async (tempDir: string): Promise<string> => {
  const cacheDir = path.join(tempDir, 'wesight-pet-voice');
  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
};

const writeAudioBuffer = async (tempDir: string, buffer: Buffer, ext = 'mp3'): Promise<string> => {
  const cacheDir = await ensureVoiceCacheDir(tempDir);
  const filePath = path.join(cacheDir, `${Date.now()}-${randomUUID()}.${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
};

const audioFileToDataUrl = async (audioPath: string): Promise<string | undefined> => {
  try {
    const buffer = await fs.readFile(audioPath);
    return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
};

const downloadAudioUrl = async (url: string, tempDir: string): Promise<string> => {
  const response = await fetchWithTimeout(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`MiniMax audio download failed with HTTP ${response.status}.`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return writeAudioBuffer(tempDir, Buffer.from(arrayBuffer), 'mp3');
};

const synthesizeMiniMaxTts = async (
  baseUrl: string,
  apiKey: string,
  input: {
    text: string;
    voiceId: string;
    model: PetVoiceTtsModel;
    speed: number;
    volume: number;
    tempDir: string;
  },
): Promise<string> => {
  const response = await fetchWithTimeout(`${baseUrl}${MINIMAX_TTS_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      text: input.text,
      stream: false,
      voice_setting: {
        voice_id: input.voiceId,
        speed: input.speed,
        vol: input.volume,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MiniMax speech synthesis failed with HTTP ${response.status}.`);
  }

  const data = assertMiniMaxSuccess(
    await readResponseJson(response) as MiniMaxTtsResponse,
    'MiniMax speech synthesis failed.',
  );
  const audioUrl = data.data?.url;
  if (audioUrl) {
    return downloadAudioUrl(audioUrl, input.tempDir);
  }

  const audioHex = data.data?.audio;
  if (!audioHex) {
    throw new Error('MiniMax speech synthesis did not return audio data.');
  }
  return writeAudioBuffer(input.tempDir, Buffer.from(audioHex, 'hex'), 'mp3');
};

const synthesizeLocalTts = async (
  url: string,
  apiKey: string,
  input: {
    text: string;
    voiceId: string;
    model: string;
    speed: number;
    tempDir: string;
  },
): Promise<string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      voice: input.voiceId,
      input: input.text,
      response_format: 'mp3',
      speed: input.speed,
    }),
  });

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, 'Local TTS speech synthesis failed.'));
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json') || contentType.startsWith('text/')) {
    throw new Error(await readResponseErrorMessage(response, 'Local TTS returned a non-audio response.'));
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error('Local TTS returned empty audio data.');
  }
  return writeAudioBuffer(input.tempDir, Buffer.from(arrayBuffer), 'mp3');
};

export const cloneMiniMaxPetVoice = async (input: ClonePetVoiceInput): Promise<PetVoiceProfile> => {
  const voiceConfig = normalizePetVoiceConfig(input.voiceConfig);
  const apiKey = resolveMiniMaxApiKey(voiceConfig, input.modelProviderApiKey);
  if (!apiKey) {
    throw new Error('MiniMax API key is required for pet voice cloning.');
  }

  const baseUrl = normalizeMiniMaxBaseUrl(voiceConfig.baseUrl);
  const voiceId = generateMiniMaxVoiceId(input.variant);
  const fileId = await uploadMiniMaxFile(baseUrl, apiKey, input.cloneAudioPath, 'voice_clone');
  const promptAudioFileId = input.promptAudioPath
    ? await uploadMiniMaxFile(baseUrl, apiKey, input.promptAudioPath, 'prompt_audio')
    : undefined;

  await callMiniMaxVoiceClone(baseUrl, apiKey, {
    fileId,
    voiceId,
    promptAudioFileId,
    promptText: input.promptText,
  });

  const displayName = input.displayName?.trim() || `Pet Voice ${new Date().toISOString().slice(0, 10)}`;
  return {
    voiceId,
    displayName,
    source: PetVoiceSource.Cloned,
    model: voiceConfig.model,
    speed: voiceConfig.speed,
    volume: voiceConfig.volume,
    createdAt: Date.now(),
  };
};

export const synthesizeMiniMaxPetVoice = async (
  input: SynthesizePetVoiceInput,
): Promise<DesktopPetVoiceReadyPayload> => {
  const voiceConfig = normalizePetVoiceConfig(input.voiceConfig);
  const apiKey = resolveMiniMaxApiKey(voiceConfig, input.modelProviderApiKey);
  if (!apiKey) {
    throw new Error('MiniMax API key is required for pet speech synthesis.');
  }

  const profile = input.profile ?? getPetVoiceProfileForVariant(voiceConfig, input.variant);
  if (!profile) {
    throw new Error('No voice profile is configured for the selected pet.');
  }
  const model: PetVoiceTtsModel = isPetVoiceTtsModel(profile.model)
    ? profile.model
    : isPetVoiceTtsModel(voiceConfig.model)
      ? voiceConfig.model
      : PetVoiceTtsModelValue.Speech28Hd;

  const audioPath = await synthesizeMiniMaxTts(normalizeMiniMaxBaseUrl(voiceConfig.baseUrl), apiKey, {
    text: input.text,
    voiceId: profile.voiceId,
    model,
    speed: profile.speed || voiceConfig.speed,
    volume: profile.volume || voiceConfig.volume,
    tempDir: input.tempDir,
  });

  return {
    audioPath,
    audioDataUrl: await audioFileToDataUrl(audioPath),
    text: input.text,
    variant: input.variant,
    status: input.status,
    sessionId: input.sessionId,
  };
};

export const synthesizeLocalPetVoice = async (
  input: SynthesizePetVoiceInput,
): Promise<DesktopPetVoiceReadyPayload> => {
  const voiceConfig = normalizePetVoiceConfig(input.voiceConfig);
  const profile = input.profile ?? getPetVoiceProfileForVariant(voiceConfig, input.variant);
  if (!profile) {
    throw new Error('No voice profile is configured for the selected pet.');
  }

  const audioPath = await synthesizeLocalTts(normalizeLocalTtsSpeechUrl(voiceConfig.baseUrl), voiceConfig.apiKey, {
    text: input.text,
    voiceId: profile.voiceId,
    model: profile.model || voiceConfig.model,
    speed: profile.speed || voiceConfig.speed,
    tempDir: input.tempDir,
  });

  return {
    audioPath,
    audioDataUrl: await audioFileToDataUrl(audioPath),
    text: input.text,
    variant: input.variant,
    status: input.status,
    sessionId: input.sessionId,
  };
};

export const synthesizePetVoice = async (
  input: SynthesizePetVoiceInput,
): Promise<DesktopPetVoiceReadyPayload> => {
  const voiceConfig = normalizePetVoiceConfig(input.voiceConfig);
  if (voiceConfig.provider === PetVoiceProvider.LocalTts) {
    return synthesizeLocalPetVoice({
      ...input,
      voiceConfig,
    });
  }
  return synthesizeMiniMaxPetVoice({
    ...input,
    voiceConfig,
  });
};
