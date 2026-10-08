import { useEffect, useRef, useState } from "react";
import { CODE_ALPHABET, CODE_LENGTH, NAME_MAX, isCode } from "../shared/protocol";
import { navigate, Wordmark } from "./App";
import { ArrowIcon, CuteCard } from "./art";
import { Rules, RulesButton } from "./Sheet";
import { saveName, savedName } from "./useLobby";

/** Sets data-more on a scroll box while there's content below the fold, so CSS can fade its bottom edge. */
function useMoreBelow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => el.toggleAttribute("data-more", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return ref;
}

type Mode = "choose" | "create" | "join";
type ErrField = "name" | "code" | "form";

export function Home() {
  const [mode, setMode] = useState<Mode>("choose");
  const rulesRef = useMoreBelow<HTMLDivElement>();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: ErrField | null; message: string }>({ field: null, message: "" });
  const fail = (field: ErrField, message: string) => setErr({ field, message });

  function pick(next: Mode) {
    setMode(next);
    setErr({ field: null, message: "" });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return fail("name", "Pick a name first.");
    setBusy(true);
    setErr({ field: null, message: "" });
    saveName(name.trim());
    try {
      const r = await fetch("/api/lobbies", { method: "POST" });
      const { code } = (await r.json()) as { code?: string };
      if (!code) throw new Error();
      navigate(`/${code}`);
    } catch {
      fail("form", "Couldn't make a room. Try again?");
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!name.trim()) return fail("name", "Pick a name first.");
    if (!isCode(c)) return fail("code", `Codes are ${CODE_LENGTH} letters.`);
    setBusy(true);
    setErr({ field: null, message: "" });
    const info = (await fetch(`/api/lobbies/${c}`)
      .then((r) => r.json())
      .catch(() => null)) as { exists?: boolean } | null;
    setBusy(false);
    if (!info?.exists) return fail("code", `No room called ${c}.`);
    saveName(name.trim());
    navigate(`/${c}`);
  }

  return (
    <>
      <header className="topbar is-split">
        <Wordmark />
        <div className="cn-row">
          <span className="sb-narrow-only">
            <RulesButton />
          </span>
        </div>
      </header>
      <main className="page-main is-narrow page-enter sb-home">
        <section className="sb-hero">
          <div className="sb-hero-fan" aria-hidden="true">
            {[3, 8, 1, 6, 11].map((n, i) => (
              <CuteCard key={n} n={n} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <h1 className="cn-display">
            Schmil<em>blick</em>
          </h1>
        </section>

        <div className="sb-two-col sb-home-grid">
          <section className="panel sb-play">
            <div className="panel-header">
              <h2>{mode === "create" ? "Create a room" : mode === "join" ? "Join a room" : "Play"}</h2>
              {mode !== "choose" && (
                <div className="band-actions">
                  <button type="button" className="btn btn-ghost is-sm" onClick={() => pick("choose")}>
                    <ArrowIcon dir="left" />
                    Back
                  </button>
                </div>
              )}
            </div>

            {mode === "choose" ? (
              <div className="panel-body page-enter" key="choose">
                <div className="segmented is-stacked sb-seg-stack" role="group" aria-label="Play">
                  <button type="button" onClick={() => pick("create")}>
                    <b>Create a room</b>
                    <small>Deal a new table and share the code</small>
                  </button>
                  <button type="button" onClick={() => pick("join")}>
                    <b>Join a room</b>
                    <small>Got a code from a friend?</small>
                  </button>
                </div>
              </div>
            ) : (
              <form className="panel-body cn-stack page-enter" key={mode} onSubmit={mode === "create" ? create : join}>
                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input
                    id="name"
                    className="input"
                    maxLength={NAME_MAX}
                    placeholder="Gloria"
                    value={name}
                    autoComplete="nickname"
                    autoFocus={mode === "create" || !name}
                    aria-invalid={err.field === "name" || undefined}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {err.field === "name" && <small>{err.message}</small>}
                </div>
                {mode === "join" && (
                  <div className="field">
                    <label htmlFor="code">Room code</label>
                    <input
                      id="code"
                      className="input sb-code-input"
                      maxLength={CODE_LENGTH}
                      placeholder={CODE_ALPHABET.slice(0, CODE_LENGTH)}
                      value={code}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus={!!name}
                      aria-invalid={err.field === "code" || undefined}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                    {err.field === "code" && <small>{err.message}</small>}
                  </div>
                )}
                {err.field === "form" && (
                  <p className="banner cn-tone-red" role="alert">
                    {err.message}
                  </p>
                )}
                <div>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {mode === "create" ? "Create room" : "Join room"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="panel is-tilted sb-wide-only sb-rules-card">
            <div className="panel-header">
              <h2>How to play</h2>
            </div>
            <div ref={rulesRef} className="panel-body sb-rules-scroll scroll-well">
              <Rules />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
