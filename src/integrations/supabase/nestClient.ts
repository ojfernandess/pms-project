import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { browserApiBase, isLocalDevHostname } from "@/lib/browserApiBase";
import { resolvePmsApiUrl } from "@/lib/runtimeConfig";

const SESSION_KEY = "pms.auth.session";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string | null };
};

type AuthListener = (event: string, session: StoredSession | null) => void;

type Filter = { column: string; op: string; value: unknown };

type ChangeHandler = {
  event: string;
  table: string;
  filter?: string;
  callback: (payload: { eventType: string; table: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => void;
};

const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

function apiBase(): string {
  if (typeof window !== "undefined" && !isLocalDevHostname()) {
    return browserApiBase();
  }
  return resolvePmsApiUrl();
}

function fetchSignal(external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), DEFAULT_FETCH_TIMEOUT_MS);
  if (!external) {
    return { signal: timeout.signal, cancel: () => clearTimeout(timer) };
  }
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([external, timeout.signal]), cancel: () => clearTimeout(timer) };
  }
  return { signal: external, cancel: () => clearTimeout(timer) };
}

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({} as { message?: unknown; error?: unknown }));
  const message = body.message ?? body.error;
  if (Array.isArray(message)) return message.join(", ");
  if (typeof message === "string") return message;
  if (message && typeof message === "object" && "message" in message && typeof message.message === "string") return message.message;
  return `Erro ${response.status}`;
}

export function createNestSupabase(): SupabaseClient<Database> {
  const listeners = new Set<AuthListener>();
  let refreshing: Promise<StoredSession | null> | null = null;

  const emit = (event: string, session: StoredSession | null) => {
    for (const listener of listeners) listener(event, session);
  };

  const refresh = async (session: StoredSession): Promise<StoredSession | null> => {
    const response = await fetch(`${apiBase()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refresh_token }),
    });
    if (!response.ok) {
      writeSession(null);
      emit("SIGNED_OUT", null);
      return null;
    }
    const body = await response.json() as { accessToken: string; refreshToken: string; user: { id: string; email: string } };
    const next = storeIssued(body);
    emit("TOKEN_REFRESHED", next);
    return next;
  };

  const currentSession = async (): Promise<StoredSession | null> => {
    const session = readSession();
    if (!session) return null;
    if (session.expires_at * 1000 > Date.now() + 30_000) return session;
    refreshing ??= refresh(session).finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  const authHeaders = async (json = true): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (json) headers["Content-Type"] = "application/json";
    const session = await currentSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  };

  const channels = new Set<NestChannel>();
  let socket: { connected: boolean; emit: (event: string, payload: unknown) => void; on: (event: string, cb: (payload: unknown) => void) => void; once: (event: string, cb: () => void) => void; disconnect: () => void } | null = null;

  const ensureSocket = async () => {
    if (socket) return socket;
    const { io } = await import("socket.io-client");
    const session = await currentSession();
    const next = io(`${apiBase()}/realtime`, { auth: { token: session?.access_token ?? "" }, transports: ["websocket"] });
    next.on("postgres_changes", (payload: { eventType: string; table: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
      for (const channel of channels) channel.dispatch(payload);
    });
    socket = next;
    return next;
  };

  class NestChannel {
    private handlers: ChangeHandler[] = [];
    constructor(private readonly name: string) {}

    on(_type: string, filter: { event?: string; table: string; filter?: string }, callback: ChangeHandler["callback"]) {
      this.handlers.push({ event: filter.event || "*", table: filter.table, filter: filter.filter, callback });
      return this;
    }

    subscribe(callback?: (status: string) => void) {
      channels.add(this);
      void ensureSocket().then((sock) => {
        const send = () => {
          for (const handler of this.handlers) sock.emit("listen", { table: handler.table, filter: handler.filter, channel: this.name });
          callback?.("SUBSCRIBED");
        };
        if (sock.connected) send();
        else sock.once("connect", send);
      });
      return this;
    }

    dispatch(payload: { eventType: string; table: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) {
      for (const handler of this.handlers) {
        if (handler.table !== payload.table) continue;
        if (handler.event !== "*" && handler.event !== payload.eventType) continue;
        if (handler.filter && !matches(handler.filter, payload.new || payload.old)) continue;
        handler.callback(payload);
      }
    }

    unsubscribe() {
      channels.delete(this);
      if (channels.size === 0) {
        socket?.disconnect();
        socket = null;
      }
    }
  }

  class QueryBuilder implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; count: number | null }> {
    private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private selection: string | null = null;
    private filters: Filter[] = [];
    private ors: string[] = [];
    private orders: { column: string; ascending?: boolean; nullsFirst?: boolean }[] = [];
    private rowLimit: number | null = null;
    private rowOffset: number | null = null;
    private values: Record<string, unknown> | Record<string, unknown>[] | null = null;
    private conflict: string | null = null;
    private countMode: "exact" | null = null;
    private head = false;
    private one: "single" | "maybe" | null = null;
    private signal: AbortSignal | undefined;

    constructor(private readonly table: string) {}

    select(columns?: string, options?: { count?: "exact"; head?: boolean }) {
      if (this.action === "select" && !this.values) this.action = "select";
      this.selection = columns ?? "*";
      this.countMode = options?.count ?? this.countMode;
      this.head = options?.head === true;
      return this;
    }

    insert(values: Record<string, unknown> | Record<string, unknown>[]) {
      this.action = "insert";
      this.values = values;
      return this;
    }

    update(values: Record<string, unknown>) {
      this.action = "update";
      this.values = values;
      return this;
    }

    upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
      this.action = "upsert";
      this.values = values;
      this.conflict = options?.onConflict ?? null;
      return this;
    }

    delete() {
      this.action = "delete";
      return this;
    }

    eq(column: string, value: unknown) { return this.filter(column, "eq", value); }
    neq(column: string, value: unknown) { return this.filter(column, "neq", value); }
    gt(column: string, value: unknown) { return this.filter(column, "gt", value); }
    gte(column: string, value: unknown) { return this.filter(column, "gte", value); }
    lt(column: string, value: unknown) { return this.filter(column, "lt", value); }
    lte(column: string, value: unknown) { return this.filter(column, "lte", value); }
    like(column: string, value: unknown) { return this.filter(column, "like", value); }
    ilike(column: string, value: unknown) { return this.filter(column, "ilike", value); }
    is(column: string, value: unknown) { return this.filter(column, "is", value); }
    in(column: string, value: unknown) { return this.filter(column, "in", value); }
    contains(column: string, value: unknown) { return this.filter(column, "cs", value); }
    containedBy(column: string, value: unknown) { return this.filter(column, "cd", value); }
    overlaps(column: string, value: unknown) { return this.filter(column, "ov", value); }
    not(column: string, operator: string, value: unknown) { return this.filter(column, `not.${operator}`, value); }
    or(filters: string) { this.ors.push(filters); return this; }
    match(record: Record<string, unknown>) {
      for (const [column, value] of Object.entries(record)) this.eq(column, value);
      return this;
    }
    filter(column: string, operator: string, value: unknown) {
      this.filters.push({ column, op: operator, value });
      return this;
    }
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      this.orders.push({ column, ascending: options?.ascending, nullsFirst: options?.nullsFirst });
      return this;
    }
    limit(count: number) { this.rowLimit = count; return this; }
    range(from: number, to: number) {
      this.rowOffset = from;
      this.rowLimit = to - from + 1;
      return this;
    }
    single() { this.one = "single"; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
    throwOnError() { return this; }
    returns() { return this; }
    csv() { return this; }

    then<TResult1 = { data: unknown; error: { message: string; code?: string } | null; count: number | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string; code?: string } | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }

    private async execute() {
      const { signal, cancel } = fetchSignal(this.signal);
      try {
        const response = await fetch(`${apiBase()}/rest/v1/query`, {
          method: "POST",
          headers: await authHeaders(),
          signal,
          body: JSON.stringify({
            action: this.action,
            table: this.table,
            select: this.selection,
            filters: this.filters,
            or: this.ors,
            order: this.orders,
            limit: this.rowLimit,
            offset: this.rowOffset,
            values: this.values,
            onConflict: this.conflict,
            count: this.countMode,
            head: this.head,
            single: this.one === "single",
            maybeSingle: this.one === "maybe",
          }),
        });
        const body = await response.json().catch(() => ({ data: null, error: { message: `Erro ${response.status}` }, count: null }));
        if (!response.ok && !body.error) return { data: null, error: { message: `Erro ${response.status}` }, count: null };
        return { data: body.data ?? null, error: body.error ?? null, count: body.count ?? null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "Erro de conexão" }, count: null };
      } finally {
        cancel();
      }
    }
  }

  const auth = {
    async signInWithPassword(credentials: { email: string; password: string }) {
      try {
        const response = await fetch(`${apiBase()}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        if (!response.ok) return { data: { user: null, session: null }, error: { message: await errorMessage(response) } };
        const body = await response.json() as { accessToken: string; refreshToken: string; user: { id: string; email: string } };
        const session = storeIssued(body);
        emit("SIGNED_IN", session);
        return { data: { user: asUser(session.user), session: asSession(session) }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: { message: error instanceof Error ? error.message : "Erro de conexão" } };
      }
    },
    async signUp(credentials: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      try {
        const response = await fetch(`${apiBase()}/auth/signup`, {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ email: credentials.email, password: credentials.password, full_name: credentials.options?.data?.full_name, data: credentials.options?.data }),
        });
        if (!response.ok) return { data: { user: null, session: null }, error: { message: await errorMessage(response) } };
        const body = await response.json() as { id: string; email: string };
        return { data: { user: asUser(body), session: null }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: { message: error instanceof Error ? error.message : "Erro de conexão" } };
      }
    },
    async signOut() {
      const session = readSession();
      writeSession(null);
      emit("SIGNED_OUT", null);
      if (session?.refresh_token) {
        await fetch(`${apiBase()}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refresh_token }),
        }).catch(() => undefined);
      }
      return { error: null };
    },
    async getSession() {
      try {
        const session = await currentSession();
        return { data: { session: session ? asSession(session) : null }, error: null };
      } catch (error) {
        return { data: { session: null }, error: { message: error instanceof Error ? error.message : "Erro de sessão" } };
      }
    },
    async getUser() {
      const session = await currentSession();
      if (!session) return { data: { user: null }, error: null };
      const response = await fetch(`${apiBase()}/auth/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) return { data: { user: null }, error: { message: await errorMessage(response) } };
      const body = await response.json() as { id: string; email: string };
      return { data: { user: asUser(body) }, error: null };
    },
    async updateUser(attributes: { password?: string; email?: string; data?: Record<string, unknown> }) {
      const response = await fetch(`${apiBase()}/auth/password`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(attributes),
      });
      if (!response.ok) return { data: { user: null }, error: { message: await errorMessage(response) } };
      const body = await response.json() as { id: string; email: string };
      const session = readSession();
      if (session) {
        session.user = { id: body.id, email: body.email };
        writeSession(session);
      }
      return { data: { user: asUser(body) }, error: null };
    },
    async resetPasswordForEmail(email: string) {
      const response = await fetch(`${apiBase()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) return { data: null, error: { message: await errorMessage(response) } };
      return { data: {}, error: null };
    },
    async setSession(next: { access_token: string; refresh_token: string }) {
      const response = await fetch(`${apiBase()}/auth/me`, { headers: { Authorization: `Bearer ${next.access_token}` } });
      if (!response.ok) return { data: { session: null }, error: { message: await errorMessage(response) } };
      const body = await response.json() as { id: string; email: string };
      const session: StoredSession = { ...next, expires_at: expiry(next.access_token), user: body };
      writeSession(session);
      emit("SIGNED_IN", session);
      return { data: { session: asSession(session) }, error: null };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      const session = readSession();
      queueMicrotask(() => callback("INITIAL_SESSION", session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
  };

  const client = {
    auth,
    from(table: string) {
      return new QueryBuilder(table);
    },
    schema() {
      return client;
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      try {
        const response = await fetch(`${apiBase()}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify(args ?? {}),
        });
        const body = await response.json().catch(() => ({ data: null, error: { message: `Erro ${response.status}` } }));
        return { data: body.data ?? null, error: body.error ?? (response.ok ? null : { message: `Erro ${response.status}` }) };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "Erro de conexão" } };
      }
    },
    channel(name: string) {
      return new NestChannel(name);
    },
    removeChannel(channel: NestChannel) {
      channel.unsubscribe();
      return Promise.resolve("ok");
    },
    functions: {
      invoke(name: string, options?: { body?: unknown; headers?: Record<string, string> }) {
        return invokeFunction(name, options, authHeaders);
      },
    },
    storage: {
      async listBuckets() {
        try {
          const response = await fetch(`${apiBase()}/storage/v1/bucket`, { headers: await authHeaders() });
          const body = await response.json().catch(() => ({ data: [], error: { message: `Erro ${response.status}` } }));
          if (!response.ok) return { data: null, error: { message: body.error?.message || `Erro ${response.status}` } };
          return { data: body.data ?? [], error: null };
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : "Erro de conexão" } };
        }
      },
      from(bucket: string) {
        const encoded = bucket.split("/").map(encodeURIComponent).join("/");
        return {
          async upload(path: string, file: Blob, options?: { upsert?: boolean; contentType?: string }) {
            const target = path.split("/").map(encodeURIComponent).join("/");
            const headers = await authHeaders(false);
            headers["Content-Type"] = options?.contentType || file.type || "application/octet-stream";
            if (options?.upsert) headers["x-upsert"] = "true";
            const response = await fetch(`${apiBase()}/storage/v1/object/${encoded}/${target}`, { method: "POST", headers, body: file });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) return { data: null, error: { message: body.error?.message || `Erro ${response.status}` } };
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            const target = path.split("/").map(encodeURIComponent).join("/");
            return { data: { publicUrl: `${apiBase()}/storage/v1/object/public/${encoded}/${target}` } };
          },
          async createSignedUrl(path: string, expiresIn: number) {
            const target = path.split("/").map(encodeURIComponent).join("/");
            const response = await fetch(`${apiBase()}/storage/v1/object/sign/${encoded}/${target}`, {
              method: "POST",
              headers: await authHeaders(),
              body: JSON.stringify({ expiresIn }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) return { data: null, error: { message: body.error?.message || `Erro ${response.status}` } };
            return { data: { signedUrl: body.signedUrl as string }, error: null };
          },
        };
      },
    },
  };

  return client as unknown as SupabaseClient<Database>;
}

async function invokeFunction(name: string, options: { body?: unknown; headers?: Record<string, string> } | undefined, authHeaders: (json?: boolean) => Promise<Record<string, string>>) {
  const headers = { ...(await authHeaders()), ...(options?.headers ?? {}) };
  const response = await fetch(`${apiBase()}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(options?.body ?? {}),
  });
  const data = await response.json().catch(() => null);
  const wrapped = {
    ok: response.ok,
    status: response.status,
    clone() { return { json: async () => data }; },
  };
  if (!response.ok) {
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const message = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : `Erro ${response.status}`;
    return { data, error: { message }, response: wrapped };
  }
  return { data, error: null, response: wrapped };
}

function storeIssued(body: { accessToken: string; refreshToken: string; user: { id: string; email: string } }): StoredSession {
  const session: StoredSession = {
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
    expires_at: expiry(body.accessToken),
    user: body.user,
  };
  writeSession(session);
  return session;
}

function expiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (payload.exp) return payload.exp;
  } catch {
    /* token opaco */
  }
  return Math.floor(Date.now() / 1000) + 14 * 60;
}

function asUser(user: { id: string; email?: string | null }) {
  return {
    id: user.id,
    email: user.email ?? undefined,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "",
    updated_at: "",
  };
}

function asSession(session: StoredSession) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: Math.max(0, session.expires_at - Math.floor(Date.now() / 1000)),
    token_type: "bearer",
    user: asUser(session.user),
  };
}

function matches(filter: string, row: Record<string, unknown> | null): boolean {
  const match = filter.match(/^([A-Za-z_][A-Za-z0-9_]*)=eq\.(.+)$/);
  if (!match || !row) return false;
  return String(row[match[1]]) === match[2];
}
