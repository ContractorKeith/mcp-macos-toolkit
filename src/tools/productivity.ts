import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { ProcessRunner } from "../core/process-runner.js";
import { failure, fromProcess, ok } from "../core/results.js";

interface ProductivityDeps {
  runner: ProcessRunner;
  allowWrites: boolean;
}

const CALENDAR_LIST_SCRIPT = [
  'tell application "Calendar"',
  "set output to {}",
  "repeat with cal in calendars",
  "set end of output to (name of cal)",
  "end repeat",
  "end tell",
  "set AppleScript's text item delimiters to linefeed",
  "return output as text",
];

const REMINDERS_LIST_SCRIPT = [
  'tell application "Reminders"',
  "set output to {}",
  "repeat with reminderList in lists",
  "set end of output to (name of reminderList)",
  "end repeat",
  "end tell",
  "set AppleScript's text item delimiters to linefeed",
  "return output as text",
];

const DATE_FROM_PARTS_HANDLER = [
  "on dateFromParts(argv, startIndex)",
  "set parsedDate to current date",
  "set year of parsedDate to (item startIndex of argv as integer)",
  "set month of parsedDate to (item (startIndex + 1) of argv as integer)",
  "set day of parsedDate to (item (startIndex + 2) of argv as integer)",
  "set time of parsedDate to ((item (startIndex + 3) of argv as integer) * 3600 + (item (startIndex + 4) of argv as integer) * 60 + (item (startIndex + 5) of argv as integer))",
  "return parsedDate",
  "end dateFromParts",
];

function dateParts(iso: string): string[] {
  const date = new Date(iso);
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map(String);
}

function osascript(
  lines: readonly string[],
  args: readonly string[] = [],
): string[] {
  return [...lines.flatMap((line) => ["-e", line]), "--", ...args];
}

export function registerProductivityTools(
  server: McpServer,
  deps: ProductivityDeps,
): void {
  server.registerTool(
    "productivity_calendars_list",
    {
      title: "List Calendars",
      description: "List calendar names through a fixed AppleScript template.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const result = await deps.runner.run({
        command: "/usr/bin/osascript",
        args: osascript(CALENDAR_LIST_SCRIPT),
        timeoutMs: 15_000,
      });
      if (result.exitCode !== 0)
        return fromProcess("Listing calendars", result);
      const calendars = result.stdout
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
      return ok(`Found ${calendars.length} calendars.`, { calendars });
    },
  );

  server.registerTool(
    "productivity_calendar_events",
    {
      title: "List Calendar Events",
      description:
        "List up to 100 events from one calendar in a bounded date window.",
      inputSchema: z.object({
        calendar: z.string().trim().min(1).max(200),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ calendar, start, end }) => {
      if (Date.parse(end) <= Date.parse(start))
        return failure("Event query end must be after start.");
      if (Date.parse(end) - Date.parse(start) > 1000 * 60 * 60 * 24 * 93) {
        return failure("Calendar queries are limited to a 93-day window.");
      }
      const script = [
        ...DATE_FROM_PARTS_HANDLER,
        "on run argv",
        "set calendarName to item 1 of argv",
        "set startDate to my dateFromParts(argv, 2)",
        "set endDate to my dateFromParts(argv, 8)",
        "set output to {}",
        'tell application "Calendar"',
        "set matchingEvents to every event of calendar calendarName whose start date ≥ startDate and start date ≤ endDate",
        "set eventCount to count of matchingEvents",
        "if eventCount > 100 then set eventCount to 100",
        "repeat with eventIndex from 1 to eventCount",
        "set calendarEvent to item eventIndex of matchingEvents",
        "set end of output to ((summary of calendarEvent) & tab & ((start date of calendarEvent) as string) & tab & ((end date of calendarEvent) as string))",
        "end repeat",
        "end tell",
        "set AppleScript's text item delimiters to linefeed",
        "return output as text",
        "end run",
      ];
      const result = await deps.runner.run({
        command: "/usr/bin/osascript",
        args: osascript(script, [
          calendar,
          ...dateParts(start),
          ...dateParts(end),
        ]),
        timeoutMs: 20_000,
      });
      if (result.exitCode !== 0)
        return fromProcess("Listing calendar events", result);
      const events = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [title = "", eventStart = "", eventEnd = ""] = line.split("\t");
          return { title, start: eventStart, end: eventEnd };
        });
      return ok(`Found ${events.length} calendar events.`, {
        calendar,
        events,
      });
    },
  );

  server.registerTool(
    "productivity_reminder_lists",
    {
      title: "List Reminder Lists",
      description:
        "List Apple Reminders list names through a fixed AppleScript template.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const result = await deps.runner.run({
        command: "/usr/bin/osascript",
        args: osascript(REMINDERS_LIST_SCRIPT),
        timeoutMs: 15_000,
      });
      if (result.exitCode !== 0)
        return fromProcess("Listing reminder lists", result);
      const lists = result.stdout
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
      return ok(`Found ${lists.length} reminder lists.`, { lists });
    },
  );

  server.registerTool(
    "productivity_reminders_list",
    {
      title: "List Reminders",
      description: "List up to 100 reminders from one Apple Reminders list.",
      inputSchema: z.object({
        list: z.string().trim().min(1).max(200),
        includeCompleted: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ list, includeCompleted }) => {
      const script = [
        "on run argv",
        "set listName to item 1 of argv",
        'set includeDone to item 2 of argv is "true"',
        "set output to {}",
        'tell application "Reminders"',
        "set allReminders to reminders of list listName",
        "repeat with theReminder in allReminders",
        "if includeDone or completed of theReminder is false then",
        "set end of output to ((name of theReminder) & tab & ((completed of theReminder) as string))",
        "if (count of output) ≥ 100 then exit repeat",
        "end if",
        "end repeat",
        "end tell",
        "set AppleScript's text item delimiters to linefeed",
        "return output as text",
        "end run",
      ];
      const result = await deps.runner.run({
        command: "/usr/bin/osascript",
        args: osascript(script, [list, String(includeCompleted)]),
        timeoutMs: 20_000,
      });
      if (result.exitCode !== 0)
        return fromProcess("Listing reminders", result);
      const reminders = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [title = "", completed = "false"] = line.split("\t");
          return { title, completed: completed === "true" };
        });
      return ok(`Found ${reminders.length} reminders.`, { list, reminders });
    },
  );

  server.registerTool(
    "productivity_calendar_create",
    {
      title: "Create Calendar Event",
      description:
        "Create a single event using a fixed AppleScript template. Writes are disabled by default.",
      inputSchema: z.object({
        calendar: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(500),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        notes: z.string().max(5_000).default(""),
        confirm: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ calendar, title, start, end, notes }) => {
      if (!deps.allowWrites) {
        return failure(
          "Calendar writes are disabled. Set MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true at startup.",
        );
      }
      if (Date.parse(end) <= Date.parse(start))
        return failure("Event end must be after its start.");
      const script = [
        ...DATE_FROM_PARTS_HANDLER,
        "on run argv",
        "set calendarName to item 1 of argv",
        "set eventTitle to item 2 of argv",
        "set startDate to my dateFromParts(argv, 3)",
        "set endDate to my dateFromParts(argv, 9)",
        "set eventNotes to item 15 of argv",
        'tell application "Calendar"',
        "tell calendar calendarName",
        "make new event with properties {summary:eventTitle, start date:startDate, end date:endDate, description:eventNotes}",
        "end tell",
        "end tell",
        "return eventTitle",
        "end run",
      ];
      return fromProcess(
        "Creating calendar event",
        await deps.runner.run({
          command: "/usr/bin/osascript",
          args: osascript(script, [
            calendar,
            title,
            ...dateParts(start),
            ...dateParts(end),
            notes,
          ]),
          timeoutMs: 20_000,
        }),
      );
    },
  );

  server.registerTool(
    "productivity_reminder_create",
    {
      title: "Create Reminder",
      description:
        "Create one Apple Reminder using a fixed AppleScript template. Writes are disabled by default.",
      inputSchema: z.object({
        list: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(500),
        notes: z.string().max(5_000).default(""),
        confirm: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ list, title, notes }) => {
      if (!deps.allowWrites) {
        return failure(
          "Reminder writes are disabled. Set MCP_MACOS_ALLOW_PRODUCTIVITY_WRITES=true at startup.",
        );
      }
      const script = [
        "on run argv",
        "set listName to item 1 of argv",
        "set reminderTitle to item 2 of argv",
        "set reminderNotes to item 3 of argv",
        'tell application "Reminders"',
        "tell list listName",
        "make new reminder with properties {name:reminderTitle, body:reminderNotes}",
        "end tell",
        "end tell",
        "return reminderTitle",
        "end run",
      ];
      return fromProcess(
        "Creating reminder",
        await deps.runner.run({
          command: "/usr/bin/osascript",
          args: osascript(script, [list, title, notes]),
          timeoutMs: 20_000,
        }),
      );
    },
  );
}
