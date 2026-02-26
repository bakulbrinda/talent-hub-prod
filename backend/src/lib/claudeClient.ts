import Anthropic from '@anthropic-ai/sdk';
import logger from './logger';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature,
    ...(system && { system }),
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('');

  logger.info(`Claude API called: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens`);

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: response.model,
  };
}
