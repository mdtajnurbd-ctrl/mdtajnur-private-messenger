import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        setProfile(snapshot.exists() ? snapshot.data() : null);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });
  }, []);

  async function register(email, password, username) {
    const cleanUsername = username.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      throw new Error(
        "Username must be 3-20 characters: letters, numbers, or underscores."
      );
    }

    const usernameRef = doc(db, "usernames", cleanUsername);
    const existing = await getDoc(usernameRef);

    if (existing.exists()) {
      throw new Error("Username is already taken.");
    }

    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(usernameRef, { uid: credential.user.uid });

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      email,
      username: cleanUsername,
      createdAt: serverTimestamp()
    });

    setProfile({
      uid: credential.user.uid,
      email,
      username: cleanUsername
    });
  }

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, register, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
