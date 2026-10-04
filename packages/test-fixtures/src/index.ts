import { anthropicNonStream, anthropicOverloadedMidStream, anthropicRateLimited, anthropicText, anthropicToolResultFollowup, anthropicToolUseThinking } from './anthropic-messages.ts';
import type { ExchangeFixture } from './builders.ts';
import { geminiJsonArrayFunctionCall, geminiNonStream, geminiRateLimited, geminiSseText } from './gemini-generate-content.ts';
import { chatErrorChunk, chatNonStream, chatRateLimited, chatText, chatToolCalls } from './openai-chat-completions.ts';
import { responsesFailed, responsesFunctionCall, responsesNonStream, responsesText } from './openai-responses.ts';

export * from './builders.ts';
export * from './anthropic-messages.ts';
export * from './openai-chat-completions.ts';
export * from './openai-responses.ts';
export * from './gemini-generate-content.ts';

export const ALL_FIXTURES: readonly ExchangeFixture[] = [
  anthropicText,
  anthropicToolUseThinking,
  anthropicToolResultFollowup,
  anthropicOverloadedMidStream,
  anthropicRateLimited,
  anthropicNonStream,
  chatText,
  chatToolCalls,
  chatErrorChunk,
  chatRateLimited,
  chatNonStream,
  responsesText,
  responsesFunctionCall,
  responsesFailed,
  responsesNonStream,
  geminiSseText,
  geminiJsonArrayFunctionCall,
  geminiRateLimited,
  geminiNonStream,
];

export const fixtureBodyText = (fixture: ExchangeFixture): string => fixture.response.chunks.map(chunk => chunk.text).join('');
