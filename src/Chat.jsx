import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import Call from "./Call";

export default function Chat({ currentUser, currentProfile }) {
  const [friendUsername, setFriendUsername] = useState("");
  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [inCall, setInCall] = useState(false);
  const messagesEndRef = useRef(null);

  async function openChat(event) {
    event.preventDefault();

    const username = friendUsername.trim().toLowerCase();

    if (!username || username === currentProfile.username) return;

    const usernameSnapshot = await getDoc(doc(db, "usernames", username));

    if (!usernameSnapshot.exists()) {
      alert("User not found.");
      return;
    }

    const friendUid = usernameSnapshot.data().uid;
    const friendSnapshot = await getDoc(doc(db, "users", friendUid));

    if (!friendSnapshot.exists()) {
      alert("User profile not found.");
      return;
    }

    setFriend(friendSnapshot.data());
  }

  useEffect(() => {
    if (!friend) return;

    const chatId = [currentUser.uid, friend.uid].sort().join("__");

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(messagesQuery, (snapshot) => {
      setMessages(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }))
      );
    });
  }, [currentUser.uid, friend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();

    if (!text.trim() || !friend) return;

    const chatId = [currentUser.uid, friend.uid].sort().join("__");

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUser.uid,
      senderUsername: currentProfile.username,
      text: text.trim(),
      createdAt: serverTimestamp()
    });

    setText("");
  }

  async function startCall(withVideo) {
    if (!friend) return;

    const chatId = [currentUser.uid, friend.uid].sort().join("__");

    await setDoc(doc(db, "calls", chatId), {
      callerId: currentUser.uid,
      callerUsername: currentProfile.username,
      calleeId: friend.uid,
      calleeUsername: friend.username,
      video: withVideo,
      status: "ringing",
      createdAt: serverTimestamp()
    });

    setInCall(true);
  }

  if (!friend) {
    return (
      <div className="chat">
        <form className="find-user" onSubmit={openChat}>
          <input
            placeholder="Enter a username"
            value={friendUsername}
            onChange={(event) => setFriendUsername(event.target.value)}
          />
          <button>Open chat</button>
        </form>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <strong>@{friend.username}</strong>

        <div>
          <button onClick={() => startCall(false)}>Audio call</button>
          <button onClick={() => startCall(true)}>Video call</button>
        </div>
      </div>

      <div className="messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.senderId === currentUser.uid
                ? "message mine"
                : "message theirs"
            }
          >
            <span>{message.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={sendMessage}>
        <input
          placeholder="Type a private message…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button>Send</button>
      </form>

      {inCall && (
        <Call
          currentUser={currentUser}
          currentProfile={currentProfile}
          friend={friend}
          onEnd={() => setInCall(false)}
        />
      )}
    </div>
  );
}
