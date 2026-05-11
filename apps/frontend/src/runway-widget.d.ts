// Type declaration for the Runway Characters web component
declare namespace JSX {
  interface IntrinsicElements {
    "runway-widget": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { "pub-key"?: string },
      HTMLElement
    >;
  }
}
