import type { MemberSummary } from "@/shared/api/types";
import { toViewTimestamp } from "@/shared/lib/time";
import { roleLabel } from "@/shared/lib/labels";
import { catalogs, type CopyCatalog, type Locale } from "@/shared/lib/copy";

export interface MemberRowView {
  id: string;
  displayName: string;
  email: string;
  role: string;
  roleLabel: string;
  siteScopeLabel: string;
  siteScopeDetails: string[];
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
  lastLoginAtLabel: string;
  updatedByLabel: string;
  updatedAtLabel: string;
}

export function siteScopeDetails(member: MemberSummary, messages: CopyCatalog = catalogs.en): string[] {
  if (member.allSites) return [messages.members.allSites];
  return member.siteScopes.map((site) => site.name);
}

export function mapMemberSummary(dto: MemberSummary, timezone: string, locale: Locale = "en", messages: CopyCatalog = catalogs[locale]): MemberRowView {
  const sites = siteScopeDetails(dto, messages);
  return {
    id: dto.id,
    displayName: dto.displayName,
    email: dto.email,
    role: dto.role,
    roleLabel: roleLabel(dto.role, messages),
    siteScopeLabel: sites.join(", "),
    siteScopeDetails: sites,
    status: dto.status,
    lastLoginAtLabel: toViewTimestamp(dto.lastLoginAt, timezone, locale)?.absoluteLabel ?? messages.common.never,
    updatedByLabel: dto.updatedBy,
    updatedAtLabel: toViewTimestamp(dto.updatedAt, timezone, locale)?.absoluteLabel ?? "—",
  };
}
