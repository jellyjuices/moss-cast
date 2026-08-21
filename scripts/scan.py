"""Discover Chromecasts and print them as JSON, one object per line.

Run with the python inside catt's tool environment. This replaces `catt scan`
because it also reports the uuid and port, which is what lets a later run connect
straight to a device instead of discovering it all over again.
"""

import json
import sys

import pychromecast


def main():
    timeout = float(sys.argv[1]) if len(sys.argv) > 1 else 4.0
    services, browser = pychromecast.discovery.discover_chromecasts(timeout=timeout)
    pychromecast.discovery.stop_discovery(browser)

    for s in sorted(services, key=lambda s: s.friendly_name.lower()):
        sys.stdout.write(json.dumps({
            "name": s.friendly_name,
            "ip": s.host,
            "port": s.port,
            "uuid": str(s.uuid),
            "model": s.model_name,
        }) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
