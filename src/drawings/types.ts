export type DrawingTool = 'select' | 'ray' | 'line' | 'box';

export type DrawingPoint = { time: number; price: number };

export type Drawing = {
  id: string;
  type: Exclude<DrawingTool, 'select'>;
  points: DrawingPoint[];
  color?: string;
};
