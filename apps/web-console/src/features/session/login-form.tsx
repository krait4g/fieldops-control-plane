"use client";

import { useRouter } from "next/navigation";
import { usesMock } from "@/shared/api/bootstrap";
import { setSessionScenario, type SessionScenario } from "@/shared/api/mock/session-store";
import { Button } from "@/shared/ui/button";
import { useI18n } from "@/shared/i18n";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const isMock = usesMock();
  const { messages } = useI18n();
  const scenarios: Array<{ value: SessionScenario; label: string; description: string }> = [
    { value: "admin", label: messages.login.tenantAdmin, description: messages.login.tenantAdminDescription },
    { value: "viewer", label: messages.login.tenantViewer, description: messages.login.tenantViewerDescription },
    { value: "no-site", label: messages.login.noSiteAccess, description: messages.login.noSiteAccessDescription },
  ];

  const choose = (scenario: SessionScenario) => {
    if (isMock) setSessionScenario(scenario);
    router.replace(returnTo);
  };

  const signIn = () => {
    // OAuth must perform a document navigation so redirects and cookies are handled by the browser.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/api/v1/oauth2/authorization/keycloak");
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-console-surface-1 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">FieldOps</h1>
        <p className="mt-1 text-sm text-text-secondary">{messages.shell.operationsConsole}</p>
      </div>

      {isMock ? (
        <div className="space-y-3" data-testid="fixture-session-selector">
          <p className="text-xs text-text-muted">
            {messages.login.fixtureIntro}
          </p>
          {scenarios.map((scenario) => (
            <button
              key={scenario.value}
              data-testid={`fixture-session-${scenario.value}`}
              type="button"
              onClick={() => choose(scenario.value)}
              className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-console-surface-2 px-4 py-3 text-left transition-colors hover:bg-border-subtle"
            >
              <span>
                <span className="block text-sm font-semibold text-text-primary">{scenario.label}</span>
                <span className="block text-xs text-text-muted">{scenario.description}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Button className="w-full" onClick={signIn}>
            {messages.actions.signIn}
          </Button>
          <p className="text-center text-xs text-text-muted">
            {messages.login.keycloakHint}
          </p>
        </div>
      )}
    </div>
  );
}
