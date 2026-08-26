// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PulseQuestionCard, voteFromDrag } from "./question-card";

// motion reads the reduced-motion media query once at module init, so the hook
// is mocked instead of window.matchMedia (which happy-dom lacks anyway).
let reduceMotion = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => reduceMotion,
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    configurable: true,
  });
});

afterEach(cleanup);

describe("voteFromDrag", () => {
  it("commits on offset past the threshold, by direction", () => {
    expect(voteFromDrag(150, 0)).toBe(true);
    expect(voteFromDrag(-150, 0)).toBe(false);
  });

  it("commits on a fast flick even with a small offset", () => {
    expect(voteFromDrag(20, 800)).toBe(true);
    expect(voteFromDrag(-20, -800)).toBe(false);
  });

  it("snaps back on a small, slow drag", () => {
    expect(voteFromDrag(50, 200)).toBeNull();
    expect(voteFromDrag(-99, -499)).toBeNull();
  });
});

describe("PulseQuestionCard — unvoted", () => {
  const card = { id: 1, text: "The Nest is the best study spot" };

  it("renders the question with 44px vote buttons that report the direction", () => {
    const onVote = vi.fn();
    const { getByText, getByRole } = render(<PulseQuestionCard card={card} onVote={onVote} />);
    expect(getByText(card.text)).toBeTruthy();

    const agree = getByRole("button", { name: `Agree: ${card.text}` });
    const disagree = getByRole("button", { name: `Disagree: ${card.text}` });
    expect(agree.className).toContain("min-h-11");
    expect(disagree.className).toContain("min-h-11");

    fireEvent.click(agree);
    expect(onVote).toHaveBeenLastCalledWith(true);
    fireEvent.click(disagree);
    expect(onVote).toHaveBeenLastCalledWith(false);
  });

  it("shows the card's vote error", () => {
    const { getByRole } = render(
      <PulseQuestionCard card={{ ...card, error: "Vote failed. Try again." }} onVote={vi.fn()} />,
    );
    expect(getByRole("alert").textContent).toBe("Vote failed. Try again.");
  });
});

describe("PulseQuestionCard — voted shadow", () => {
  // The result card waits for the front card's exit animation, which never
  // completes under the test renderer. Reduced motion skips that flight and
  // renders the result straight away — the same path a reduced-motion user gets.
  beforeAll(() => {
    reduceMotion = true;
  });
  afterAll(() => {
    reduceMotion = false;
  });

  it("hides the buttons and describes the split with disagree left, agree right", () => {
    const { queryByRole, getByRole, getByText } = render(
      <PulseQuestionCard
        card={{ id: 1, text: "Q", myAgree: true, agreeCount: 3, disagreeCount: 1 }}
        onVote={vi.fn()}
      />,
    );
    expect(queryByRole("button")).toBeNull();
    expect(getByRole("img").getAttribute("aria-label")).toBe("25% disagree, 75% agree, 4 votes");
    expect(getByText("75%")).toBeTruthy();
    expect(getByText("25%")).toBeTruthy();
    // The caller's side carries the highlight.
    expect(getByText("75%").className).toContain("text-primary");
    expect(getByText("25%").className).toContain("text-muted");
  });

  it("shows placeholders while the vote is pending", () => {
    const { getByRole, getAllByText, getByText } = render(
      <PulseQuestionCard card={{ id: 1, text: "Q", myAgree: true, pending: true }} onVote={vi.fn()} />,
    );
    expect(getByRole("img").getAttribute("aria-label")).toBe("Recording your vote");
    expect(getAllByText("—")).toHaveLength(2);
    expect(getByText("Recording your vote…")).toBeTruthy();
  });
});
