import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  MAX_TOOL_ROUNDS,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

interface OpenAiResponse {
  choices?: { message?: OpenAiMessage }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * When `tools`/`executeTool` are supplied, runs the tool-call round
 * trip internally (assistant asks for a tool → we run it → feed the
 * result back → ask again) up to `MAX_TOOL_ROUNDS` times, returning
 * only once the model produces a final plain-text answer — callers
 * never see an intermediate tool-call turn. Returns the raw assistant
 * text + summed token usage across every round (handoff sentinel
 * parsing happens in `generateReply`).
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools, executeTool } = args

  const wireMessages: OpenAiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...mergeConsecutive(messages).map((m) => ({ role: m.role, content: m.content })),
  ]

  let totalPrompt = 0
  let totalCompletion = 0

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let res: Response
    try {
      res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: wireMessages,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          ...(tools && tools.length > 0
            ? { tools: tools.map((t) => ({ type: 'function', function: t })) }
            : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw toNetworkError(err)
    }

    if (!res.ok) {
      throw await providerHttpError('OpenAI', res)
    }

    const data = (await res.json().catch(() => null)) as OpenAiResponse | null
    totalPrompt += data?.usage?.prompt_tokens ?? 0
    totalCompletion += data?.usage?.completion_tokens ?? 0

    const message = data?.choices?.[0]?.message
    const toolCalls = message?.tool_calls
    if (toolCalls && toolCalls.length > 0 && executeTool && round < MAX_TOOL_ROUNDS) {
      wireMessages.push({ role: 'assistant', content: message?.content ?? null, tool_calls: toolCalls })
      for (const call of toolCalls) {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(call.function.arguments || '{}')
        } catch {
          // Malformed tool-call arguments — the executor gets an empty
          // object and returns its own "required field missing" error,
          // which the model can react to same as any other tool error.
        }
        const result = await executeTool(call.function.name, parsedArgs)
        wireMessages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
      continue
    }

    const text = message?.content
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new AiError('OpenAI returned an empty response.', {
        code: 'empty_response',
      })
    }
    const usage = normalizeUsage({
      prompt: totalPrompt,
      completion: totalCompletion,
      total: totalPrompt + totalCompletion,
    })
    return { text, usage }
  }

  throw new AiError('OpenAI kept calling tools without ever answering.', {
    code: 'tool_loop_exhausted',
  })
}
