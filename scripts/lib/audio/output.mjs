import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SWITCHER_CANDIDATES = [
  "/opt/homebrew/bin/SwitchAudioSource",
  "/usr/local/bin/SwitchAudioSource",
];

export const findOutputSwitcher = () => SWITCHER_CANDIDATES.find((path) => existsSync(path));

const run = (switcher, args) =>
  execFileSync(switcher, args, { encoding: "utf8", timeout: 10_000 }).trim();

export const listOutputs = (switcher) =>
  run(switcher, ["-a", "-t", "output"]).split("\n").map((name) => name.trim()).filter(Boolean);

export const currentOutput = (switcher) => run(switcher, ["-c"]);

export const setOutput = (switcher, name) => run(switcher, ["-t", "output", "-s", name]);

const isMultiOutput = (name) => /multi-output/i.test(name);
const isCaptureOutput = (name) => isMultiOutput(name) || /blackhole/i.test(name);

export function findCaptureOutput(switcher) {
  const captureOutputs = listOutputs(switcher).filter(isCaptureOutput);
  return captureOutputs.find((name) => !isMultiOutput(name)) ?? captureOutputs[0];
}

export function findOutputToRestore(switcher, previousOutput) {
  if (previousOutput && !isCaptureOutput(previousOutput)) return previousOutput;
  return listOutputs(switcher).find((name) => !isCaptureOutput(name));
}
