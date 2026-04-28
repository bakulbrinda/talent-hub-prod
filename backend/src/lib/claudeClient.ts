import Anthropic from '@anthropic-ai/sdk';
import logger from './logger';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const MODEL = 'claude-sonnet-4-6';

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export async function callClaude(
  prompt: string,
  options: { temperature?: number; maxTokens?: number; system?: string } = {}
): Promise<ClaudeResponse> {
  const { temperature = 0.3, maxTokens = 2000, system } = options;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    ...(system && { system }),
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const usage = response.usage;

  logger.info(`Claude API: ${usage.input_tokens} in / ${usage.output_tokens} out tokens`);

  return {
    content,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    model: MODEL,
  };
}
