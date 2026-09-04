import { CopilotChat } from "@/components/ai/copilot-chat";

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const { symbol } = await searchParams;
  return <CopilotChat pinnedSymbol={symbol} />;
}
