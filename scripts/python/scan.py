import json
import sys

import pychromecast

DEFAULT_TIMEOUT_SECONDS = 4.0


def main():
    timeout = float(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TIMEOUT_SECONDS
    services, browser = pychromecast.discovery.discover_chromecasts(timeout=timeout)
    pychromecast.discovery.stop_discovery(browser)

    for service in sorted(services, key=lambda s: s.friendly_name.lower()):
        sys.stdout.write(json.dumps({
            "name": service.friendly_name,
            "ip": service.host,
            "port": service.port,
            "uuid": str(service.uuid),
            "model": service.model_name,
        }) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
