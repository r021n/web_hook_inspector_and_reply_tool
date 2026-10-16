import { describe, expect, test } from "vitest";
import {
  emitNewWebhook,
  type NewWebhookEvent,
  newWebhookSubscriberCount,
  onNewWebhook,
} from "./bus.ts";

function makeEvent(overrides: Partial<NewWebhookEvent> = {}): NewWebhookEvent {
  return {
    id: "e3366c4b-d81d-46eb-8992-97b9809307ac",
    token: "test",
    method: "POST",
    path: "/in/test",
    query: "",
    contentType: "application/json",
    bodySize: 13,
    receivedAt: 1791269374858,
    ...overrides,
  };
}

describe("bus internal new-webhook", () => {
  test("subscriber menerima payload yang di-emit", () => {
    const received: NewWebhookEvent[] = [];
    const unsubscribe = onNewWebhook((event) => {
      received.push(event);
    });
    try {
      emitNewWebhook(makeEvent());
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(makeEvent());
    } finally {
      unsubscribe();
    }
  });

  test("unsubscribe berhenti menerima event berikutnya", () => {
    const received: NewWebhookEvent[] = [];
    const unsubscribe = onNewWebhook((event) => {
      received.push(event);
    });

    emitNewWebhook(makeEvent());
    unsubscribe();
    emitNewWebhook(makeEvent());

    expect(received).toHaveLength(1);
  });

  test("unsubscribe idempoten — dipanggil dua kali tidak melempar error", () => {
    const unsubscribe = onNewWebhook(() => {});
    unsubscribe();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  test("banyak subscriber (banyak klien SSE) menerima event yang sama", () => {
    const first: NewWebhookEvent[] = [];
    const second: NewWebhookEvent[] = [];
    const unsub1 = onNewWebhook((event) => {
      first.push(event);
    });
    const unsub2 = onNewWebhook((event) => {
      second.push(event);
    });
    try {
      emitNewWebhook(makeEvent({ id: "11111111-1111-4111-8111-111111111111" }));
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]?.id).toBe(second[0]?.id);
    } finally {
      unsub1();
      unsub2();
    }
  });

  test("subscriber count kembali ke nol setelah semua unsubscribe (tidak leak)", () => {
    const before = newWebhookSubscriberCount();
    const unsub1 = onNewWebhook(() => {});
    const unsub2 = onNewWebhook(() => {});
    expect(newWebhookSubscriberCount()).toBe(before + 2);
    unsub1();
    unsub2();
    expect(newWebhookSubscriberCount()).toBe(before);
    expect(before).toBe(0);
  });
});
