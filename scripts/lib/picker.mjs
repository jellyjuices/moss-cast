// Minimal arrow-key list picker for the terminal. Zero dependencies.
import { stdin, stdout } from "node:process";
import { ESC, KEY, color, hideCursor, showCursor } from "./term.mjs";

export function pick(title, items, render = (x) => x) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error("Not a TTY - run this from a terminal window."));
      return;
    }

    let index = 0;

    const draw = (first = false) => {
      if (!first) stdout.write(`${ESC}[${items.length + 1}A`);
      stdout.write(`${color.bold(title)}${ESC}[K\n`);
      items.forEach((item, i) => {
        const selected = i === index;
        const marker = selected ? color.cyan("> ") : "  ";
        const label = selected ? color.cyan(render(item)) : render(item);
        stdout.write(`${marker}${label}${ESC}[K\n`);
      });
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      showCursor();
    };

    const onData = (buf) => {
      const key = buf.toString();
      if (key === KEY.CTRL_C || key === KEY.ESC) {
        cleanup();
        stdout.write(color.dim("\nCancelled.\n"));
        process.exit(130);
      } else if (key === KEY.UP || key === "k") {
        index = (index - 1 + items.length) % items.length;
        draw();
      } else if (key === KEY.DOWN || key === "j") {
        index = (index + 1) % items.length;
        draw();
      } else if (key === "\r" || key === "\n") {
        cleanup();
        resolve(items[index]);
      }
    };

    hideCursor();
    draw(true);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
