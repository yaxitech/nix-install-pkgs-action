import { ExecOutput } from "@actions/exec";
import { determineSystem, runNix } from "../src/nix";

test("runNix returns Nix output [recursive-nix]", () => {
  return expect(
    runNix(["eval", "--offline", "--expr", '"wurzelpfropf"'])
  ).resolves.toEqual({
    stdout: '"wurzelpfropf"\n',
    stderr: "",
    exitCode: 0,
  } as ExecOutput);
});

test("determineSystem() returns system [recursive-nix]", () => {
  return expect(determineSystem()).resolves.toMatch(
    /^(aarch64-linux|i686-linux|x86_64-linux|x86_64-darwin|aarch64-darwin)$/
  );
});
