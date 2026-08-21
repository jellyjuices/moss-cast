export const ESC = "\u001b";

export const KEY = {
  UP: `${ESC}[A`,
  DOWN: `${ESC}[B`,
  ESC,
  CTRL_C: "\u0003",
  SPACE: " ",
};

const paint = (code) => (text) => `${ESC}[${code}m${text}${ESC}[0m`;

export const color = {
  dim: paint(2),
  bold: paint(1),
  green: paint(32),
  yellow: paint(33),
  red: paint(31),
  cyan: paint(36),
};

export const hideCursor = () => process.stdout.write(`${ESC}[?25l`);
export const showCursor = () => process.stdout.write(`${ESC}[?25h`);
