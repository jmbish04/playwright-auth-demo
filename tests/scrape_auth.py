import os
import sys
import json
from urllib.parse import urljoin

import requests


DEPLOYED_URL = os.environ.get(
    "JOB_EXTRACTOR_URL",
    "https://playwright-auth-demo.hacolby.workers.dev/",
)

TARGET_JOB_URL = "https://www.linkedin.com/jobs/view/4281423903/"


def fetch_job_page(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }
    resp = requests.get(url, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.text


def main() -> int:
    # Prepare worker endpoint
    url = DEPLOYED_URL
    if not url.startswith("http"):
        print(f"Invalid JOB_EXTRACTOR_URL: {url}", file=sys.stderr)
        return 2
    if not url.endswith("/"):
        url += "/"
    target = urljoin(url, "extract-text")

    print(f"Fetching job page: {TARGET_JOB_URL}")
    try:
        job_html = fetch_job_page(TARGET_JOB_URL)
    except requests.RequestException as e:
        print(f"Failed to fetch job page: {e}", file=sys.stderr)
        return 3

    print(f"Posting scraped HTML to worker: {target}")
    headers = {"Content-Type": "text/plain"}
    try:
        resp = requests.post(target, data=job_html.encode("utf-8"), headers=headers, timeout=90)
    except requests.RequestException as e:
        print(f"Request error: {e}", file=sys.stderr)
        return 4

    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print("Response text:")
        print(resp.text)
        return 5

    try:
        data = resp.json()
    except json.JSONDecodeError:
        print("Failed to decode JSON. Raw response:")
        print(resp.text)
        return 6

    print("OK — received structured job data:")
    print(json.dumps(data, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())