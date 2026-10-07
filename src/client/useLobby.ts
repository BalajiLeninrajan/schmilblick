import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMsg, LobbyState, ServerMsg } from "../shared/protocol";

const TOKEN_KEY = "schmilblick.token";
const NAME_KEY = "schmilblick.name";

function store(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
  return null;
}

let memToken: string | null = null;
export function myToken() {
  const saved = store(TOKEN_KEY) ?? memToken;
  if (saved) return saved;
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  const t = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => abc[b % abc.length]).join("");
  memToken = t;
  store(TOKEN_KEY, t);
  return t;
}

export const savedName = () => store(NAME_KEY) ?? "";
export const saveName = (name: string) => store(NAME_KEY, name);

export type Conn = "connecting" | "open" | "closed" | "missing";

export function useLobby(code: string) {
  const [state, setState] = useState<LobbyState | null>(null);
  const [you, setYou] = useState<string>("");
  const [conn, setConn] = useState<Conn>("connecting");
  const [error, setError] = useState<{ message: string; at: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function connect() {
      if (stopped) return;
      setConn("connecting");
      const info = await fetch(`/api/lobbies/${code}`)
        .then((r) => r.json() as Promise<{ exists?: boolean }>)
        .catch(() => null);
      if (stopped) return;
      if (info && !info.exists) {
        setConn("missing");
        return;
      }
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${location.host}/api/lobbies/${code}/ws?token=${myToken()}`);
      ws.current = sock;
      sock.onopen = () => {
        retry = 0;
        setConn("open");
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.t === "state") {
          setState(msg.state);
          setYou(msg.you);
          // A returning name joins on its own.
          const name = savedName();
          if (msg.you.startsWith("pending:") && name) sock.send(JSON.stringify({ t: "join", name } satisfies ClientMsg));
        } else setError({ message: msg.message, at: Date.now() });
      };
      sock.onclose = (ev) => {
        if (ws.current === sock) ws.current = null;
        if (stopped || ev.reason === "left") return;
        setConn("closed");
        timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [code]);

  const send = useCallback((msg: ClientMsg) => {
    if (msg.t === "join") saveName(msg.name);
    ws.current?.send(JSON.stringify(msg));
  }, []);

  return { state, you, conn, error, send };
}
