import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DictationEvent, PanelState, PbApi, RendererAction } from './shared';

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
};

contextBridge.exposeInMainWorld('pb', api);
