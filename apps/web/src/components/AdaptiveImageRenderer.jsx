import { useEffect, useState } from "react";

const LANDSCAPE_THRESHOLD = 1.08;
const PORTRAIT_THRESHOLD = 0.92;

function resolveOrientation(width, height) {
  const ratio = width / Math.max(1, height);
  if (ratio > LANDSCAPE_THRESHOLD) return "landscape";
  if (ratio < PORTRAIT_THRESHOLD) return "portrait";
  return "square";
}

function aspectClassName(orientation) {
  if (orientation === "portrait") return "aspect-[4/6]";
  if (orientation === "square") return "aspect-square";
  return "aspect-[16/10]";
}

export default function AdaptiveImageRenderer({
  src,
  alt,
  className = "",
  frameClassName = "",
  imageClassName = "",
  paddingClassName = "p-3",
}) {
  const [orientation, setOrientation] = useState("landscape");

  useEffect(() => {
    let ignore = false;
    const img = new Image();
    img.onload = () => {
      if (ignore) return;
      setOrientation(resolveOrientation(img.naturalWidth, img.naturalHeight));
    };
    img.src = src;

    return () => {
      ignore = true;
    };
  }, [src]);

  return (
    <div className={`${aspectClassName(orientation)} ${className}`.trim()}>
      <div className={`h-full w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white ${frameClassName}`.trim()}>
        <div className={`flex h-full w-full items-center justify-center ${paddingClassName}`.trim()}>
          <img
            src={src}
            alt={alt}
            className={`h-full w-full object-contain object-center ${imageClassName}`.trim()}
          />
        </div>
      </div>
    </div>
  );
}
