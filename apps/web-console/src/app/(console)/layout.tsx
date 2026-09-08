import { SessionProvider } from "@/features/session";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}