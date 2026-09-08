import {
  LayoutDashboard,
  Radio,
  Users,
  MapPinned,
  Camera,
  BellRing,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  devices: Radio,
  members: Users,
  sites: MapPinned,
  cameras: Camera,
  alarms: BellRing,
  commands: TerminalSquare,
};

export function navIcon(name: string): LucideIcon {
  return icons[name] ?? LayoutDashboard;
}