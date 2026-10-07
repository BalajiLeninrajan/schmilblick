import { useEffect, useRef, useState, type ReactNode } from "react";

/** A native dialog styled as a catppuccin-neu drawer or modal. Escape and a backdrop click close it. */
export function Sheet({
  kind,
  open,
  onClose,
  title,
  children,
}: {
  kind: "drawer" | "modal";
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const id = `sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog ref={ref} className={kind} aria-labelledby={id} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <header>
        <h2 id={id} className="cn-title cn-m-0">
          {title}
        </h2>
        <button type="button" className="btn is-icon" aria-label="Close" onClick={onClose}>
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function RulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost is-sm" onClick={() => setOpen(true)}>
        Rules
      </button>
      <Sheet kind="modal" title="How to play" open={open} onClose={() => setOpen(false)}>
        <div className="panel-body">
          <Rules />
        </div>
      </Sheet>
    </>
  );
}

export function Rules() {
  return (
    <div className="cn-stack">
      <ol className="sb-rules cn-copy">
        <li>The deck starts in a random player's hands. On your turn, take 1 to 8 cards from it.</li>
        <li>Odd number of cards left? Pass the deck to your left. Even? Pass it right.</li>
        <li>If the deck you were handed was a multiple of 7, it's a death deck. You still play, then you're out.</li>
        <li>
          Survive a turn and the Schmilblick die rolls for you (a d10 unless the host picks another). Its top number means everyone still in
          drinks.
        </li>
        <li>Take the last card, or be the last one standing, to win. Win on a death deck and nobody wins.</li>
      </ol>
      <div>
        <h3 className="cn-name cn-m-0">Hasard</h3>
        <p className="cn-copy cn-m-0">A d8 decides how many cards you take.</p>
      </div>
      <div>
        <h3 className="cn-name cn-m-0">Tactique</h3>
        <p className="cn-copy cn-m-0">
          You hold 3 cards from 1 to 8 that only you can see. Play one to take that many, then draw a new one. Handed a death deck while
          holding a 7? Play it for a <b>Bidule</b>: you survive, and the death deck goes straight back to whoever sent it. They can't Bidule
          it back, so they're out.
        </p>
      </div>
    </div>
  );
}
