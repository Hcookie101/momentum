// Read-only view of the free-tier budget for the configured connection: the
// same per-model bucket the chat and the one-shot generators spend from.
// The badge polls this on page load so the counter shows at all times — even
// before anything has been generated in this session. Reading never spends.
import { readProviderConfig } from "@/app/lib/ai-providers";
import { parseQuotaLimits, usage } from "@/app/lib/quota";

export async function GET(request: Request) {
  const config = readProviderConfig(request);
  if (typeof config === "string") return Response.json({ error: config }, { status: 400 });
  const limits = parseQuotaLimits(request.headers.get("x-ai-quota"));
  if (!limits) return Response.json({ quota: null });
  return Response.json({ quota: usage(`${config.provider}:${config.model}`, limits) });
}
