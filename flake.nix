{
  description = "Install flake packages using an ephemeral Nix profile";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        lib = nixpkgs.lib;
        pkgs = nixpkgs.legacyPackages.${system};
        packageJson = lib.importJSON "${self}/package.json";
        nodejs = pkgs.nodejs-16_x;
        pythonEnv = pkgs.python3.withPackages (ps: with ps; [ black mypy ] ++ [ GitPython ]);
      in
      with lib;
      {
        checks.black = pkgs.runCommand "check-py-format" { buildInputs = [ pythonEnv ]; } ''
          black --check ${self}
          mkdir $out # success
        '';

        checks.mypy = pkgs.runCommand "check-py-types" { buildInputs = [ pythonEnv ]; } ''
          # mypy doesn't recurse into hidden directories
          mypy "${self}/.github"
          mkdir $out # success
        '';

        checks.nixpkgs-fmt = pkgs.runCommand "check-nix-format" { } ''
          ${pkgs.nixpkgs-fmt}/bin/nixpkgs-fmt --check ${self}
          mkdir $out #sucess
        '';

        checks.prettier = self.packages.${system}.default.overrideAttrs (oldAttrs: {
          name = "${oldAttrs.name}-prettier";
          doCheck = false;
          npmBuildScript = "check-format";
        });

        checks.metadata = pkgs.runCommand "check-metadata" { buildInputs = with pkgs; [ yq ]; } ''
          flakeDescription=${escapeShellArg (import "${self}/flake.nix").description}
          packageDescription=${escapeShellArg packageJson.description}
          actionDescription="$(yq -r '.description' '${self}/action.yaml')"
          if [[ "$flakeDescription" == "$packageDescription" && "$flakeDescription" == "$actionDescription" ]]; then
            mkdir $out # success
          else
            echo 'The descriptions given in flake.nix, package.json and action.yaml do not match'
            exit 1
          fi

          echo 'All metadata checks completed successfully'
        '';

        packages.default = pkgs.buildNpmPackage {
          name = packageJson.name;

          src = self;

          npmDepsHash = "sha256-bEHDsmUJAfzPHbcWMRS+XrMbfCRjlaKzlba94a1r1P8=";

          NODE_OPTIONS = "--openssl-legacy-provider";

          # recursive-nix is broken on Darwin
          requiredSystemFeatures = lib.optionals (!pkgs.stdenv.isDarwin) [ "recursive-nix" ];

          doCheck = true;
          checkInputs = optionals (!pkgs.stdenv.isDarwin) [ pkgs.nixVersions.stable ];
          checkPhase = ''
            runHook preCheck

            export NIX_CONFIG="experimental-features = nix-command flakes recursive-nix";
            npm run test-no-recursive-nix

            runHook postCheck
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p     $out/lib/
            cp -r dist/. $out/lib/

            runHook postInstall
          '';
        };

        apps = {
          update-package-lock = flake-utils.lib.mkApp {
            drv = (pkgs.writeShellScriptBin "update-package-lock" ''
              ${nodejs}/bin/npm install --package-lock-only
            '');
          };

          update-dist = flake-utils.lib.mkApp {
            drv = (pkgs.writeShellScriptBin "update-dist" ''
              cp -r ${self.packages.${system}.default}/lib/{main,post} dist/
            '');
          };
        };

        devShells.default = pkgs.mkShell {
          name = "${packageJson.name}-shell";

          inputsFrom = [ self.packages.${system}.default ];

          buildInputs = with pkgs; [
            fish
            nodejs
            pythonEnv
          ];
        };
      });
}
