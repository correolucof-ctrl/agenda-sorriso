import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/server/google-calendar.server";

describe("proteção dos tokens Google e Meta", () => {
  it("criptografa com IV aleatório e recusa chave diferente", async () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(17)));
    const wrong = btoa(String.fromCharCode(...new Uint8Array(32).fill(18)));
    const a = await encryptToken("refresh-token-ficticio", key);
    const b = await encryptToken("refresh-token-ficticio", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token-ficticio");
    expect(await decryptToken(a, key)).toBe("refresh-token-ficticio");
    await expect(decryptToken(a, wrong)).rejects.toThrow();
  });
});
