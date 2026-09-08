import type { SessionResponse } from "@/shared/api/types";

export interface ResolvedContext {
  tenantId: string;
  siteId: string | null;
  hasAccessibleSite: boolean;
}

export function membershipForTenant(session: SessionResponse, tenantId: string) {
  return session.memberships.find((membership) => membership.tenant.id === tenantId);
}

/**
 * Context resolution order (normative clarification §3):
 * 1. URL tenant/site, accepted only when the session explicitly contains them.
 * 2. activeContext when valid.
 * 3. first allowed tenant, first allowed site.
 * 4. no allowed site -> NO_SITE_ACCESS.
 */
export function resolveContext(
  session: SessionResponse,
  requestedTenant?: string | null,
  requestedSite?: string | null,
): ResolvedContext {
  const noSite = (tenantId: string): ResolvedContext => ({
    tenantId,
    siteId: null,
    hasAccessibleSite: false,
  });

  if (session.memberships.length === 0) {
    return noSite(session.activeContext.tenantId);
  }

  const tryResolve = (
    tenantId?: string | null,
    siteId?: string | null,
  ): ResolvedContext | null => {
    if (!tenantId) return null;
    const membership = membershipForTenant(session, tenantId);
    if (!membership) return null;
    if (siteId) {
      const site = membership.sites.find((item) => item.id === siteId);
      if (!site) return null;
      return { tenantId, siteId, hasAccessibleSite: true };
    }
    const firstSite = membership.sites[0]?.id ?? null;
    return { tenantId, siteId: firstSite, hasAccessibleSite: firstSite !== null };
  };

  const fromUrl = tryResolve(requestedTenant, requestedSite);
  if (fromUrl) return fromUrl;

  const fromActive = tryResolve(session.activeContext.tenantId, session.activeContext.siteId);
  if (fromActive) return fromActive;

  const firstMembership = session.memberships[0] ?? null;
  if (!firstMembership) return noSite(session.activeContext.tenantId);

  const firstSite = firstMembership.sites[0]?.id ?? null;
  return {
    tenantId: firstMembership.tenant.id,
    siteId: firstSite,
    hasAccessibleSite: firstSite !== null,
  };
}