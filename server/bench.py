"""
Simple async benchmark for the Username Location Cache API.

Examples:
    python bench.py --url http://localhost:8000 --requests 200 --concurrency 20
    python bench.py --url https://twitter.superintendent.me --requests 100 --concurrency 10 --timeout 5
"""
import argparse
import asyncio
import random
import statistics
import time
from collections import Counter
from typing import Iterable, List, Tuple

import httpx


def _load_usernames(path: str | None, total: int) -> List[str]:
    if path:
        with open(path, "r", encoding="utf-8") as handle:
            names = [line.strip() for line in handle if line.strip()]
        if names:
            return names
    # Default pseudo-random usernames to mix cache hits/misses
    base = ["alice", "bob", "charlie", "dana", "eric", "frank", "grace", "heidi"]
    # Ensure enough variety for the requested volume
    rng = random.Random(42)
    names = []
    while len(names) < max(total, len(base)):
        names.append(f"{rng.choice(base)}{rng.randint(0, 9999)}")
    return names


def _percentile(data: List[float], pct: float) -> float:
    if not data:
        return 0.0
    k = (len(data) - 1) * pct
    f = int(k)
    c = min(f + 1, len(data) - 1)
    if f == c:
        return data[f]
    return data[f] + (data[c] - data[f]) * (k - f)


async def _issue_request(client: httpx.AsyncClient, url: str, username: str) -> Tuple[float, int | None]:
    start = time.perf_counter()
    try:
        response = await client.get(url, params={"a": username})
        return (time.perf_counter() - start) * 1000, response.status_code
    except Exception:
        return (time.perf_counter() - start) * 1000, None


async def run_benchmark(
    client: httpx.AsyncClient,
    url: str,
    total_requests: int,
    concurrency: int,
    usernames: Iterable[str],
    timeout: float,
) -> None:
    sem = asyncio.Semaphore(concurrency)
    latencies: List[float] = []
    status_counts: Counter[int | None] = Counter()

    async def worker(name: str):
        async with sem:
            latency_ms, status = await _issue_request(client, url, name)
            latencies.append(latency_ms)
            status_counts[status] += 1

    username_pool = list(usernames)
    tasks = []
    for i in range(total_requests):
        tasks.append(asyncio.create_task(worker(username_pool[i % len(username_pool)])))

    started = time.perf_counter()
    await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - started

    latencies.sort()
    success = sum(count for code, count in status_counts.items() if code and 200 <= code < 400)
    failures = total_requests - success

    print(f"Target: {url}")
    print(f"Requests: {total_requests}  Concurrency: {concurrency}  Timeout: {timeout}s")
    print(f"Duration: {elapsed:.2f}s  Throughput: {total_requests / elapsed:.1f} req/s")
    print(f"Success: {success}  Failures: {failures}")
    for code in sorted(code for code in status_counts if code):
        print(f"  {code}: {status_counts[code]}")
    if status_counts[None]:
        print(f"  errors: {status_counts[None]}")

    if latencies:
        print("Latency (ms):")
        print(f"  avg: {statistics.mean(latencies):.2f}")
        print(f"  p50: {_percentile(latencies, 0.50):.2f}")
        print(f"  p90: {_percentile(latencies, 0.90):.2f}")
        print(f"  p99: {_percentile(latencies, 0.99):.2f}")


def main():
    parser = argparse.ArgumentParser(description="Benchmark the Username Location Cache API.")
    parser.add_argument("--url", default="http://localhost:8000/check", help="Full /check endpoint URL")
    parser.add_argument("--requests", type=int, default=100, help="Number of requests to send")
    parser.add_argument("--concurrency", type=int, default=10, help="Concurrent in-flight requests")
    parser.add_argument("--timeout", type=float, default=10.0, help="Per-request timeout in seconds")
    parser.add_argument("--usernames-file", help="Optional path to newline-delimited usernames")
    args = parser.parse_args()

    usernames = _load_usernames(args.usernames_file, args.requests)
    if not usernames:
        raise SystemExit("No usernames provided or loaded")

    print("Starting benchmark...")
    timeout = httpx.Timeout(args.timeout)
    limits = httpx.Limits(max_connections=args.concurrency, max_keepalive_connections=args.concurrency)
    transport = httpx.AsyncHTTPTransport(retries=1)

    async def runner():
        async with httpx.AsyncClient(timeout=timeout, limits=limits, transport=transport, http2=False) as client:
            await run_benchmark(
                client=client,
                url=args.url,
                total_requests=args.requests,
                concurrency=args.concurrency,
                usernames=usernames,
                timeout=args.timeout,
            )

    asyncio.run(runner())


if __name__ == "__main__":
    main()
