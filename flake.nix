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
        nodejs = pkgs.nodejs-12_x;
        nodeEnv = import ./node-env { inherit pkgs nodejs; };
      in
      {
        checks.black = pkgs.runCommand "check-py-format" { } ''
          ${pkgs.python3Packages.black}/bin/black --check ${./.}
          mkdir $out # success
        '';

        checks.nixpkgs-fmt = pkgs.runCommand "check-nix-format" { } ''
          ${pkgs.nixpkgs-fmt}/bin/nixpkgs-fmt --check ${./.}
          mkdir $out #sucess
        '';

        checks.prettier = pkgs.runCommand "check-ts-format" { } ''
          ${nodeEnv.nodeDependencies}/bin/prettier --check ${./.}/src/*.ts
          mkdir $out # success
        '';

        defaultPackage = pkgs.stdenv.mkDerivation {
          name = packageJson.name;

          buildInputs = [
            nodejs
            nodeEnv.nodeDependencies
          ];

          src = ./.;

          buildPhase = ''
            HOME=.

            ln -s ${nodeEnv.nodeDependencies}/lib/node_modules node_modules

            npm run build

            mkdir -p $out/lib
            cp -r dist/ $out/lib/
          '';

          dontInstall = true;
        };

        apps = {
          refresh-node-env = flake-utils.lib.mkApp {
            drv = (pkgs.writeShellScriptBin "refresh-node-env" ''
              ${pkgs.nodePackages.node2nix}/bin/node2nix \
                --development \
                --input package.json \
                --lock package-lock.json \
                --node-env node-env/node-env.nix \
                --output node-env/node-packages.nix \
                --composition node-env/default.nix \
                --nodejs-12
              ${pkgs.nixpkgs-fmt}/bin/nixpkgs-fmt node-env
            '');
          };
        };

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
