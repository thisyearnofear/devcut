// Type declaration for the Runway Characters web component
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      "runway-widget": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { "pub-key"?: string },
        HTMLElement
      >;
    }
  }
}

export {};
