export const PetVariant = {
  WeSightAgent: 'wesight_agent',
  BlueBot: 'blue_bot',
  AquaDrop: 'aqua_drop',
  FlameBuddy: 'flame_buddy',
  WoodBox: 'wood_box',
  SproutBox: 'sprout_box',
  StackBot: 'stack_bot',
  AstroBot: 'astro_bot',
  ShadowBot: 'shadow_bot',
  Nana: 'nana',
} as const;

export type PetVariant = typeof PetVariant[keyof typeof PetVariant];

export const PetMotion = {
  Calm: 'calm',
  Playful: 'playful',
} as const;

export type PetMotion = typeof PetMotion[keyof typeof PetMotion];

export const PetVoiceProvider = {
  MiniMax: 'minimax',
  LocalTts: 'local_tts',
} as const;

export type PetVoiceProvider = typeof PetVoiceProvider[keyof typeof PetVoiceProvider];

export const PetVoiceAuthMode = {
  ReuseModelProvider: 'reuse_model_provider',
  PetApiKey: 'pet_api_key',
} as const;

export type PetVoiceAuthMode = typeof PetVoiceAuthMode[keyof typeof PetVoiceAuthMode];

export const PetVoiceSource = {
  System: 'system',
  Cloned: 'cloned',
} as const;

export type PetVoiceSource = typeof PetVoiceSource[keyof typeof PetVoiceSource];

export const PetVoiceTtsModel = {
  Speech28Hd: 'speech-2.8-hd',
  Speech28Turbo: 'speech-2.8-turbo',
  Speech26Hd: 'speech-2.6-hd',
  Speech26Turbo: 'speech-2.6-turbo',
} as const;

export type PetVoiceTtsModel = typeof PetVoiceTtsModel[keyof typeof PetVoiceTtsModel];

export const PET_VOICE_TTS_MODELS = Object.values(PetVoiceTtsModel);

export const LOCAL_TTS_DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
export const LOCAL_TTS_DEFAULT_MODEL = 'tts-1';
export const LOCAL_TTS_DEFAULT_VOICE_ID = 'alloy';
export const LOCAL_TTS_DEFAULT_VOICE_NAME = 'Local Voice';

const LOCAL_TTS_DEFAULT_PROFILE: PetVoiceProfile = {
  voiceId: LOCAL_TTS_DEFAULT_VOICE_ID,
  displayName: LOCAL_TTS_DEFAULT_VOICE_NAME,
  source: PetVoiceSource.System,
  model: LOCAL_TTS_DEFAULT_MODEL,
  speed: 1,
  volume: 1,
  createdAt: 0,
};

export const PET_VOICE_SYSTEM_PROFILES = [
  {
    voiceId: 'male-qn-qingse',
    displayName: 'MiniMax Qingse',
  },
] as const;

export const DesktopPetIpcChannel = {
  GetConfig: 'desktopPet:getConfig',
  ApplyPreview: 'desktopPet:applyPreview',
  GetBounds: 'desktopPet:getBounds',
  SetPosition: 'desktopPet:setPosition',
  SetMouseInteractive: 'desktopPet:setMouseInteractive',
  OpenMainWindow: 'desktopPet:openMainWindow',
  GetTaskSnapshot: 'desktopPet:getTaskSnapshot',
  OpenTask: 'desktopPet:openTask',
  CloneVoice: 'desktopPet:cloneVoice',
  TestVoice: 'desktopPet:testVoice',
  ConfigChanged: 'desktopPet:configChanged',
  TaskChanged: 'desktopPet:taskChanged',
  OpenTaskRequested: 'desktopPet:openTaskRequested',
  VoiceReady: 'desktopPet:voiceReady',
} as const;

export type DesktopPetIpcChannel = typeof DesktopPetIpcChannel[keyof typeof DesktopPetIpcChannel];

export const DesktopPetTaskStatus = {
  Waiting: 'waiting',
  Thinking: 'thinking',
  Replying: 'replying',
  Coding: 'coding',
  Permission: 'permission',
  Completed: 'completed',
  Error: 'error',
  Stopped: 'stopped',
} as const;

export type DesktopPetTaskStatus = typeof DesktopPetTaskStatus[keyof typeof DesktopPetTaskStatus];

export const DesktopPetTaskSource = {
  Chat: 'chat',
  Im: 'im',
  Scheduled: 'scheduled',
} as const;

export type DesktopPetTaskSource = typeof DesktopPetTaskSource[keyof typeof DesktopPetTaskSource];

export interface DesktopPetTaskSnapshot {
  sessionId: string;
  title: string;
  projectName: string;
  source: DesktopPetTaskSource;
  status: DesktopPetTaskStatus;
  engineLabel: string;
  modelLabel: string;
  activityText: string;
  updatedAt: number;
}

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetVoiceProfile {
  voiceId: string;
  displayName: string;
  source: PetVoiceSource;
  model: string;
  speed: number;
  volume: number;
  createdAt: number;
}

export type PetVoiceProfilesByVariant = Partial<Record<PetVariant, PetVoiceProfile>>;

export interface PetVoiceConfig {
  enabled: boolean;
  provider: PetVoiceProvider;
  authMode: PetVoiceAuthMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  speed: number;
  volume: number;
  voiceProfilesByVariant: PetVoiceProfilesByVariant;
}

export interface PetConfig {
  enabled: boolean;
  variant: PetVariant;
  motion: PetMotion;
  position?: PetPosition | null;
  voice: PetVoiceConfig;
}

export interface DesktopPetVoiceReadyPayload {
  audioPath: string;
  audioDataUrl?: string;
  text: string;
  variant: PetVariant;
  status?: DesktopPetTaskStatus;
  sessionId?: string;
}

export interface DesktopPetCloneVoiceInput {
  variant: PetVariant;
  voiceConfig?: PetVoiceConfig;
  modelProviderApiKey?: string;
  cloneAudioPath: string;
  promptAudioPath?: string | null;
  promptText?: string;
  displayName?: string;
}

export interface DesktopPetCloneVoiceResult {
  success: boolean;
  profile?: PetVoiceProfile;
  error?: string;
}

export interface DesktopPetTestVoiceInput {
  variant: PetVariant;
  voiceConfig?: PetVoiceConfig;
  modelProviderApiKey?: string;
  text?: string;
}

export interface DesktopPetTestVoiceResult {
  success: boolean;
  audioPath?: string;
  audioDataUrl?: string;
  error?: string;
}

export const DEFAULT_PET_VOICE_CONFIG: PetVoiceConfig = {
  enabled: false,
  provider: PetVoiceProvider.MiniMax,
  authMode: PetVoiceAuthMode.ReuseModelProvider,
  apiKey: '',
  baseUrl: 'https://api.minimaxi.com',
  model: PetVoiceTtsModel.Speech28Hd,
  speed: 1,
  volume: 1,
  voiceProfilesByVariant: {
    [PetVariant.WeSightAgent]: {
      voiceId: PET_VOICE_SYSTEM_PROFILES[0].voiceId,
      displayName: PET_VOICE_SYSTEM_PROFILES[0].displayName,
      source: PetVoiceSource.System,
      model: PetVoiceTtsModel.Speech28Hd,
      speed: 1,
      volume: 1,
      createdAt: 0,
    },
  },
};

export const DEFAULT_PET_CONFIG: PetConfig = {
  enabled: false,
  variant: PetVariant.WeSightAgent,
  motion: PetMotion.Calm,
  position: null,
  voice: DEFAULT_PET_VOICE_CONFIG,
};

export const isPetVariant = (value: unknown): value is PetVariant => {
  return typeof value === 'string' && Object.values(PetVariant).includes(value as PetVariant);
};

export const isPetMotion = (value: unknown): value is PetMotion => {
  return typeof value === 'string' && Object.values(PetMotion).includes(value as PetMotion);
};

export const isPetVoiceAuthMode = (value: unknown): value is PetVoiceAuthMode => {
  return typeof value === 'string' && Object.values(PetVoiceAuthMode).includes(value as PetVoiceAuthMode);
};

export const isPetVoiceProvider = (value: unknown): value is PetVoiceProvider => {
  return typeof value === 'string' && Object.values(PetVoiceProvider).includes(value as PetVoiceProvider);
};

export const isPetVoiceSource = (value: unknown): value is PetVoiceSource => {
  return typeof value === 'string' && Object.values(PetVoiceSource).includes(value as PetVoiceSource);
};

export const isPetVoiceTtsModel = (value: unknown): value is PetVoiceTtsModel => {
  return typeof value === 'string' && Object.values(PetVoiceTtsModel).includes(value as PetVoiceTtsModel);
};

const normalizePetPosition = (value: unknown): PetPosition | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PetPosition>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    return null;
  }
  return {
    x: Math.round(candidate.x!),
    y: Math.round(candidate.y!),
  };
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Number(value)));
};

export const normalizePetVoiceProfile = (profile: unknown): PetVoiceProfile | null => {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const candidate = profile as Partial<PetVoiceProfile>;
  const voiceId = typeof candidate.voiceId === 'string' ? candidate.voiceId.trim() : '';
  if (!voiceId) {
    return null;
  }
  const displayName = typeof candidate.displayName === 'string' && candidate.displayName.trim()
    ? candidate.displayName.trim()
    : voiceId;
  const model = typeof candidate.model === 'string' && candidate.model.trim()
    ? candidate.model.trim()
    : DEFAULT_PET_VOICE_CONFIG.model;
  return {
    voiceId,
    displayName,
    source: isPetVoiceSource(candidate.source) ? candidate.source : PetVoiceSource.System,
    model,
    speed: clampNumber(candidate.speed, DEFAULT_PET_VOICE_CONFIG.speed, 0.5, 2),
    volume: clampNumber(candidate.volume, DEFAULT_PET_VOICE_CONFIG.volume, 0.1, 2),
    createdAt: Number.isFinite(candidate.createdAt) ? Math.max(0, Math.round(Number(candidate.createdAt))) : Date.now(),
  };
};

export const normalizePetVoiceConfig = (config?: Partial<PetVoiceConfig> | null): PetVoiceConfig => {
  const provider = isPetVoiceProvider(config?.provider) ? config.provider : DEFAULT_PET_VOICE_CONFIG.provider;
  const fallbackBaseUrl = provider === PetVoiceProvider.LocalTts
    ? LOCAL_TTS_DEFAULT_BASE_URL
    : DEFAULT_PET_VOICE_CONFIG.baseUrl;
  const fallbackModel = provider === PetVoiceProvider.LocalTts
    ? LOCAL_TTS_DEFAULT_MODEL
    : DEFAULT_PET_VOICE_CONFIG.model;
  const normalizedProfiles: PetVoiceProfilesByVariant = {};
  const profiles = config?.voiceProfilesByVariant;
  if (profiles && typeof profiles === 'object') {
    Object.entries(profiles).forEach(([variant, profile]) => {
      if (!isPetVariant(variant)) return;
      const normalizedProfile = normalizePetVoiceProfile(profile);
      if (normalizedProfile) {
        normalizedProfiles[variant] = normalizedProfile;
      }
    });
  }

  return {
    enabled: typeof config?.enabled === 'boolean' ? config.enabled : DEFAULT_PET_VOICE_CONFIG.enabled,
    provider,
    authMode: isPetVoiceAuthMode(config?.authMode) ? config.authMode : DEFAULT_PET_VOICE_CONFIG.authMode,
    apiKey: typeof config?.apiKey === 'string' ? config.apiKey : DEFAULT_PET_VOICE_CONFIG.apiKey,
    baseUrl: typeof config?.baseUrl === 'string' && config.baseUrl.trim()
      ? config.baseUrl.trim().replace(/\/+$/, '')
      : fallbackBaseUrl,
    model: typeof config?.model === 'string' && config.model.trim()
      ? config.model.trim()
      : fallbackModel,
    speed: clampNumber(config?.speed, DEFAULT_PET_VOICE_CONFIG.speed, 0.5, 2),
    volume: clampNumber(config?.volume, DEFAULT_PET_VOICE_CONFIG.volume, 0.1, 2),
    voiceProfilesByVariant: {
      ...(provider === PetVoiceProvider.LocalTts
        ? { [PetVariant.WeSightAgent]: LOCAL_TTS_DEFAULT_PROFILE }
        : DEFAULT_PET_VOICE_CONFIG.voiceProfilesByVariant),
      ...normalizedProfiles,
    },
  };
};

export const normalizePetConfig = (config?: Partial<PetConfig> | null): PetConfig => ({
  enabled: typeof config?.enabled === 'boolean' ? config.enabled : DEFAULT_PET_CONFIG.enabled,
  variant: isPetVariant(config?.variant) ? config.variant : DEFAULT_PET_CONFIG.variant,
  motion: isPetMotion(config?.motion) ? config.motion : DEFAULT_PET_CONFIG.motion,
  position: normalizePetPosition(config?.position),
  voice: normalizePetVoiceConfig(config?.voice),
});
