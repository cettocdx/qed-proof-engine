import { redirect } from "next/navigation";

// /agents/[id] → /strategy/[id]  (strategy page is the canonical agent dossier)
export default async function AgentRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/strategy/${id}`);
}
