// Policy for the mobile composer's collapse-on-blur, kept out of the component
// for the same reason as composerKeys.ts: the decision depends on event ORDER,
// and only a unit test can pin ordering down.
//
// The trap this replaces: a ref armed on pointerdown and disarmed one
// animation frame later. On a real touch device `pointerdown` fires when the
// finger LANDS and the textarea `blur` fires when it LIFTS — around 100ms and
// several frames apart — so the excuse had always expired, and tapping Model /
// Reminder / Workflows with the keyboard open collapsed the composer and
// unmounted the picker it was opening. (It looked fine in mouse tests, where
// mousedown and blur share a frame, and on the first tap after a load, where
// the textarea has never been focused so no blur fires at all.)
//
// The guard is therefore consumed BY the blur decision instead of by a timer:
// one control press excuses exactly one blur, whenever it arrives. Focusing
// the textarea disarms any stale press, and since a textarea must gain focus
// before it can lose it, a stale press can never wrongly excuse a collapse.

export interface ComposerCollapseGuard {
  /** A composer control (rails, attach, reminder, workflows, send) was pressed. */
  markControlInteraction(): void;
  /** The textarea gained focus; forget any control press that never caused a blur. */
  markComposerFocus(): void;
  /**
   * Decide whether this textarea blur may collapse the mobile composer.
   * Consumes a pending control press: one press excuses one blur.
   */
  shouldCollapseOnBlur(input: { narrowViewport: boolean; focusInsideComposer: boolean }): boolean;
}

export function createComposerCollapseGuard(): ComposerCollapseGuard {
  let controlPressed = false;
  return {
    markControlInteraction() {
      controlPressed = true;
    },
    markComposerFocus() {
      controlPressed = false;
    },
    shouldCollapseOnBlur({ narrowViewport, focusInsideComposer }) {
      const excused = controlPressed;
      controlPressed = false;
      return !excused && narrowViewport && !focusInsideComposer;
    },
  };
}
