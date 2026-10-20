import { useCallback, useEffect, useRef, useState } from 'react';

export function useRingtone(ringing: boolean, outgoing = false) {
  const context = useRef<AudioContext | null>(null);
  const nodes = useRef<OscillatorNode[]>([]);
  const [enabled, setEnabled] = useState(false);
  const stop = useCallback(() => { nodes.current.forEach((node) => { try { node.stop(); } catch { /* Already ended. */ } }); nodes.current = []; }, []);
  const enable = useCallback(async () => {
    try {
      context.current ||= new AudioContext();
      await context.current.resume();
      setEnabled(context.current.state === 'running');
    } catch { setEnabled(false); }
  }, []);
  useEffect(() => {
    const unlock = () => { void enable(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); stop(); void context.current?.close(); context.current = null; };
  }, [enable, stop]);
  useEffect(() => {
    if (!ringing || !enabled) { stop(); return; }
    const tone = () => {
      const audio = context.current;
      if (!audio || audio.state !== 'running') { setEnabled(false); return; }
      const gain = audio.createGain();
      const time = audio.currentTime;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.07, time + 0.03); gain.gain.setValueAtTime(0.07, time + 0.45); gain.gain.linearRampToValueAtTime(0, time + 0.55); gain.connect(audio.destination);
      for (const frequency of outgoing ? [440, 480] : [660, 880]) {
        const oscillator = audio.createOscillator(); oscillator.frequency.value = frequency; oscillator.connect(gain); nodes.current.push(oscillator);
        oscillator.onended = () => { oscillator.disconnect(); nodes.current = nodes.current.filter((node) => node !== oscillator); };
        oscillator.start(time); oscillator.stop(time + 0.6);
      }
      window.setTimeout(() => gain.disconnect(), 700);
    };
    tone(); const timer = window.setInterval(tone, 1600);
    return () => { window.clearInterval(timer); stop(); };
  }, [ringing, enabled, outgoing, stop]);
  return { enabled, enable };
}
