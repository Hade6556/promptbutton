import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PanelState, PbApi, RendererAction } from './shared';

const api: PbApi = {
  getState: () => ipcRenderer.invoke('pb:getState') as Promise<PanelState>,
  onState: (callback) => {
    const handler = (_event: IpcRendererEvent, state: PanelState) => callback(state);
    ipcRenderer.on('pb:state', handler);
    return () => ipcRenderer.off('pb:state', handler);
  },
  send: (action: RendererAction) => ipcRenderer.send('pb:action', action),
};

contextBridge.exposeInMainWorld('pb', api);
