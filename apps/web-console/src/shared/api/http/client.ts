import {
  HttpError,
  type FieldOpsProblem,
} from "./problem";
import type {
  DeviceDetailResponse,
  DeviceListResponse,
  DeviceStateResponse,
  MemberListResponse,
  OverviewResponse,
  SessionResponse,
  TelemetrySeriesResponse,
  CameraControlSession,
  CameraDetail,
  CameraListResponse,
  CameraStatus,
} from "../types";
import type { components, operations } from "../generated/fieldops-m1";
import { activeFixtureScenario, FIXTURE_SCENARIO_HEADER } from "../mock/fixture-scenario";

export interface RequestOptions {
  signal?: AbortSignal;
}

export type OverviewQuery = operations["getOverview"]["parameters"]["query"];
export type EnvironmentSeriesQuery = operations["getEnvironmentSeries"]["parameters"]["query"];
export type DeviceListQuery = operations["listDevices"]["parameters"]["query"];
export type DeviceSeriesQuery = NonNullable<
  operations["getDeviceTelemetrySeries"]["parameters"]["query"]
>;
export type MemberListQuery = NonNullable<operations["listMembers"]["parameters"]["query"]>;
type DeviceId = operations["getDevice"]["parameters"]["path"]["deviceId"];
type DeviceQuery = operations["getDevice"]["parameters"]["query"];
type CsrfTokenResponse = components["schemas"]["CsrfTokenResponse"];

const JSON_HEADERS = { Accept: "application/json" };

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path;
  const params: string[][] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      params.push([key, String(value)]);
    }
  }
  if (params.length === 0) return path;
  return `${path}?${new URLSearchParams(params).toString()}`;
}

async function parseProblem(response: Response): Promise<FieldOpsProblem | null> {
  try {
    const body = (await response.json()) as Partial<FieldOpsProblem>;
    if (typeof body?.status === "number" && typeof body?.code === "string") {
      return {
        type: body.type ?? "about:blank",
        title: body.title ?? response.statusText,
        status: body.status,
        code: body.code,
        detail: body.detail,
        traceId: body.traceId,
        timestamp: body.timestamp,
        retryAfterSeconds: body.retryAfterSeconds,
      };
    }
  } catch {
    // fall through to a generic transport problem
  }
  return {
    type: "about:blank",
    title: response.statusText || "Request failed",
    status: response.status,
    code: "INTERNAL_ERROR",
  };
}

async function request<T>(
  url: string,
  options?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  const fixtureScenario = activeFixtureScenario();
  if (fixtureScenario) headers[FIXTURE_SCENARIO_HEADER] = fixtureScenario;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers,
    signal: options?.signal,
  });

  const traceIdHeader = response.headers.get("x-trace-id");

  if (!response.ok) {
    const problem = await parseProblem(response);
    if (traceIdHeader && problem) problem.traceId = traceIdHeader;
    throw new HttpError(response.status, problem);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(response.status, {
      type: "about:blank",
      title: "Unexpected response",
      status: response.status,
      code: "INTERNAL_ERROR",
      traceId: traceIdHeader ?? undefined,
    });
  }

  return (await response.json()) as T;
}

async function mutate<T>(url: string, method: "POST" | "DELETE", options?: RequestOptions): Promise<T> {
  const csrf = await request<CsrfTokenResponse>("/api/v1/auth/csrf", options);
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { ...JSON_HEADERS, [csrf.headerName]: csrf.token },
    signal: options?.signal,
  });
  if (!response.ok) {
    const problem = await parseProblem(response);
    const traceId = response.headers.get("x-trace-id");
    if (traceId && problem) problem.traceId = traceId;
    throw new HttpError(response.status, problem);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface FieldOpsClient {
  getSession(options?: RequestOptions): Promise<SessionResponse>;
  logout(options?: RequestOptions): Promise<void>;
  getOverview(input: OverviewQuery, options?: RequestOptions): Promise<OverviewResponse>;
  getEnvironmentSeries(
    input: EnvironmentSeriesQuery,
    options?: RequestOptions,
  ): Promise<TelemetrySeriesResponse>;
  getDevices(
    input: DeviceListQuery,
    options?: RequestOptions,
  ): Promise<DeviceListResponse>;
  getDevice(
    deviceId: DeviceId,
    input: DeviceQuery,
    options?: RequestOptions,
  ): Promise<DeviceDetailResponse>;
  getDeviceState(
    deviceId: DeviceId,
    input: DeviceQuery,
    options?: RequestOptions,
  ): Promise<DeviceStateResponse>;
  getDeviceSeries(
    deviceId: DeviceId,
    input: DeviceSeriesQuery,
    options?: RequestOptions,
  ): Promise<TelemetrySeriesResponse>;
  getMembers(
    input: MemberListQuery,
    options?: RequestOptions,
  ): Promise<MemberListResponse>;
  getCameras(tenantId: string, siteId: string, options?: RequestOptions): Promise<CameraListResponse>;
  getCamera(cameraId: string, tenantId: string, options?: RequestOptions): Promise<CameraDetail>;
  getCameraStatus(cameraId: string, tenantId: string, options?: RequestOptions): Promise<CameraStatus>;
  acquireCameraControl(cameraId: string, tenantId: string, options?: RequestOptions): Promise<CameraControlSession>;
  releaseCameraControl(cameraId: string, sessionId: string, tenantId: string,
    generation: number, options?: RequestOptions): Promise<void>;
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

export const fieldOpsClient: FieldOpsClient = {
  getSession(options) {
    return request<SessionResponse>("/api/v1/session", options);
  },
  async logout(options) {
    const csrf = await request<CsrfTokenResponse>("/api/v1/auth/csrf", options);
    const response = await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { [csrf.headerName]: csrf.token },
      signal: options?.signal,
    });
    if (!response.ok) {
      const problem = await parseProblem(response);
      const traceId = response.headers.get("x-trace-id");
      if (traceId && problem) problem.traceId = traceId;
      throw new HttpError(response.status, problem);
    }
  },
  getOverview(input, options) {
    return request<OverviewResponse>(
      buildUrl("/api/v1/dashboard/overview", {
        tenantId: input.tenantId,
        siteId: input.siteId,
        range: input.range,
      }),
      options,
    );
  },
  getEnvironmentSeries(input, options) {
    return request<TelemetrySeriesResponse>(
      buildUrl("/api/v1/dashboard/environment-series", {
        tenantId: input.tenantId,
        siteId: input.siteId,
        range: input.range,
        bucket: input.bucket,
      }),
      options,
    );
  },
  getDevices(input, options) {
    return request<DeviceListResponse>(
      buildUrl("/api/v1/devices", {
        tenantId: input.tenantId,
        siteId: input.siteId,
        query: input.query,
        deviceType: input.deviceType,
        protocol: input.protocol,
        connectivity: input.connectivity,
        readiness: input.readiness,
        freshness: input.freshness,
        cursor: input.cursor,
        pageSize: input.pageSize,
      }),
      options,
    );
  },
  getDevice(deviceId, input, options) {
    return request<DeviceDetailResponse>(
      buildUrl(`/api/v1/devices/${encodePath(deviceId)}`, { tenantId: input.tenantId }),
      options,
    );
  },
  getDeviceState(deviceId, input, options) {
    return request<DeviceStateResponse>(
      buildUrl(`/api/v1/devices/${encodePath(deviceId)}/state`, { tenantId: input.tenantId }),
      options,
    );
  },
  getDeviceSeries(deviceId, input, options) {
    return request<TelemetrySeriesResponse>(
      buildUrl(`/api/v1/devices/${encodePath(deviceId)}/telemetry/series`, {
        tenantId: input.tenantId,
        range: input.range,
        bucket: input.bucket,
        metrics: input.metrics,
      }),
      options,
    );
  },
  getMembers(input, options) {
    return request<MemberListResponse>(
      buildUrl("/api/v1/members", {
        tenantId: input.tenantId,
        query: input.query,
        role: input.role,
        status: input.status,
        siteId: input.siteId,
        cursor: input.cursor,
        pageSize: input.pageSize,
      }),
      options,
    );
  },
  getCameras(tenantId, siteId, options) {
    return request<CameraListResponse>(buildUrl("/api/v1/cameras", { tenantId, siteId }), options);
  },
  getCamera(cameraId, tenantId, options) {
    return request<CameraDetail>(
      buildUrl(`/api/v1/cameras/${encodePath(cameraId)}`, { tenantId }),
      options,
    );
  },
  getCameraStatus(cameraId, tenantId, options) {
    return request<CameraStatus>(
      buildUrl(`/api/v1/cameras/${encodePath(cameraId)}/status`, { tenantId }),
      options,
    );
  },
  acquireCameraControl(cameraId, tenantId, options) {
    return mutate<CameraControlSession>(
      buildUrl(`/api/v1/cameras/${encodePath(cameraId)}/control-sessions`, { tenantId }),
      "POST",
      options,
    );
  },
  releaseCameraControl(cameraId, sessionId, tenantId, generation, options) {
    return mutate<void>(
      buildUrl(
        `/api/v1/cameras/${encodePath(cameraId)}/control-sessions/${encodePath(sessionId)}`,
        { tenantId, generation },
      ),
      "DELETE",
      options,
    );
  },
};
