#!/usr/bin/env python3
import base64
import getpass
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO_NAME = "liquid-level-calculator"
DESCRIPTION = "聯華交通液位換算表"
FILES_TO_UPLOAD = [
    "index.html",
    "styles.css",
    "app.js",
    "manifest.webmanifest",
    "service-worker.js",
    "liquid-level-calculator.html",
    "README.md",
    ".nojekyll",
]


def request(method, url, token, payload=None, ok=(200, 201, 202, 204, 304)):
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lienwha-liquid-level-calculator-deploy",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8") if resp.length != 0 else ""
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in ok:
            return exc.code, json.loads(body) if body else {}
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code}\n{body}") from exc


def request_allow(method, url, token, payload=None):
    try:
        return request(method, url, token, payload=payload)
    except RuntimeError as err:
        return None, str(err)


def main():
    root = Path(__file__).resolve().parent
    missing = [name for name in FILES_TO_UPLOAD if not (root / name).exists()]
    if missing:
        print(f"Missing files: {missing}", file=sys.stderr)
        return 1

    print("GitHub token 需要權限：")
    print("- 建立 public repo")
    print("- Contents: Read and write")
    print("- Pages: Read and write")
    print()
    token = getpass.getpass("貼上 GitHub Personal Access Token（輸入時不會顯示）：").strip()
    if not token:
        print("未輸入 token，停止。", file=sys.stderr)
        return 1

    _, user = request("GET", "https://api.github.com/user", token)
    owner = user["login"]
    repo_full_name = f"{owner}/{REPO_NAME}"
    print(f"GitHub 帳號：{owner}")

    status, result = request_allow(
        "POST",
        "https://api.github.com/user/repos",
        token,
        payload={
            "name": REPO_NAME,
            "description": DESCRIPTION,
            "private": False,
            "auto_init": False,
        },
    )
    if status in (200, 201):
        print(f"已建立 repo：{repo_full_name}")
    elif "name already exists" in str(result) or "already exists" in str(result):
        print(f"repo 已存在，改為更新：{repo_full_name}")
    else:
        raise RuntimeError(result)

    # Ensure README goes first so an empty repo gets its initial branch.
    ordered_files = ["README.md"] + [name for name in FILES_TO_UPLOAD if name != "README.md"]
    for name in ordered_files:
        path = root / name
        content = path.read_bytes()
        encoded = base64.b64encode(content).decode("ascii")
        api_path = urllib.parse.quote(name)
        get_url = f"https://api.github.com/repos/{repo_full_name}/contents/{api_path}"

        sha = None
        get_status, existing = request_allow("GET", get_url, token)
        if get_status == 200 and isinstance(existing, dict):
            sha = existing.get("sha")

        payload = {
            "message": f"Deploy {name}",
            "content": encoded,
            "branch": "main",
        }
        if sha:
            payload["sha"] = sha

        request("PUT", get_url, token, payload=payload)
        print(f"已上傳：{name}")

    pages_payload = {"source": {"branch": "main", "path": "/"}}
    pages_url = f"https://api.github.com/repos/{repo_full_name}/pages"
    status, result = request_allow("POST", pages_url, token, payload=pages_payload)
    if status in (200, 201, 202, 204):
        print("已啟用 GitHub Pages")
    else:
        status, result = request_allow("PUT", pages_url, token, payload=pages_payload)
        if status in (200, 201, 202, 204):
            print("已更新 GitHub Pages 設定")
        else:
            raise RuntimeError(result)

    page_url = f"https://{owner}.github.io/{REPO_NAME}/"
    print()
    print("完成。GitHub Pages 網址：")
    print(page_url)
    print()
    print("GitHub Pages 通常需要 1 到 3 分鐘發布。")

    for _ in range(6):
        time.sleep(10)
        try:
            with urllib.request.urlopen(page_url, timeout=10) as resp:
                if resp.status == 200:
                    print("已可連線。")
                    return 0
        except Exception:
            pass
        print("等待 Pages 發布中...")

    print("尚未讀到 200，請稍後再開網址。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
