// Minimal arrow-key list picker for the terminal. Zero dependencies.
import { stdin, stdout } from "node:process";
import { color } from "./config.mjs";

const ESC = "\u001b";
const KEY_UP = `${ESC}[A`;
const KEY_DOWN = `${ESC}[B`;
const CTRL_C = "\u0003";

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
      stdout.write(`${ESC}[?25h`); // show cursor again
    };

    const onData = (buf) => {
      const key = buf.toString();
      if (key === CTRL_C || key === ESC) {
        cleanup();
        stdout.write(color.dim("\nCancelled.\n"));
        process.exit(130);
      } else if (key === KEY_UP || key === "k") {
        index = (index - 1 + items.length) % items.length;
        draw();
      } else if (key === KEY_DOWN || key === "j") {
        index = (index + 1) % items.length;
        draw();
      } else if (key === "\r" || key === "\n") {
        cleanup();
        resolve(items[index]);
      }
    };

    stdout.write(`${ESC}[?25l`); // hide cursor while navigating
    draw(true);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
