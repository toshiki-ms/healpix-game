let wasmExports = null;

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message?.type === "init") {
      const response = await fetch(message.wasmUrl);
      if (!response.ok) {
        throw new Error(`simulation worker wasm returned ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {
        env: {
          memory: message.memory,
          sim_now_ms: typeof performance !== "undefined" ? () => performance.now() : () => Date.now()
        }
      });
      wasmExports = instance.exports;
      self.postMessage({ type: "ready", id: message.id });
      return;
    }

    if (message?.type === "run") {
      if (!wasmExports) {
        throw new Error("simulation worker is not initialized");
      }
      if (wasmExports.__stack_pointer && Number.isFinite(message.stackPointer)) {
        wasmExports.__stack_pointer.value = message.stackPointer >>> 0;
      }
      const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
      const profileOffset = message.profileOffset >>> 0;
      const profileStride = message.profileStride | 0;
      if (profileOffset && typeof wasmExports.sim_step_ecosystem_parallel_worker_profile === "function") {
        wasmExports.sim_step_ecosystem_parallel_worker_profile(
          message.paramsOffset >>> 0,
          message.threadId | 0,
          message.threadCount | 0,
          message.activeOffset >>> 0,
          message.activeCount | 0,
          message.barrierOffset >>> 0,
          message.repeatCount | 0,
          profileOffset,
          profileStride
        );
      } else {
        wasmExports.sim_step_ecosystem_parallel_worker(
          message.paramsOffset >>> 0,
          message.threadId | 0,
          message.threadCount | 0,
          message.activeOffset >>> 0,
          message.activeCount | 0,
          message.barrierOffset >>> 0,
          message.repeatCount | 0
        );
      }
      const elapsedMs = startedAt ? performance.now() - startedAt : 0;
      self.postMessage({ type: "done", id: message.id, elapsedMs });
      return;
    }

    throw new Error(`unknown simulation worker message: ${message?.type}`);
  } catch (error) {
    self.postMessage({ type: "error", id: message?.id, error: String(error?.stack || error) });
  }
};
