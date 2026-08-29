import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  MAX_TOOL_ROUNDS,
  type ProviderArgs,
} from './shared'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Anthropic's Messages API requires strictly alternating roles that
 * begin with `user`. Merge consecutive turns, then drop any leading
 * assistant turns (an agent greeting before the customer said anything)
 * so the transcript always starts on the customer. Guarantees a valid,
 * non-empty payload.
 */
function normalizeForAnthropic(messages: ChatMessage[]): AnthropicMessage[] {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  if (merged.length === 0) {
    return [{ role: 'user', content: '(The customer has not sent a message yet.)' }]
  }
  return merged.map((m) => ({ role: m.role, content: m.content }))
}

/**
 * Call Anthropic's Messages endpoint with the caller's own key. When
 * `tools`/`executeTool` are supplied, runs the tool-call round trip
 * internally (same contract as the OpenAI adapter — see its comment)
 * up to `MAX_TOOL_ROUNDS` times, returning only the model's final
 * plain-text answer. Returns the raw assistant text + summed token
 * usage across every round (handoff sentinel parsing happens in
 * `generateReply`).
 */
export async function generateAnthropic(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools, executeTool } = args

  const wireMessages: AnthropicMessage[] = normalizeForAnthropic(messages)

  let totalInput = 0
  let totalOutput = 0

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: wireMessages,
          ...(tools && tools.length > 0
            ? {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
                })),
              }
            : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw toNetworkError(err)
    }

    if (!res.ok) {
      throw await providerHttpError('Anthropic', res)
    }

    const data = (await res.json().catch(() => null)) as AnthropicResponse | null
    totalInput += data?.usage?.input_tokens ?? 0
    totalOutput += data?.usage?.output_tokens ?? 0

    const blocks = data?.content ?? []
    const toolUseBlocks = blocks.filter(
      (b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    )

    if (toolUseBlocks.length > 0 && executeTool && round < MAX_TOOL_ROUNDS) {
      wireMessages.push({ role: 'assistant', content: blocks })
      const resultBlocks: AnthropicContentBlock[] = []
      for (const call of toolUseBlocks) {
        const result = await executeTool(call.name, call.input)
        resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: result })
      }
      wireMessages.push({ role: 'user', content: resultBlocks })
      continue
    }

    const text = blocks
      .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) {
      throw new AiError('Anthropic returned an empty response.', {
        code: 'empty_response',
      })
    }
    // Anthropic reports input/output but no total — normalizeUsage sums.
    const usage = normalizeUsage({ prompt: totalInput, completion: totalOutput })
    return { text, usage }
  }

  throw new AiError('Anthropic kept calling tools without ever answering.', {
    code: 'tool_loop_exhausted',
  })
}
