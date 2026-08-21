import { stdin, stdout } from "node:process";
import { ESC, KEY, color, hideCursor, showCursor } from "./ansi.mjs";

export function pickFromList(title, items, renderItem = (item) => item) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error("Not a TTY - run this from a terminal window."));
      return;
    }

    let selectedIndex = 0;

    const draw = (firstDraw = false) => {
      if (!firstDraw) stdout.write(`${ESC}[${items.length + 1}A`);
      stdout.write(`${color.bold(title)}${ESC}[K\n`);
      items.forEach((item, index) => {
        const isSelected = index === selectedIndex;
        const marker = isSelected ? color.cyan("> ") : "  ";
        const label = isSelected ? color.cyan(renderItem(item)) : renderItem(item);
        stdout.write(`${marker}${label}${ESC}[K\n`);
      });
    };

    const cleanUp = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onKeyPress);
      showCursor();
    };

    const onKeyPress = (buffer) => {
      const key = buffer.toString();
      if (key === KEY.CTRL_C || key === KEY.ESC) {
        cleanUp();
        stdout.write(color.dim("\nCancelled.\n"));
        process.exit(130);
      } else if (key === KEY.UP || key === "k") {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        draw();
      } else if (key === KEY.DOWN || key === "j") {
        selectedIndex = (selectedIndex + 1) % items.length;
        draw();
      } else if (key === "\r" || key === "\n") {
        cleanUp();
        resolve(items[selectedIndex]);
      }
    };

    hideCursor();
    draw(true);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKeyPress);
  });
}
