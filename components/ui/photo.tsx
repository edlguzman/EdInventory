import type { ComponentProps } from "react";

/**
 * Plain <img> for item photos. Photos come from short-lived signed URLs or blob: URLs,
 * so next/image optimization (and its Vercel Hobby quota) is not used on purpose.
 */
export function Photo({ alt, ...props }: ComponentProps<"img"> & { alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs, already resized on upload
  return <img alt={alt} decoding="async" {...props} />;
}
