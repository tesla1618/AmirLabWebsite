"use client";

const NOTICE_EVENT = "amirl:session-notice";

export function setSessionEnded(ended: boolean): void {
  if (ended) sessionStorage.setItem("amirl_session_ended", "1");
  else sessionStorage.removeItem("amirl_session_ended");
  window.dispatchEvent(new Event(NOTICE_EVENT));
}

export function hasSessionEnded(): boolean {
  return sessionStorage.getItem("amirl_session_ended") === "1";
}

export function subscribeSessionNotice(callback: () => void): () => void {
  window.addEventListener(NOTICE_EVENT, callback);
  return () => window.removeEventListener(NOTICE_EVENT, callback);
}
