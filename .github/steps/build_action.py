"""
Builds the bundled action if the source was changed.
"""

import json
import os
import shutil
import subprocess

import git


def main():
    with open(os.environ["GITHUB_EVENT_PATH"]) as input_file:
        event_data = json.load(input_file)
    commits = event_data["commits"]
    if not commits:
        print("No commits, nothing to do")
        return

    repo = git.Repo(".")

    last_commit = repo.commit(commits[-1]["id"])
    for diff in last_commit.diff(commits[0]["id"] + "~"):
        if diff.a_path.startswith("src/"):
            break
    else:
        print("Source wasn't changed, nothing to do")
        return

    subprocess.run(["nix", "build"])
    shutil.copytree("result/lib/dist", "dist", dirs_exist_ok=True)

    # Files in the Nix store are read-only and the checkout action then fails
    # to clean up afterwards. Help a bit by making the copied files writable.
    for (root, dirs, files) in os.walk("dist"):
        for name in dirs:
            path = os.path.join(root, name)
            os.chmod(path, 0o755)
        for name in files:
            path = os.path.join(root, name)
            os.chmod(path, 0o644)

    repo.git.config("user.name", "github-actions")
    repo.git.config("user.email", "actions@yaxi.tech")

    repo.git.commit("-a", "-m", "Rebuild bundled action from source")
    repo.git.push()


main()
