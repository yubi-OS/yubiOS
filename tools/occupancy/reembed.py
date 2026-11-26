"""Optional fresh Cloudflare run. Cached vectors suffice for all analyses."""

import argparse, gzip, json, os
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    p = argparse.ArgumentParser()
    p.add_argument("dataset")
    p.add_argument("output")
    p.add_argument("--request-mean", action="store_true")
    args = p.parse_args()
    texts = [json.loads(x)["text"] for x in Path(args.dataset).read_text().splitlines()]
    aid = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{aid}/ai/run/@cf/baai/bge-m3"
    data = []
    for start in range(0, len(texts), 6):
        body = {"text": texts[start : start + 6]}
        if args.request_mean:
            body["pooling"] = "mean"
        req = Request(
            url,
            data=json.dumps(body).encode(),
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
            },
        )
        with urlopen(req, timeout=60) as resp:
            result = json.load(resp)["result"]
        if result["shape"] != [len(body["text"]), 1024]:
            raise ValueError("unexpected response shape")
        print(
            "Batch",
            start // 6 + 1,
            "pooling reported by provider",
            result.get("pooling"),
        )
        data.extend(result["data"])
    Path(args.output).write_bytes(
        gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0)
    )


if __name__ == "__main__":
    main()
