import { EventEmitter } from "node:events";

export const eventBus = new EventEmitter();

export type ServerEvent =
  | { type: "conversation.updated"; conversationId: string }
  | { type: "message.added"; conversationId: string };

export function emitEvent(event: ServerEvent) {
  eventBus.emit("event", event);
}
