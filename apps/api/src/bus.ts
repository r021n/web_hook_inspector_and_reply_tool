import { EventEmitter } from "node:events";
import type { RequestSummary } from "./validation.ts";

export type NewWebhookEvent = RequestSummary & {token: string};

const NEW_WEBHOOK = "new-webhook";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function emitnewWebhook(event: NewWebhookEvent): void {
    bus.emit(NEW_WEBHOOK, event);
}

export function onNewWebhook(
    listener: (event: NewWebhookEvent) => void,
): () => void {
    bus.on(NEW_WEBHOOK, listener);
    return () => {
        bus.off(NEW_WEBHOOK, listener);
    }
}

export function newWebhookSubscriberCount(): number {
    return bus.listenerCount(NEW_WEBHOOK);
}