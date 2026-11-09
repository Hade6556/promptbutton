import { apiKeyItem, askModeItem, type AskMode } from '../../src/settings';

const keyInput = document.querySelector<HTMLInputElement>('#apiKey')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear')!;
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
  const key = await apiKeyItem.getValue();
  keyInput.placeholder = key ? `Saved: ${maskKey(key)}` : 'sk-ant-…';
  const mode = await askModeItem.getValue();
  for (const input of modeInputs) input.checked = input.value === mode;
}

saveButton.addEventListener('click', async () => {
  const value = keyInput.value.trim();
  if (!value) return setStatus('Paste a key first.');
  if (!value.startsWith('sk-ant-')) return setStatus('That does not look like an Anthropic key.');
  await apiKeyItem.setValue(value);
  keyInput.value = '';
  await load();
  setStatus('Key saved.');
});

keyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveButton.click();
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
