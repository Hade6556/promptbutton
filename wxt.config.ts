import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'PromptButton',
    description:
      'One press: reads the conversation, asks what the model still needs, rewrites your prompt.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://api.anthropic.com/*'],
    commands: {
      'improve-prompt': {
        suggested_key: { default: 'Alt+Shift+P', mac: 'Alt+Shift+P' },
        description: 'Improve the prompt in the current chat box',
      },
    },
  },
});
