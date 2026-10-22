import { createHmac, createHash, timingSafeEqual } from "node:crypto";
export function provePayload(payload, signature, secret) {
  if (
    typeof signature !== "string" ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    typeof secret !== "string" ||
    !secret
  )
    throw new Error("HMAC_INPUT");
  const forms =
    typeof payload === "string"
      ? [payload]
      : [
          JSON.stringify(payload),
          JSON.stringify(payload, null, 2),
          JSON.stringify(payload, null, 4),
        ];
  const candidates = [...new Set(forms.flatMap((x) => [x, x + "\n"]))];
  const matched = candidates.find((x) =>
    timingSafeEqual(
      createHmac("sha256", secret).update(x).digest(),
      Buffer.from(signature.slice(7), "hex"),
    ),
  );
  if (matched === undefined) throw new Error("DELIVERY_RAW_PAYLOAD_NOT_PROVEN");
  return {
    payloadSha256: createHash("sha256").update(matched).digest("hex"),
    bytes: Buffer.byteLength(matched),
  };
}
