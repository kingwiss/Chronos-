
export class StepTracker {
  private isTracking = false;
  private callback: (steps: number) => void;
  private steps = 0;
  private lastMagnitude = 0;
  private threshold = 11.5; // Threshold for step detection (m/s^2)
  private lastStepTime = 0;

  constructor(onStep: (steps: number) => void) {
    this.callback = onStep;
  }

  public async start() {
    this.isTracking = true;
    this.steps = 0;
    this.lastStepTime = Date.now();
    
    // Check for iOS 13+ permission requirements
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response !== 'granted') {
          console.warn("Motion permission denied");
        }
      } catch (e) {
        console.error("Error requesting motion permission", e);
      }
    }

    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', this.handleMotion);
    } else {
      console.warn("DeviceMotionEvent is not supported on this device. Steps will not be tracked.");
    }
  }

  public stop() {
    this.isTracking = false;
    if (window.DeviceMotionEvent) {
      window.removeEventListener('devicemotion', this.handleMotion);
    }
    return this.steps;
  }

  private handleMotion = (event: DeviceMotionEvent) => {
    if (!this.isTracking) return;

    // Use accelerationIncludingGravity to detect step impact
    const acc = event.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

    const x = acc.x;
    const y = acc.y;
    const z = acc.z;

    // Calculate vector magnitude
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    
    // Standard gravity is ~9.8 m/s^2.
    // Walking generates acceleration peaks above gravity.
    // We check if the magnitude crosses the threshold.
    
    const now = Date.now();
    
    // Peak detection with debounce
    if (magnitude > this.threshold && this.lastMagnitude <= this.threshold) {
      // Ensure at least 300ms between steps to filter out noise/vibration (max ~3.3 steps/sec)
      if (now - this.lastStepTime > 300) {
        this.steps++;
        this.callback(this.steps);
        this.lastStepTime = now;
      }
    }
    
    this.lastMagnitude = magnitude;
  }
}
