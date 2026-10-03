import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaProvider, usePwa } from "./pwa-provider";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Probe() {
  const { unavailable } = usePwa();
  return <p>{unavailable ? "Worker unavailable" : "Worker pending"}</p>;
}
it("reports worker registration failure without preventing page content", async () => {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockRejectedValue(new Error("blocked")),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  render(
    <PwaProvider>
      <Probe />
    </PwaProvider>,
  );
  expect(await screen.findByText("Worker unavailable")).toBeTruthy();
});
