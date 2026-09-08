import { LoginForm } from "@/features/session/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-console-bg p-6">
      <LoginForm returnTo={params.returnTo ?? "/overview"} />
    </div>
  );
}