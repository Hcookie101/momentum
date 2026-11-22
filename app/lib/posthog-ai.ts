import { createHash, randomUUID } from "node:crypto";
import { flushPostHogLogs, getPostHogLogLogger } from "@/instrumentation";
import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) {
    if (process.env.NODE_ENV !== "production") {
      const missing = !key ? "NEXT_PUBLIC_POSTHOG_KEY" : "NEXT_PUBLIC_POSTHOG_HOST";
      console.warn(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      );
    }
    client = null;
    return client;
  }

  client = new PostHog(key, {
    host,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2000,
    fetchRetryCount: 0,
    privacyMode: false,
  });
  return client;
}

export type AiCallContext = {
  distinctId: string;
  traceId: string;
  sessionId: string | null;
  provider: string;
  model: string;
  baseUrl: string;
  requestUrl: string;
  input: unknown;
  tools?: unknown;
};

export function createAiTraceId(): string {
  return randomUUID();
}

// Chat requests carry their full message history but not a persistent thread
// ID. Hashing the authenticated user and opening message gives that history a
// stable, non-content session identifier without exposing either value.
export function createChatSessionId(
  distinctId: string,
  messages: { role: string; content: string }[],
): string {
  const openingMessage = messages.find((message) => message.role === "user")?.content ?? "";
  return `chat-${createHash("sha256")
    .update(`${distinctId}:${openingMessage}`)
    .digest("hex")}`;
}

export async function captureAiGeneration(
  context: AiCallContext,
  details: {
    output?: unknown;
    latency: number;
    status?: number;
    stream: boolean;
    error?: string;
  },
): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;

    const properties: Record<string, unknown> = {
      $ai_trace_id: context.traceId,
      $ai_session_id: context.sessionId,
      $ai_model: context.model,
      $ai_provider: context.provider,
      $ai_input: context.input,
      $ai_latency: details.latency,
      $ai_stream: details.stream,
      $ai_base_url: context.baseUrl,
      $ai_request_url: context.requestUrl,
      ...(context.tools ? { $ai_tools: context.tools } : {}),
      ...(details.output !== undefined ? { $ai_output_choices: details.output } : {}),
      ...(details.status !== undefined ? { $ai_http_status: details.status } : {}),
      ...(details.error ? { $ai_is_error: true, $ai_error: details.error } : {}),
    };
    getPostHogLogLogger()?.emit({
      body: "AI generation completed",
      severityText: details.error ? "WARN" : "INFO",
      attributes: {
        event: "ai_generation_completed",
        ai_provider: context.provider,
        ai_model: context.model,
        stream: details.stream,
        latency_ms: Math.round(details.latency * 1000),
        ...(details.status !== undefined ? { upstream_status: details.status } : {}),
        outcome: details.error ? "failed" : "completed",
      },
    });
    posthog.capture({ distinctId: context.distinctId, event: "$ai_generation", properties });
    await Promise.all([
      posthog.flush().catch(() => {}),
      flushPostHogLogs(),
    ]);
  } catch {
    // Analytics must never change the provider request's result.
  }
}

export async function captureAiToolSpan(
  context: Pick<AiCallContext, "distinctId" | "traceId" | "sessionId">,
  tool: { name: string; input: unknown; output?: unknown; latency: number; error?: string },
): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    getPostHogLogLogger()?.emit({
      body: "AI tool execution completed",
      severityText: tool.error ? "WARN" : "INFO",
      attributes: {
        event: "ai_tool_execution_completed",
        tool_name: tool.name,
        latency_ms: Math.round(tool.latency * 1000),
        outcome: tool.error ? "failed" : "completed",
      },
    });
    posthog.capture({
      distinctId: context.distinctId,
      event: "$ai_span",
      properties: {
        $ai_trace_id: context.traceId,
        $ai_session_id: context.sessionId,
        $ai_span_id: randomUUID(),
        $ai_parent_id: context.traceId,
        $ai_span_name: `tool:${tool.name}`,
        $ai_input_state: tool.input,
        ...(tool.output !== undefined ? { $ai_output_state: tool.output } : {}),
        $ai_latency: tool.latency,
        ...(tool.error ? { $ai_is_error: true, $ai_error: tool.error } : {}),
      },
    });
    await Promise.all([
      posthog.flush().catch(() => {}),
      flushPostHogLogs(),
    ]);
  } catch {
    // Analytics must never change the tool result.
  }
}
