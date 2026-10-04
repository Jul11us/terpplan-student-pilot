import assert from "node:assert/strict";
import test from "node:test";
import { sharingEnabled, sharingId, setSharing } from "../lib/popularity-sharing.ts";

test("sharing starts off and gets a random ID only after an explicit choice", () => {
  const previous = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, crypto: globalThis.crypto, dispatchEvent: () => {} };
  try {
    assert.equal(sharingEnabled(), false);
    assert.equal(sharingId(), null);
    assert.equal(data.size, 0);
    setSharing(true);
    assert.equal(sharingEnabled(), true);
    const id = sharingId();
    assert.match(id, /^[a-f0-9]{8}-/);
    setSharing(false);
    assert.equal(sharingEnabled(), false);
    assert.equal(sharingId(), id);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
