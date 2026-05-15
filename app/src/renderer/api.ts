export interface Settings {
  resume?: string;
  jd?: string;
  anthropicKey?: string;
  openaiKey?: string;
  huoshanAppId?: string;
  huoshanToken?: string;
}

export interface RendererAPI {
  onSidecarEvent: (callback: (event: unknown) => void) => () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;
  onTranscript: (callback: (transcript: string) => void) => () => void;
  onShareState: (callback: (active: boolean) => void) => () => void;
  onOCR: (callback: (text: string) => void) => () => void;
  onAnswerStart: (callback: () => void) => () => void;
  onAnswerToken: (callback: (token: string) => void) => () => void;
  onAnswerDone: (callback: () => void) => () => void;
  loadSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<Settings>;
}

declare global {
  interface Window {
    api?: RendererAPI;
  }
}
