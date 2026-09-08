import sessionAdmin from "../../../../../../fixtures/m1/session/session-admin.json";
import sessionViewer from "../../../../../../fixtures/m1/session/session-viewer.json";
import sessionNoSite from "../../../../../../fixtures/m1/session/session-no-site.json";

import overviewNormal from "../../../../../../fixtures/m1/overview/overview-normal.json";
import overviewPartial from "../../../../../../fixtures/m1/overview/overview-partial.json";
import overviewStale from "../../../../../../fixtures/m1/overview/overview-stale.json";
import overviewEmpty from "../../../../../../fixtures/m1/overview/overview-empty.json";
import environmentSeries from "../../../../../../fixtures/m1/overview/environment-series-24h.json";

import deviceListNormal from "../../../../../../fixtures/m1/devices/device-list-normal.json";
import deviceListEmpty from "../../../../../../fixtures/m1/devices/device-list-empty.json";
import deviceDetailOnline from "../../../../../../fixtures/m1/devices/device-detail-online.json";
import deviceDetailOffline from "../../../../../../fixtures/m1/devices/device-detail-offline.json";
import deviceStateLive from "../../../../../../fixtures/m1/devices/device-state-live.json";
import deviceStateStale from "../../../../../../fixtures/m1/devices/device-state-stale.json";

import memberList from "../../../../../../fixtures/m1/members/member-list.json";
import memberListEmpty from "../../../../../../fixtures/m1/members/member-list-empty.json";

import series24h from "../../../../../../fixtures/m1/telemetry/series-24h.json";

import errorForbidden from "../../../../../../fixtures/m1/errors/problem-forbidden.json";
import errorNotFound from "../../../../../../fixtures/m1/errors/problem-not-found.json";
import errorUnauthorized from "../../../../../../fixtures/m1/errors/problem-unauthorized.json";
import errorInvalidQuery from "../../../../../../fixtures/m1/errors/problem-invalid-query.json";
import errorRateLimited from "../../../../../../fixtures/m1/errors/problem-rate-limited.json";
import errorReadModelUnavailable from "../../../../../../fixtures/m1/errors/problem-read-model-unavailable.json";

import eventStateUpdated from "../../../../../../fixtures/m1/realtime/device-state-updated.json";
import eventStateStaleVersion from "../../../../../../fixtures/m1/realtime/device-state-updated-stale-version.json";
import eventLifecycleChanged from "../../../../../../fixtures/m1/realtime/device-lifecycle-changed.json";
import eventSnapshotRequired from "../../../../../../fixtures/m1/realtime/snapshot-required.json";
import eventHeartbeat from "../../../../../../fixtures/m1/realtime/heartbeat.json";

export const fixtures = {
  session: { admin: sessionAdmin, viewer: sessionViewer, noSite: sessionNoSite },
  overview: {
    normal: overviewNormal,
    partial: overviewPartial,
    stale: overviewStale,
    empty: overviewEmpty,
  },
  environmentSeries,
  devices: {
    list: deviceListNormal,
    listEmpty: deviceListEmpty,
    detailOnline: deviceDetailOnline,
    detailOffline: deviceDetailOffline,
    stateLive: deviceStateLive,
    stateStale: deviceStateStale,
  },
  telemetry: { series24h },
  members: { list: memberList, empty: memberListEmpty },
  errors: {
    forbidden: errorForbidden,
    notFound: errorNotFound,
    unauthorized: errorUnauthorized,
    invalidQuery: errorInvalidQuery,
    rateLimited: errorRateLimited,
    readModelUnavailable: errorReadModelUnavailable,
  },
  realtime: {
    stateUpdated: eventStateUpdated,
    stateStaleVersion: eventStateStaleVersion,
    lifecycleChanged: eventLifecycleChanged,
    snapshotRequired: eventSnapshotRequired,
    heartbeat: eventHeartbeat,
  },
} as const;