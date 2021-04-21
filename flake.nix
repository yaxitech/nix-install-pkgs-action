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
        lib = pkgs.lib;
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
        nodejs = pkgs.nodejs-12_x;
        nodeEnv = import ./node-env { inherit pkgs nodejs; };
        pythonEnv = pkgs.python3.withPackages (ps: with ps; [ black mypy ] ++ [ GitPython ]);
      in
      with lib;
      {
        checks.black = pkgs.runCommand "check-py-format" { buildInputs = [ pythonEnv ]; } ''
          black --check ${./.}
          mkdir $out # success
        '';

        checks.mypy = pkgs.runCommand "check-py-types" { buildInputs = [ pythonEnv ]; } ''
          # mypy doesn't recurse into hidden directories
          mypy "$(find ${./.} -type f -name '*.py')"
          mkdir $out # success
        '';

        checks.nixpkgs-fmt = pkgs.runCommand "check-nix-format" { } ''
          ${pkgs.nixpkgs-fmt}/bin/nixpkgs-fmt --check ${./.}
          mkdir $out #sucess
        '';

        checks.prettier =
          let
            checkFormatCommand = packageJson.scripts.check-format;
            buildInputs = self.defaultPackage.${system}.buildInputs;
          in
          pkgs.runCommand "check-ts-format" { inherit buildInputs; } ''
            cd ${./.}
            ${checkFormatCommand}
            mkdir $out # success
          '';

        checks.metadata = pkgs.runCommand "check-metadata" { buildInputs = with pkgs; [ nixFlakes jq ]; } ''
          flakeDescription=${escapeShellArg (import ./flake.nix).description}
          packageDescription=${escapeShellArg packageJson.description}
          if [[ "$flakeDescription" == "$packageDescription" ]]; then
            mkdir $out # success
          else
            echo 'The description given in flake.nix does not match the description given in package.json'
            exit 1
          fi

          echo 'All metadata checks completed successfully'
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

          update-package-lock = flake-utils.lib.mkApp {
            drv = (pkgs.writeShellScriptBin "update-package-lock" ''
              ${nodejs}/bin/npm install --package-lock-only
            '');
          };
        };

        devShell = pkgs.mkShell {
          name = "${packageJson.name}-shell";

          buildInputs = with pkgs; [
            fish
            nodeEnv.nodeDependencies
            nodePackages.node2nix
            nodejs
            pythonEnv
          ];

          shellHook = ''
            exec fish
          '';
        };
      });
}
