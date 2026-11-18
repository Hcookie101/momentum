import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

let loggerProvider: LoggerProvider | null | undefined;

function getLoggerProvider(): LoggerProvider | null {
  if (loggerProvider !== undefined) return loggerProvider;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) {
    if (process.env.NODE_ENV !== "production") {
      const missing = !key ? "NEXT_PUBLIC_POSTHOG_KEY" : "NEXT_PUBLIC_POSTHOG_HOST";
      console.warn(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      );
    }
    loggerProvider = null;
    return loggerProvider;
  }

  const exporter = new OTLPLogExporter({
    url: new URL("/i/v1/logs", host).toString(),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    timeoutMillis: 2000,
  });
  loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "momentum-nextjs",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    processors: [new BatchLogRecordProcessor({ exporter })],
  });
  return loggerProvider;
}

export function getPostHogLogLogger() {
  return getLoggerProvider()?.getLogger("momentum-posthog-export") ?? null;
}

export async function flushPostHogLogs(): Promise<void> {
  await getLoggerProvider()?.forceFlush().catch(() => {});
}

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") getLoggerProvider();
}
