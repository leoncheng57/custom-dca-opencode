import { describe, expect, it } from "vitest";

import { composerEnterAction, type ComposerKeyPress } from "../client/lib/composerKeys.js";

const press = (overrides: Partial<ComposerKeyPress> = {}): ComposerKeyPress => ({
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
  keyCode: 13,
  ...overrides,
});

const desktop = { coarsePointer: false, canSubmit: true };
const phone = { coarsePointer: true, canSubmit: true };

describe("composerEnterAction", () => {
  it("submits on a bare Enter with a fine pointer", () => {
    expect(composerEnterAction(press(), desktop)).toEqual({ submit: true, preventDefault: true });
  });

  it("leaves Shift+Enter to insert a newline", () => {
    expect(composerEnterAction(press({ shiftKey: true }), desktop)).toEqual({
      submit: false,
      preventDefault: false,
    });
  });

  it("ignores every key other than Enter", () => {
    for (const key of ["a", "Tab", "Escape", "ArrowDown"]) {
      expect(composerEnterAction(press({ key }), desktop)).toEqual({
        submit: false,
        preventDefault: false,
      });
    }
  });

  // An IME commits its candidate with Enter. Submitting there would post a
  // half-typed message on the first word of any Japanese/Chinese/Korean input.
  it("never submits while an IME is composing", () => {
    expect(composerEnterAction(press({ isComposing: true }), desktop)).toEqual({
      submit: false,
      preventDefault: false,
    });
    expect(composerEnterAction(press({ keyCode: 229 }), desktop)).toEqual({
      submit: false,
      preventDefault: false,
    });
  });

  it("keeps Enter as a newline on a coarse pointer", () => {
    expect(composerEnterAction(press(), phone)).toEqual({ submit: false, preventDefault: false });
  });

  it("still submits on Cmd/Ctrl+Enter on a coarse pointer", () => {
    expect(composerEnterAction(press({ metaKey: true }), phone)).toEqual({
      submit: true,
      preventDefault: true,
    });
    expect(composerEnterAction(press({ ctrlKey: true }), phone)).toEqual({
      submit: true,
      preventDefault: true,
    });
  });

  // Swallowing the key matters: without preventDefault an empty draft would
  // gain a blank line every time the user tapped Enter looking for a send.
  it("swallows Enter for a draft that cannot be sent", () => {
    expect(composerEnterAction(press(), { coarsePointer: false, canSubmit: false })).toEqual({
      submit: false,
      preventDefault: true,
    });
  });
});
