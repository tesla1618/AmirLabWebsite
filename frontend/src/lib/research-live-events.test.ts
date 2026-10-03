import { describe, expect, it } from "vitest";
import {
  applyResearchLiveEvent,
  parseResearchLiveEvent,
  researchLiveEventPatch,
} from "./research-live-events";

describe("research live events", () => {
  it("accepts scoped source events and exposes source state for action guards", () => {
    const event = parseResearchLiveEvent({
      kind: "source",
      scope: "research",
      researchItemId: "research-1",
      sourceStatus: "PENDING",
    });

    expect(event).toEqual({
      kind: "source",
      scope: "research",
      researchItemId: "research-1",
      sourceStatus: "PENDING",
    });
    expect(event && researchLiveEventPatch(event)).toEqual({
      sourceStatus: "PENDING",
    });
    expect(
      event &&
        applyResearchLiveEvent(
          {
            id: "research-1",
            reviewStatus: "NEEDS_REVIEW",
            sourceSnapshot: null,
          },
          event,
        ),
    ).toMatchObject({
      id: "research-1",
      sourceSnapshot: { status: "PENDING" },
    });
  });

  it("accepts review status events so queue rows can leave active review", () => {
    const event = parseResearchLiveEvent({
      kind: "status",
      scope: "research",
      researchItemId: "research-2",
      reviewStatus: "PUBLISHED",
    });

    expect(event && researchLiveEventPatch(event)).toEqual({
      reviewStatus: "PUBLISHED",
    });
    expect(
      event &&
        applyResearchLiveEvent(
          {
            id: "research-2",
            reviewStatus: "NEEDS_REVIEW",
            sourceSnapshot: {
              failureReason: null,
              fetchedAt: null,
              metadata: null,
              status: "FETCHED",
            },
          },
          event,
        ),
    ).toMatchObject({ id: "research-2", reviewStatus: "PUBLISHED" });
  });

  it("rejects unrelated, incomplete, and unknown status payloads", () => {
    expect(parseResearchLiveEvent({ scope: "profile", kind: "status" })).toBe(
      null,
    );
    expect(
      parseResearchLiveEvent({
        kind: "source",
        scope: "research",
        researchItemId: "research-1",
        sourceStatus: "BROKEN",
      }),
    ).toBe(null);
    expect(parseResearchLiveEvent("not-an-event")).toBe(null);
  });
});
