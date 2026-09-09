"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, Square } from "lucide-react";
import { useSessionContext } from "@/features/session";
import { fieldOpsClient } from "@/shared/api/http/client";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import type { CameraControlSession, CameraPose } from "@/shared/api/types";
import { useI18n } from "@/shared/i18n";
import { cameraCopy } from "@/shared/lib/camera-copy";
import { Button } from "@/shared/ui/button";
import { WidgetFrame } from "@/shared/ui/card";
import { ErrorView, NotFoundView, PermissionView } from "@/shared/ui/feedback";
import { PageHeading } from "@/shared/ui/page-heading";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/badge";
import { useCameraQuery, useCameraStatusQuery } from "./use-camera";

type MoveVector = { pan: number; tilt: number; zoom: number };
type SocketState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "LOST";

function PoseValue({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-border-subtle bg-console-bg/60 p-3">
    <dt className="text-[11px] uppercase tracking-wide text-text-muted">{label}</dt>
    <dd className="numeral mt-1 text-lg font-semibold text-text-primary">{value}</dd>
  </div>;
}

interface HoldButtonProps {
  label: string;
  disabled: boolean;
  children: React.ReactNode;
  onStart: () => void;
  onStop: () => void;
}

function HoldButton({ label, disabled, children, onStart, onStop }: HoldButtonProps) {
  return <button type="button" aria-label={label} title={label} disabled={disabled}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onStart(); }}
    onPointerUp={onStop} onPointerCancel={onStop} onLostPointerCapture={onStop}
    onKeyDown={(event) => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) onStart(); }}
    onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") onStop(); }}
    onClick={(event) => { if (event.detail === 0) { onStart(); window.setTimeout(onStop, 120); } }}
    className="inline-flex size-12 touch-none items-center justify-center rounded-xl border border-border-subtle bg-console-surface-2 text-text-primary transition-colors hover:border-accent-primary hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40">
    {children}
  </button>;
}

export function CameraDetailScreen({ cameraId }: { cameraId: string }) {
  const { tenantId, siteId, permissions } = useSessionContext();
  const { locale, messages } = useI18n();
  const copy = cameraCopy[locale];
  const detail = useCameraQuery(tenantId, siteId, cameraId);
  const status = useCameraStatusQuery(tenantId, siteId, cameraId);
  const [controlSession, setControlSession] = useState<CameraControlSession | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("DISCONNECTED");
  const [pose, setPose] = useState<CameraPose | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
  const moveTimerRef = useRef<number | null>(null);
  const canControl = permissions.includes("CAMERA_CONTROL");

  const send = useCallback((type: "MOVE" | "STOP" | "HEARTBEAT", payload: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    const active = controlSession;
    if (!active || !socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, sessionId: active.sessionId, generation: active.generation,
      seq: ++seqRef.current, ...payload }));
    return true;
  }, [controlSession]);

  const stopMoveTimer = useCallback(() => {
    if (moveTimerRef.current !== null) {
      window.clearInterval(moveTimerRef.current);
      moveTimerRef.current = null;
    }
  }, []);

  const stop = useCallback((reason: string) => {
    stopMoveTimer();
    send("STOP", { reason });
  }, [send, stopMoveTimer]);

  const startMove = useCallback((vector: MoveVector) => {
    stopMoveTimer();
    const move = () => send("MOVE", { ...vector, timeoutMs: 500 });
    move();
    moveTimerRef.current = window.setInterval(move, 85);
  }, [send, stopMoveTimer]);

  useEffect(() => {
    if (!controlSession) return;
    const socket = new WebSocket(controlSession.websocketUrl);
    socketRef.current = socket;
    const heartbeat = window.setInterval(() => send("HEARTBEAT"), controlSession.heartbeatIntervalMs);
    socket.onopen = () => setSocketState("CONNECTED");
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string; code?: string; detail?: string; reason?: string;
        pan?: number; tilt?: number; zoom?: number; moving?: boolean;
      };
      if (message.type === "POSE" && message.pan !== undefined && message.tilt !== undefined
          && message.zoom !== undefined && message.moving !== undefined) {
        setPose({ pan: message.pan, tilt: message.tilt, zoom: message.zoom, moving: message.moving });
      } else if (message.type === "CONTROL_LOST") {
        setSocketState("LOST");
        setControlError(copy.controlLost);
        setControlSession(null);
      } else if (message.type === "ERROR") {
        setControlError(message.detail ?? message.code ?? copy.controlLost);
      }
    };
    socket.onerror = () => setControlError(copy.disconnected);
    socket.onclose = () => setSocketState((current) => current === "LOST" ? current : "DISCONNECTED");
    return () => {
      window.clearInterval(heartbeat);
      stopMoveTimer();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "STOP", sessionId: controlSession.sessionId,
          generation: controlSession.generation, seq: ++seqRef.current, reason: "SOCKET_CLOSED" }));
      }
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [controlSession, copy.controlLost, copy.disconnected, send, stopMoveTimer]);

  useEffect(() => {
    const blur = () => stop("WINDOW_BLUR");
    const visibility = () => { if (document.visibilityState === "hidden") stop("VISIBILITY_HIDDEN"); };
    const pageHide = () => stop("PAGE_HIDE");
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide);
      stop("SOCKET_CLOSED");
    };
  }, [stop]);

  const acquire = async () => {
    setControlError(null);
    setSocketState("CONNECTING");
    try {
      const acquired = await fieldOpsClient.acquireCameraControl(cameraId, tenantId);
      seqRef.current = 0;
      setControlSession(acquired);
    } catch (error) {
      setSocketState("DISCONNECTED");
      setControlError(isHttpError(error) && error.problem?.detail ? error.problem.detail : copy.controlLost);
    }
  };

  const release = async () => {
    const active = controlSession;
    if (!active) return;
    stop("USER_REQUEST");
    try {
      await fieldOpsClient.releaseCameraControl(cameraId, active.sessionId, tenantId, active.generation);
    } catch (error) {
      setControlError(isHttpError(error) && error.problem?.detail ? error.problem.detail : copy.controlLost);
    } finally {
      socketRef.current?.close();
      setControlSession(null);
      setSocketState("DISCONNECTED");
    }
  };

  if (detail.isLoading || status.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="aspect-video w-full" /></div>;
  }
  if (detail.isError) {
    if (isHttpError(detail.error) && detail.error.status === 404) return <NotFoundView />;
    if (isHttpError(detail.error) && detail.error.status === 403) return <PermissionView />;
    return <ErrorView failure={{ code: "CAMERA_DETAIL_FAILED",
      title: isHttpError(detail.error) ? problemTitle(detail.error.problem, messages) : messages.errors.genericTitle,
      message: copy.loadFailed, traceId: isHttpError(detail.error) ? detail.error.traceId : undefined,
      retryable: true }} onRetry={() => detail.refetch()} />;
  }
  if (!detail.data) return null;

  const controlsEnabled = Boolean(controlSession && socketState === "CONNECTED");
  const currentPose = pose ?? status.data?.pose ?? null;
  return <div className="min-w-0 space-y-5" data-testid="camera-detail-screen">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <PageHeading focusKey={`camera:${tenantId}:${siteId}:${cameraId}`} className="text-2xl font-bold tracking-tight">
          {detail.data.name}
        </PageHeading>
        <p className="mono mt-1 text-xs text-text-muted">{cameraId} · {detail.data.zoneName}</p>
      </div>
      <StatusBadge label={detail.data.previewState === "READY" ? messages.states.live : messages.states.disconnected}
        tone={detail.data.previewState === "READY" ? "success" : "critical"} />
    </header>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,0.7fr)]">
      <WidgetFrame title={copy.preview} action={<span className="text-xs text-text-muted">{copy.liveSynthetic}</span>}>
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-border-subtle bg-black">
          {detail.data.previewState === "READY" ? <iframe src={detail.data.preview.url} title={copy.preview}
            allow="autoplay; fullscreen" className="h-full w-full border-0" data-testid="camera-preview" />
            : <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-muted">{copy.previewUnavailable}</div>}
        </div>
      </WidgetFrame>

      <WidgetFrame title={copy.control} action={<StatusBadge
        label={socketState === "CONNECTED" ? copy.connected : copy.disconnected}
        tone={socketState === "CONNECTED" ? "success" : socketState === "LOST" ? "critical" : "neutral"}
        size="sm" />}>
        {!canControl ? <p className="rounded-xl border border-border-subtle bg-console-bg/60 p-4 text-sm text-text-secondary">{copy.readOnly}</p>
          : !controlSession ? <Button onClick={acquire} className="w-full"
              disabled={detail.data.controlState === "UNAVAILABLE"}>{copy.acquire}</Button>
          : <Button variant="secondary" onClick={release} className="w-full">{copy.release}</Button>}

        <div className="mx-auto grid w-fit grid-cols-3 gap-2" aria-label={copy.control}>
          <span />
          <HoldButton label={copy.moveUp} disabled={!controlsEnabled} onStart={() => startMove({ pan: 0, tilt: 0.8, zoom: 0 })} onStop={() => stop("INPUT_RELEASED")}><ArrowUp className="size-5" /></HoldButton>
          <span />
          <HoldButton label={copy.moveLeft} disabled={!controlsEnabled} onStart={() => startMove({ pan: -0.8, tilt: 0, zoom: 0 })} onStop={() => stop("INPUT_RELEASED")}><ArrowLeft className="size-5" /></HoldButton>
          <HoldButton label={copy.stop} disabled={!controlsEnabled} onStart={() => stop("USER_REQUEST")} onStop={() => undefined}><Square className="size-4 fill-current" /></HoldButton>
          <HoldButton label={copy.moveRight} disabled={!controlsEnabled} onStart={() => startMove({ pan: 0.8, tilt: 0, zoom: 0 })} onStop={() => stop("INPUT_RELEASED")}><ArrowRight className="size-5" /></HoldButton>
          <span />
          <HoldButton label={copy.moveDown} disabled={!controlsEnabled} onStart={() => startMove({ pan: 0, tilt: -0.8, zoom: 0 })} onStop={() => stop("INPUT_RELEASED")}><ArrowDown className="size-5" /></HoldButton>
          <span />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <HoldButton label={copy.zoomOut} disabled={!controlsEnabled} onStart={() => startMove({ pan: 0, tilt: 0, zoom: -0.6 })} onStop={() => stop("INPUT_RELEASED")}><Minus className="size-5" /></HoldButton>
          <HoldButton label={copy.zoomIn} disabled={!controlsEnabled} onStart={() => startMove({ pan: 0, tilt: 0, zoom: 0.6 })} onStop={() => stop("INPUT_RELEASED")}><Plus className="size-5" /></HoldButton>
        </div>
        {controlError ? <p role="alert" className="rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{controlError}</p> : null}
      </WidgetFrame>
    </div>

    <WidgetFrame title={copy.pose}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PoseValue label={copy.pan} value={currentPose ? currentPose.pan.toFixed(3) : "—"} />
        <PoseValue label={copy.tilt} value={currentPose ? currentPose.tilt.toFixed(3) : "—"} />
        <PoseValue label={copy.zoom} value={currentPose ? currentPose.zoom.toFixed(3) : "—"} />
        <PoseValue label={copy.motion} value={currentPose?.moving ? copy.moving : copy.idle} />
      </dl>
    </WidgetFrame>
  </div>;
}
