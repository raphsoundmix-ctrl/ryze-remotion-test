import "react";

declare module "react" {
  interface CSSProperties {
    /** Composition width / height, read by the Player monitor's max-width calc(). */
    "--ratio"?: number;
  }
}
