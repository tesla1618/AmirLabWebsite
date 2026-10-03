import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoginForm } from "./login-form";

describe("LoginForm session notice", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it("explains a remotely ended session on arrival at login", () => {
    sessionStorage.setItem("amirl_session_ended", "1");
    render(<LoginForm />);
    expect(
      screen.getByText("Your session ended. Please log in again."),
    ).toBeTruthy();
  });

  it("does not show a session notice to a new visitor", () => {
    render(<LoginForm />);
    expect(
      screen.queryByText("Your session ended. Please log in again."),
    ).toBeNull();
  });
});
