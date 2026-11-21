import { useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import Chat from "./Chat";

function AuthScreen() {
  const { register, login } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await register(email, password, username);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-card">
      <h1>Private Messenger</h1>

      <form onSubmit={submit}>
        {mode === "register" && (
          <input
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />

        <button type="submit">
          {mode === "register" ? "Create account" : "Log in"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <button
        className="link"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login"
          ? "Need an account? Register"
          : "Already have an account? Log in"}
      </button>
    </div>
  );
}

function Messenger() {
  const { user, profile, logout } = useAuth();

  if (!profile) return <p className="center">Loading profile…</p>;

  return (
    <div className="app">
      <header>
        <strong>@{profile.username}</strong>
        <button onClick={logout}>Log out</button>
      </header>

      <Chat currentUser={user} currentProfile={profile} />
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) return <p className="center">Loading…</p>;

  return (
    <AuthProvider>
      {user ? <Messenger /> : <AuthScreen />}
    </AuthProvider>
  );
}

export default App;
