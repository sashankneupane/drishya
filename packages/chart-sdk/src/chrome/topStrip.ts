export type TopStripAction = "source" | "timeframe" | "fx" | "layout";

export interface TopStripState {
  sourceLabel: string;
  timeframeLabel: string;
}

export const DEFAULT_TOP_STRIP_STATE: TopStripState = {
  sourceLabel: "OHLCV",
  timeframeLabel: "TF"
};
