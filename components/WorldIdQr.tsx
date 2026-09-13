"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The World ID scan code.
 *
 * The encoded value is IDKit's `connectorURI` and nothing else. It only exists once a
 * signed `rp_context` has produced a request, so when there is no URI this renders the
 * reason rather than a decorative code: a QR that resolves to nothing, on the screen
 * whose whole subject is what gets recorded, would be worse than an empty frame.
 */
export function WorldIdQr({ uri }: { uri: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#0B0B0D", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (dataUrl) {
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

  return (
    <div
      className="flex h-[256px] w-[256px] items-center justify-center rounded-[18px]
        border border-dashed border-border-strong p-6 text-center"
    >
      <p className="text-[13px] leading-relaxed text-muted">
        {failed
          ? "The request could not be encoded."
          : "The code appears here once a signed proof request exists. It encodes IDKit's connectorURI — nothing is drawn until there is something real to scan."}
      </p>
    </div>
  );
}
