export default {
  async getCapabilities() {
    return {
      isNative: false,
      supportsOfflinePitch: false,
      supportsRealtimeChunk: false,
      engineVersion: "web-stub"
    };
  },
  async analyzePitchFrames() {
    throw new Error("ViolinTwinEngine native module is not available on web.");
  },
  async analyzeRealtimeChunk() {
    return {
      pitchHz: null,
      centsOffset: null,
      noteLabel: null
    };
  },
  async startRealtimeTracking() {
    return false;
  },
  async stopRealtimeTracking() {
    return;
  }
};
