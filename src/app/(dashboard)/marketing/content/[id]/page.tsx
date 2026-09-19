import { MarketingContentDetail } from "@/components/marketing/marketing-content-detail";

export default async function MarketingContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MarketingContentDetail pieceId={id} />;
}
