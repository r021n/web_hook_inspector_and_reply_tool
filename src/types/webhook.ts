export interface WebhookRequest {
  id: string;
  sessionId: string;
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string | null;
  contentType: string | null;
  clientIp: string;
  timestamp: number;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}
