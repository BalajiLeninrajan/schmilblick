import { useEffect, useState } from "react";
import { CODE_LENGTH, isCode } from "../shared/protocol";
import { Home } from "./Home";
import { LobbyPage } from "./LobbyPage";

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

export function Wordmark() {
  return (
    <a
      className="wordmark"
      href="/"
      onClick={(e) => {
        e.preventDefault();
        navigate("/");
      }}
    >
      <span className="mark" aria-hidden="true">
        S
      </span>
      <span className="sb-wordmark-text">
        Schmil<em>blick</em>
      </span>
    </a>
  );
}

export function App() {
  const path = usePath();
  const code = path.slice(1).toUpperCase();
  const inLobby = code.length === CODE_LENGTH && isCode(code);

  return <>{inLobby ? <LobbyPage key={code} code={code} /> : <Home />}</>;
}
