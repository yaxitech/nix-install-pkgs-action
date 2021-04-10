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
        nodeEnv = import ./node-env { inherit pkgs; };
      in
      {
        checks.nixpkgs-fmt = pkgs.runCommand "check-nix-format" { } ''
          ${pkgs.nixpkgs-fmt}/bin/nixpkgs-fmt --check ${./.}
          mkdir $out #sucess
        '';

        checks.prettier = pkgs.runCommand "check-ts-format" { } ''
          ${nodeEnv.nodeDependencies}/bin/prettier --check ${./.}/src/*.ts
          mkdir $out # success
        '';

        devShell = pkgs.mkShell {
          name = "${packageJson.name}-shell";

          buildInputs = with pkgs; [
            fish
            nodejs
            nodePackages.node2nix
            nodeEnv.nodeDependencies
          ];

          shellHook = ''
            exec fish
          '';
        };
      });
}
