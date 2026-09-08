import { DeviceDetailScreen } from "@/features/device-detail/device-detail-screen";

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  return <DeviceDetailScreen deviceId={deviceId} />;
}