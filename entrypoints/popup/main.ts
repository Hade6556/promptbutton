import { PROXY_URL, apiBaseUrlItem, apiKeyItem, askModeItem, type AskMode } from '../../src/settings';

const keyInput = document.querySelector<HTMLInputElement>('#apiKey')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear')!;
const baseUrlInput = document.querySelector<HTMLInputElement>('#baseUrl')!;
const useProxyButton = document.querySelector<HTMLButtonElement>('#useProxy')!;
const advanced = document.querySelector<HTMLDetailsElement>('#advanced')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));

function setStatus(text: string) {
  status.textContent = text;
  if (text) window.setTimeout(() => (status.textContent = ''), 2500);
}

function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : '••••••••';
}

async function load() {
  const [key, mode, baseUrl] = await Promise.all([apiKeyItem.getValue(), askModeItem.getValue(), apiBaseUrlItem.getValue()]);
  keyInput.placeholder = key ? `Saved: ${maskKey(key)}` : 'sk-ant-…';
  for (const input of modeInputs) input.checked = input.value === mode;
  baseUrlInput.value = baseUrl;
  if (baseUrl) advanced.open = true;
}

async function saveBaseUrl() {
  const value = baseUrlInput.value.trim().replace(/\/+$/, '');
  if (value && !/^https?:\/\//.test(value)) return setStatus('Base URL must start with http:// or https://');
  await apiBaseUrlItem.setValue(value);
  setStatus(value ? 'Using proxy.' : 'Using api.anthropic.com.');
}

saveButton.addEventListener('click', async () => {
  const value = keyInput.value.trim();
  if (value) {
    if (!value.startsWith('sk-ant-')) return setStatus('That does not look like an Anthropic key.');
    await apiKeyItem.setValue(value);
    keyInput.value = '';
  }
  await saveBaseUrl();
  await load();
  if (value) setStatus('Key saved.');
});

keyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveButton.click();
});
baseUrlInput.addEventListener('change', () => void saveBaseUrl());
useProxyButton.addEventListener('click', () => {
  baseUrlInput.value = PROXY_URL;
  void saveBaseUrl();
});

clearButton.addEventListener('click', async () => {
  await apiKeyItem.removeValue();
  await load();
  setStatus('Key removed.');
});

for (const input of modeInputs) {
  input.addEventListener('change', async () => {
    if (input.checked) {
      await askModeItem.setValue(input.value as AskMode);
      setStatus('Saved.');
    }
  });
}

void load();
