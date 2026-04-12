export type StickyColor =
  | "yellow"
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "orange"
  | "red";

export type TextNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type Board = {
  id: string;
  name: string;
  workspaceId: string | null;
  stickies: Sticky[];
  frames: Frame[];
  connections: Connection[];
  texts: TextNode[];
  viewport: { x: number; y: number; zoom: number };
  colorMeanings?: Partial<Record<StickyColor, string>>;
  createdAt: string;
  updatedAt: string;
};

export type StickyTextAlign = "left" | "center" | "right";
export type StickyVerticalAlign = "top" | "middle" | "bottom";

export type Sticky = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: StickyColor;
  textAlign: StickyTextAlign;
  verticalAlign: StickyVerticalAlign;
  frameId: string | null;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type Frame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type Connection = {
  id: string;
  fromStickyId: string;
  toStickyId: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardSummary = {
  id: string;
  name: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
};
