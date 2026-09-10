import { CameraDetailScreen } from "@/features/camera-detail";

export default async function CameraDetailPage({ params }: { params: Promise<{ cameraId: string }> }) {
  const { cameraId } = await params;
  return <CameraDetailScreen cameraId={cameraId} />;
}
