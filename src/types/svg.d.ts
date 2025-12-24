/// <reference types="vite-plugin-svgr/client" />

declare module "*.svg?react" {
  import type { FC, SVGProps } from "react";
  const content: FC<SVGProps<SVGSVGElement>>;
  export default content;
}

declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export { ReactComponent };
  const src: string;
  export default src;
}
