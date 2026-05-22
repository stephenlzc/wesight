export const DialogIpcChannel = {
  SaveLocalImageToDirectory: 'dialog:saveLocalImageToDirectory',
} as const;

export type DialogIpcChannel = typeof DialogIpcChannel[keyof typeof DialogIpcChannel];
