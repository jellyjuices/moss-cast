"""Persistent Chromecast connection driven over stdin.

Run with the python that ships inside the catt tool environment, which already has
pychromecast installed. Holding one connection open is what makes volume changes
instant: shelling out to `catt` for each keypress re-discovers the device and takes
seconds.

Protocol - one JSON object per line on stdout:
    {"event": "ready",  "volume": 0.35}
    {"event": "status", "volume": 0.40, "state": "PLAYING"}
    {"event": "error",  "message": "..."}

Commands on stdin, one per line:
    vol <0.0-1.0>
    stop
"""

import json
import sys
import threading
import uuid as uuidlib

import pychromecast


def emit(**payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def connect_direct(name, ip, port, uuid, model):
    """Straight to a known address - no mDNS round trip, so under a second."""
    cast = pychromecast.get_chromecast_from_host(
        (ip, int(port), uuidlib.UUID(uuid), model, name),
        tries=1, retry_wait=0, timeout=2,
    )
    cast.wait(timeout=5)
    # wait() returns whether or not it got there, and a stale address then fails
    # much later with a confusing NotConnected. Check now so we can fall back.
    if not cast.socket_client.is_connected or cast.status is None:
        try:
            cast.disconnect(blocking=False)
        except Exception:
            pass
        raise ConnectionError(f"{name} is not at {ip}:{port} any more")
    return cast, None


def connect_discovered(name):
    chromecasts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name])
    if not chromecasts:
        pychromecast.discovery.stop_discovery(browser)
        return None, None
    cast = chromecasts[0]
    cast.wait(timeout=20)
    return cast, browser


def main():
    name = sys.argv[1]
    url = sys.argv[2]
    mime = sys.argv[3] if len(sys.argv) > 3 else "audio/wav"
    # Optional cached address: ip port uuid model. A speaker that moved to a new
    # address just falls back to discovery, and the cache is rewritten next run.
    hint = sys.argv[4:8] if len(sys.argv) >= 8 else None

    cast = browser = None
    if hint:
        try:
            cast, browser = connect_direct(name, hint[0], hint[1], hint[2], hint[3])
        except Exception:
            cast = None

    if cast is None:
        cast, browser = connect_discovered(name)

    if cast is None:
        emit(event="error", message=f"Could not find {name} on the network")
        return 1

    mc = cast.media_controller

    def start_stream():
        # A live stream has no duration; LIVE tells the receiver not to expect one.
        mc.play_media(url, mime, stream_type="LIVE")
        mc.block_until_active(timeout=20)

    start_stream()

    emit(event="ready", volume=round(cast.status.volume_level, 2))

    def watch():
        # Report state changes (a speaker can be stolen by another app).
        last = None
        while True:
            try:
                state = cast.media_controller.status.player_state
                vol = round(cast.status.volume_level, 2)
                if (state, vol) != last:
                    emit(event="status", volume=vol, state=state)
                    last = (state, vol)
            except Exception:
                pass
            threading.Event().wait(1.0)

    threading.Thread(target=watch, daemon=True).start()

    for line in sys.stdin:
        parts = line.strip().split()
        if not parts:
            continue
        if parts[0] == "pause":
            try:
                mc.pause()
                emit(event="status", volume=round(cast.status.volume_level, 2),
                     state="PAUSED")
            except Exception as e:
                emit(event="error", message=str(e))
        elif parts[0] == "resume":
            # Not mc.play(): the receiver would carry on from its stale buffer, so
            # every pause would leave the sound that much further behind the Mac.
            # Restarting the stream throws the buffer away and returns to live.
            try:
                start_stream()
                emit(event="status", volume=round(cast.status.volume_level, 2),
                     state=mc.status.player_state)
            except Exception as e:
                emit(event="error", message=f"Could not resume: {e}")
        elif parts[0] == "vol" and len(parts) == 2:
            try:
                level = max(0.0, min(1.0, float(parts[1])))
                cast.set_volume(level)
                emit(event="status", volume=round(level, 2),
                     state=cast.media_controller.status.player_state)
            except Exception as e:
                emit(event="error", message=str(e))
        elif parts[0] == "stop":
            break

    try:
        cast.media_controller.stop()
        cast.quit_app()
    except Exception:
        pass
    finally:
        if browser is not None:
            pychromecast.discovery.stop_discovery(browser)
        try:
            cast.disconnect()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
