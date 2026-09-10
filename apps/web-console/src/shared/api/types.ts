import type { components } from "./generated/fieldops-m1";
import type { components as cameraComponents } from "./generated/fieldops-m2-camera";
import type { components as commandComponents } from "./generated/fieldops-m3-command";

export type Schemas = components["schemas"];

export type TimeRange = Schemas["TimeRange"];
export type TimeBucket = Schemas["TimeBucket"];
export type Permission = Schemas["Permission"];
export type MemberRole = Schemas["MemberRole"];
export type MemberStatus = Schemas["MemberStatus"];
export type DeviceProtocol = Schemas["DeviceProtocol"];
export type Connectivity = Schemas["Connectivity"];
export type Readiness = Schemas["Readiness"];
export type FreshnessStatus = Schemas["FreshnessStatus"];
export type DataSource = Schemas["DataSource"];
export type WidgetStatus = Schemas["WidgetStatus"];
export type MetricQuality = Schemas["MetricQuality"];
export type MetricValue = Schemas["MetricValue"];

export type SessionResponse = Schemas["SessionResponse"];
export type SessionMembership = Schemas["SessionMembership"];
export type TenantOption = Schemas["TenantOption"];
export type SiteOption = Schemas["SiteOption"];
export type ActiveContext = Schemas["ActiveContext"];

export type OverviewResponse = Schemas["OverviewResponse"];
export type DashboardContext = Schemas["DashboardContext"];
export type OverviewWidgets = Schemas["OverviewWidgets"];
export type WidgetMeta = Schemas["WidgetMeta"];
export type WidgetFailure = Schemas["WidgetFailure"];
export type PartialFailure = Schemas["PartialFailure"];
export type MetricReading = Schemas["MetricReading"];
export type ZoneCondition = Schemas["ZoneCondition"];
export type ActiveAlarmSummary = Schemas["ActiveAlarmSummary"];
export type RecentCommandSummary = Schemas["RecentCommandSummary"];
export type PrimaryCameraSummary = Schemas["PrimaryCameraSummary"];
export type DeviceStatusCounts = Schemas["DeviceStatusCounts"];
export type AlarmCounts = Schemas["AlarmCounts"];
export type CommandCounts = Schemas["CommandCounts"];
export type FreshnessCounts = Schemas["FreshnessCounts"];
export type ConnectionSummary = Schemas["ConnectionSummary"];

export type TelemetrySeriesResponse = Schemas["TelemetrySeriesResponse"];
export type SeriesContext = Schemas["SeriesContext"];
export type TelemetrySeries = Schemas["TelemetrySeries"];
export type TelemetryPoint = Schemas["TelemetryPoint"];

export type DeviceListResponse = Schemas["DeviceListResponse"];
export type DeviceSummary = Schemas["DeviceSummary"];
export type PageInfo = Schemas["PageInfo"];
export type DeviceDetailResponse = Schemas["DeviceDetailResponse"];
export type DeviceStateResponse = Schemas["DeviceStateResponse"];

export type MemberListResponse = Schemas["MemberListResponse"];
export type MemberSummary = Schemas["MemberSummary"];
export type ProblemDetails = Schemas["ProblemDetails"];

type CameraSchemas = cameraComponents["schemas"];
export type CameraSummary = CameraSchemas["CameraSummary"];
export type CameraDetail = CameraSchemas["CameraDetail"];
export type CameraStatus = CameraSchemas["CameraStatus"];
export type CameraPose = CameraSchemas["Pose"];
export type CameraControlSession = CameraSchemas["ControlSession"];
export type CameraListResponse = { items: CameraSummary[] };

type CommandSchemas = commandComponents["schemas"];
export type DurableCommand = CommandSchemas["Command"];
export type DurableCommandRequest = CommandSchemas["CommandRequest"];
export type DurableCommandStatus = CommandSchemas["CommandStatus"];
export type DurableCommandList = CommandSchemas["CommandList"];
