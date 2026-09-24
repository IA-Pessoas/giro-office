export function playNewTiRequestSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    void context.resume();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);

    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.16);
    });

    setTimeout(() => void context.close(), 1000);
  } catch {
    // Browsers may block audio before the first user interaction; the list still updates.
  }
}
