import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceRowLink } from "./workspace-row-link";

afterEach(cleanup);

it("blocks loading-row navigation and removes it from keyboard navigation", () => {
  const onClick = vi.fn();
  const view = render(
    <WorkspaceRowLink
      href="/workspace/projects/project"
      loading
      onClick={onClick}
    >
      Project
    </WorkspaceRowLink>,
  );
  const link = screen.getByRole("link", { name: "Project" });
  expect(link).toHaveAttribute("aria-disabled", "true");
  expect(link).toHaveAttribute("tabindex", "-1");
  expect(fireEvent.click(link)).toBe(false);
  expect(onClick).not.toHaveBeenCalled();
  view.rerender(
    <WorkspaceRowLink href="/workspace/projects/project" onClick={onClick}>
      Project
    </WorkspaceRowLink>,
  );
  expect(link).not.toHaveAttribute("aria-disabled");
  expect(link).not.toHaveAttribute("tabindex", "-1");
  fireEvent.click(link);
  expect(onClick).toHaveBeenCalledOnce();
});
