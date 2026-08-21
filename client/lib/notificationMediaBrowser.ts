import type { NotifyEvent } from "./api.js";
import {
  notificationPhrase,
  tonePattern,
  type DeviceNotificationPreferences,
  type Tone,
} from "./notificationMedia.js";

let audioContext: AudioContext | null = null;

export interface NotificationCapabilities {
  audio: boolean;
  speech: boolean;
  desktop: boolean;
  desktopPermission: NotificationPermission | "unavailable";
}

export function notificationCapabilities(): NotificationCapabilities {
  const hasNotification = "Notification" in window;
  return {
    audio: Boolean(window.AudioContext),
    speech: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    desktop: hasNotification,
    desktopPermission: hasNotification ? Notification.permission : "unavailable",
  };
}

export async function unlockNotificationAudio(): Promise<boolean> {
  if (!window.AudioContext) return false;
  audioContext ??= new window.AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext.state === "running";
}

function playPattern(pattern: Tone[], volume: number): boolean {
  if (!audioContext || audioContext.state !== "running") return false;
  const gainValue = Math.max(0, Math.min(1, volume)) * 0.1;
  for (const tone of pattern) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + Math.max(0, tone.offset);
    const duration = Math.max(0.04, Math.min(0.14, tone.duration));
    oscillator.type = tone.type;
    oscillator.frequency.value = Math.max(120, Math.min(1200, tone.frequency));
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
  return pattern.length > 0;
}

export function playNotificationSound(preferences: DeviceNotificationPreferences, event: NotifyEvent): boolean {
  if (!preferences.sound.enabled || !preferences.sound.events[event]) return false;
  return playPattern(tonePattern(event, preferences.sound.profile), preferences.sound.volume);
}

export async function previewNotificationSound(preferences: DeviceNotificationPreferences, event: NotifyEvent = "idle"): Promise<boolean> {
  if (!await unlockNotificationAudio()) return false;
  return playPattern(tonePattern(event, preferences.sound.profile), preferences.sound.volume);
}

export function speakNotification(preferences: DeviceNotificationPreferences, event: NotifyEvent): boolean {
  const phrase = notificationPhrase(event);
  if (!preferences.speech.enabled || !phrase || !notificationCapabilities().speech) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.rate = preferences.speech.rate;
  speechSynthesis.speak(utterance);
  return true;
}

export function previewNotificationSpeech(preferences: DeviceNotificationPreferences, event: NotifyEvent = "idle"): boolean {
  const phrase = notificationPhrase(event);
  if (!phrase || !notificationCapabilities().speech) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.rate = preferences.speech.rate;
  speechSynthesis.speak(utterance);
  return true;
}
