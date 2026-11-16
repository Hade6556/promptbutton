import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DictationEvent, PanelState, PbApi, RendererAction, SetupAction, SetupState } from './shared';

const api: PbApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('pb:getState') as Promise<PanelState>,
  onState: (callback) => {
    const handler = (_event: IpcRendererEvent, state: PanelState) => callback(state);
    ipcRenderer.on('pb:state', handler);
    return () => ipcRenderer.off('pb:state', handler);
  },
  onDictation: (callback) => {
    const handler = (_event: IpcRendererEvent, event: DictationEvent) => callback(event);
    ipcRenderer.on('pb:dictation', handler);
    return () => ipcRenderer.off('pb:dictation', handler);
  },
  interpretVoice: (transcript, typed, questionIndex) => ipcRenderer.invoke('pb:voice', transcript, typed, questionIndex),
  send: (action: RendererAction) => ipcRenderer.send('pb:action', action),
  resize: (height: number) => ipcRenderer.send('pb:resize', height),
  setMouseThrough: (ignore: boolean) => ipcRenderer.send('pb:mouse', ignore),
  setMood: (mood: string) => ipcRenderer.send('pb:mood', mood),
  pet: {
    onCursor: (callback) => {
      const handler = (_event: IpcRendererEvent, at: { x: number; y: number }) => callback(at);
      ipcRenderer.on('pb:pet:cursor', handler);
      return () => ipcRenderer.off('pb:pet:cursor', handler);
    },
    onMood: (callback) => {
      const handler = (_event: IpcRendererEvent, mood: string) => callback(mood);
      ipcRenderer.on('pb:pet:mood', handler);
      return () => ipcRenderer.off('pb:pet:mood', handler);
    },
    onMotion: (callback) => {
      const handler = (_event: IpcRendererEvent, motion: { held: boolean; vx: number; vy: number }) => callback(motion);
      ipcRenderer.on('pb:pet:motion', handler);
      return () => ipcRenderer.off('pb:pet:motion', handler);
    },
    hit: (over: boolean) => ipcRenderer.send('pb:pet:hit', over),
    down: () => ipcRenderer.send('pb:pet:down'),
    up: () => ipcRenderer.send('pb:pet:up'),
    menu: () => ipcRenderer.send('pb:pet:menu'),
  },
  setup: {
    get: () => ipcRenderer.invoke('pb:setup:get') as Promise<SetupState>,
    onState: (callback) => {
      const handler = (_event: IpcRendererEvent, state: SetupState) => callback(state);
      ipcRenderer.on('pb:setup:state', handler);
      return () => ipcRenderer.off('pb:setup:state', handler);
    },
    send: (action: SetupAction) => ipcRenderer.send('pb:setup:action', action),
    resize: (height: number) => ipcRenderer.send('pb:setup:resize', height),
  },
};

contextBridge.exposeInMainWorld('pb', api);
