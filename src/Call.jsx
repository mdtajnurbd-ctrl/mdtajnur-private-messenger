import { useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" }
];

export default function Call({
  currentUser,
  currentProfile,
  friend,
  onEnd
}) {
  const [status, setStatus] = useState("Connecting…");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const unsubscribeRefs = useRef([]);

  const chatId = [currentUser.uid, friend.uid].sort().join("__");
  const callRef = doc(db, "calls", chatId);
  const candidatesRef = collection(callRef, "candidates");

  function cleanup() {
    unsubscribeRefs.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRefs.current = [];

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();

    peerRef.current = null;
    localStreamRef.current = null;
  }

  async function endCall() {
    cleanup();
    await deleteDoc(callRef);
    onEnd();
  }

  function listenForRemoteCandidates(peer) {
    const unsubscribe = onSnapshot(candidatesRef, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== "added") return;

        const data = change.data();

        if (data.senderId === currentUser.uid) return;

        try {
          await peer.addIceCandidate(data.candidate);
        } catch {
          // Candidate may arrive before remote description is ready.
        }
      });
    });

    unsubscribeRefs.current.push(unsubscribe);
  }

  async function createPeer(localStream, isCaller) {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    localStream.getTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("Connected");
      }

      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected"
      ) {
        setStatus("Connection lost");
      }
    };

    peer.onicecandidate = async (event) => {
      if (!event.candidate) return;

      await addDoc(candidatesRef, {
        senderId: currentUser.uid,
        candidate: event.candidate.toJSON(),
        createdAt: serverTimestamp()
      });
    };

    listenForRemoteCandidates(peer);

    if (isCaller) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      await setDoc(callRef, {
        callerId: currentUser.uid,
        callerUsername: currentProfile.username,
        calleeId: friend.uid,
        calleeUsername: friend.username,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        status: "ringing",
        createdAt: serverTimestamp()
      });

      setStatus("Calling…");
    }

    return peer;
  }

  async function acceptIncomingCall(callData) {
    setStatus("Connecting…");

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callData.video
    });

    localStreamRef.current = localStream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }

    const peer = await createPeer(localStream, false);

    await peer.setRemoteDescription(callData.offer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      },
      status: "active"
    });
  }

  useEffect(() => {
    let active = true;

    async function start() {
      const callSnapshot = await new Promise((resolve) => {
        const unsubscribe = onSnapshot(callRef, (snapshot) => {
          resolve(snapshot.data());
          unsubscribe();
        });
      });

      if (!active || !callSnapshot) return;

      const isCaller = callSnapshot.callerId === currentUser.uid;
      const isCallee = callSnapshot.calleeId === currentUser.uid;

      if (!isCaller && !isCallee) {
        setStatus("You are not part of this call.");
        return;
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callSnapshot.video
      });

      if (!active) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      const peer = await createPeer(localStream, isCaller);

      if (isCaller) {
        const unsubscribe = onSnapshot(callRef, async (snapshot) => {
          const data = snapshot.data();

          if (data?.answer && peer.currentRemoteDescription === null) {
            await peer.setRemoteDescription(data.answer);
          }
        });

        unsubscribeRefs.current.push(unsubscribe);
      }
    }

    start();

    return () => {
      active = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data();

      if (
        data &&
        data.calleeId === currentUser.uid &&
        data.status === "ringing" &&
        !peerRef.current
      ) {
        await acceptIncomingCall(data);
      }
    });

    unsubscribeRefs.current.push(unsubscribe);

    return unsubscribe;
  }, []);

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }

  return (
    <div className="call-overlay">
      <div className="call-box">
        <h2>Call with @{friend.username}</h2>
        <p>{status}</p>

        <video
          className="remote-video"
          ref={remoteVideoRef}
          autoPlay
          playsInline
        />

        <video
          className="local-video"
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
        />

        <div className="call-controls">
          <button onClick={toggleMic}>
            {micOn ? "Mute" : "Unmute"}
          </button>

          <button onClick={toggleCamera}>
            {cameraOn ? "Camera off" : "Camera on"}
          </button>

          <button className="danger" onClick={endCall}>
            End call
          </button>
        </div>
      </div>
    </div>
  );
}
