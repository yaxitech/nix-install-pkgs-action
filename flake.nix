{
  description = "A GitHub Action to install an ephemeral Nix profile";

  inputs.nixpkgs.url = "nixpkgs/nixpkgs-unstable";
  inputs.flake-utils = {
    url = "github:numtide/flake-utils";
    inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      in
      {
        checks.format = pkgs.stdenv.mkDerivation {
          name = "check-format";

          src = ./.;

          # TODO: use `prettier` from package.json
          buildInputs = [ pkgs.nodePackages.prettier ];

          buildPhase = ''
            prettier --check **/*.ts && mkdir $out
          '';

          dontInstall = true;
        };

        devShell = pkgs.mkShell {
          name = "${packageJson.name}-shell";

          buildInputs = with pkgs; [
            fish
            nodejs-12_x
          ];

          shellHook = ''
            exec fish
          '';
        };
      });
}
