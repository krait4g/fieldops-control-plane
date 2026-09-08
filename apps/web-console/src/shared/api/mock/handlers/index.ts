import type { HttpHandler } from "msw";
import { sessionHandlers } from "./session.handlers";
import { overviewHandlers } from "./overview.handlers";
import { deviceHandlers } from "./device.handlers";
import { memberHandlers } from "./member.handlers";

export const handlers: HttpHandler[] = [
  ...sessionHandlers,
  ...overviewHandlers,
  ...deviceHandlers,
  ...memberHandlers,
];