import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'PromptButton',
    description:
      'One press: reads the conversation, asks what the model still needs, rewrites your prompt.',
    permissions: ['storage', 'activeTab'],
    // The local proxy (npm run proxy) is for organisations that block browser calls to the API.
    host_permissions: ['https://api.anthropic.com/*', 'http://127.0.0.1/*', 'http://localhost/*'],
    commands: {
      'improve-prompt': {
        suggested_key: { default: 'Alt+Shift+P', mac: 'Alt+Shift+P' },
        description: 'Improve the prompt in the current chat box',
      },
    },
  },
});
