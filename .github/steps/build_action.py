"""
Builds the bundled action if the source was changed.
"""

import json
import os
import shutil
import subprocess

import git


GIT_USER_NAME = "github-actions"
GIT_EMAIL = "actions@yaxi.tech"


def main():
    with open(os.environ["GITHUB_EVENT_PATH"]) as input_file:
        event_data = json.load(input_file)

    if event_data["ref"].startswith("refs/heads/"):
        branch_name = event_data["ref"][len("refs/heads/") :]
    else:
        branch_name = None

    commits = event_data["commits"]
    if not commits:
        print("No commits, nothing to do")
        return

    repo = git.Repo(".")

    last_commit = repo.commit(commits[-1]["id"])
    for diff in last_commit.diff(commits[0]["id"] + "~"):
        if (diff.a_path or diff.b_path).startswith("src/"):
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

    if not repo.git.status("-s"):
        print("No changes to commit")
        return
    elif branch_name is None:
        print("Not in a branch, but there are source changes. This is unexpected.")
        raise SystemExit(1)

    repo.git.config("user.name", GIT_USER_NAME)
    repo.git.config("user.email", GIT_EMAIL)

    extra_commit_args = []
    extra_push_args = []
    if (
        branch_name != "main"
        and last_commit.author.name == GIT_USER_NAME
        and last_commit.author.email == GIT_EMAIL
    ):
        extra_commit_args.append("--amend")
        extra_push_args.append("-f")
    repo.git.commit(
        "-a", "-m", "Rebuild bundled action from source", *extra_commit_args
    )
    repo.git.push(*extra_push_args)


main()
