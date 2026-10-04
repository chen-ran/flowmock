import type { ProtocolAdapter } from './adapter.ts';
import { anthropicMessagesAdapter } from './anthropic-messages.ts';
import { geminiGenerateContentAdapter } from './gemini-generate-content.ts';
import { openaiChatCompletionsAdapter } from './openai-chat-completions.ts';
import { openaiResponsesAdapter } from './openai-responses.ts';
import type { Protocol } from '@flowmock/protocols/common';

const ADAPTERS: Record<Protocol, ProtocolAdapter> = {
  'anthropic-messages': anthropicMessagesAdapter,
  'openai-chat-completions': openaiChatCompletionsAdapter,
  'openai-responses': openaiResponsesAdapter,
  'gemini-generate-content': geminiGenerateContentAdapter,
};

export const adapterFor = (protocol: Protocol): ProtocolAdapter => ADAPTERS[protocol];
