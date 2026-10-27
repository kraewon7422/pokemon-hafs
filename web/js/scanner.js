// Camera QR scanner (jsQR, works on iOS which has no BarcodeDetector).
// Reads only the centre square of the frame (faster, better in dim corridors) every ~120 ms.
// Usage: const sc = new Scanner(videoEl, onText); await sc.start(); ... sc.stop();

export class Scanner {
  constructor(video, onText) {
    this.video = video;
    this.onText = onText;
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null;
    this.timer = null;
    this.last = '';
    this.lastAt = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_CAMERA');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    this.loop();
  }

  loop = () => {
    this.timer = setTimeout(this.loop, 120);
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight) * 0.75;
    const out = Math.min(480, Math.round(side));
    this.canvas.width = this.canvas.height = out;
    this.g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
    const img = this.g.getImageData(0, 0, out, out);
    const code = window.jsQR(img.data, out, out, { inversionAttempts: 'dontInvert' });
    if (code?.data) {
      const now = Date.now();
      if (code.data === this.last && now - this.lastAt < 2500) return;  // same code held in view
      this.last = code.data;
      this.lastAt = now;
      this.onText(code.data);
    }
  };

  // Android only (iOS Safari has no torch constraint) → returns false if unsupported
  async torch(on) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track?.getCapabilities?.().torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  }

  hasTorch() {
    return !!this.stream?.getVideoTracks()[0]?.getCapabilities?.().torch;
  }

  stop() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
