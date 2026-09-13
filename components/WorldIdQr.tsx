"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The World ID scan code.
 *
 * The encoded value is IDKit's `connectorURI` and nothing else. It only exists once a
 * signed `rp_context` has produced a request. With no URI this renders nothing rather
 * than a decorative code: a QR that resolves to nothing, on the screen whose whole
 * subject is what gets recorded, would be worse than no QR at all.
 */
export function WorldIdQr({ uri }: { uri: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#0B0B0D", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Renders a code or nothing. The caller decides what a missing code means; an empty
  // frame explaining its own emptiness is a placeholder for a developer, not a user.
  if (!dataUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="World ID request. Scan with World App."
      width={256}
      height={256}
      className="h-[256px] w-[256px] rounded-[18px] bg-white p-3"
    />
  );
}
