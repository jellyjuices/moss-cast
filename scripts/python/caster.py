import json
import sys
import threading
import uuid as uuidlib

import pychromecast

DEFAULT_MIME_TYPE = "audio/wav"
DIRECT_CONNECT_TIMEOUT = 2
DIRECT_WAIT_TIMEOUT = 5
DISCOVERY_WAIT_TIMEOUT = 20
STREAM_ACTIVATION_TIMEOUT = 20
STATUS_POLL_SECONDS = 1.0


def emit(**payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def connect_to_known_address(name, ip, port, uuid, model):
    cast = pychromecast.get_chromecast_from_host(
        (ip, int(port), uuidlib.UUID(uuid), model, name),
        tries=1, retry_wait=0, timeout=DIRECT_CONNECT_TIMEOUT,
    )
    cast.wait(timeout=DIRECT_WAIT_TIMEOUT)
    if not cast.socket_client.is_connected or cast.status is None:
        try:
            cast.disconnect(blocking=False)
        except Exception:
            pass
        raise ConnectionError(f"{name} is not at {ip}:{port} any more")
    return cast


def connect_by_discovery(name):
    chromecasts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name])
    if not chromecasts:
        pychromecast.discovery.stop_discovery(browser)
        return None, None
    cast = chromecasts[0]
    cast.wait(timeout=DISCOVERY_WAIT_TIMEOUT)
    return cast, browser


def main():
    name = sys.argv[1]
    url = sys.argv[2]
    mime_type = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_MIME_TYPE
    known_address = sys.argv[4:8] if len(sys.argv) >= 8 else None

    cast = None
    browser = None
    if known_address:
        try:
            cast = connect_to_known_address(name, *known_address)
        except Exception:
            cast = None

    if cast is None:
        cast, browser = connect_by_discovery(name)

    if cast is None:
        emit(event="error", message=f"Could not find {name} on the network")
        return 1

    media = cast.media_controller

    def start_stream():
        media.play_media(url, mime_type, stream_type="LIVE")
        media.block_until_active(timeout=STREAM_ACTIVATION_TIMEOUT)

    start_stream()

    emit(event="ready", volume=round(cast.status.volume_level, 2))

    def watch_status():
        last_reported = None
        while True:
            try:
                playback_state = cast.media_controller.status.player_state
                volume = round(cast.status.volume_level, 2)
                if (playback_state, volume) != last_reported:
                    emit(event="status", volume=volume, state=playback_state)
                    last_reported = (playback_state, volume)
            except Exception:
                pass
            threading.Event().wait(STATUS_POLL_SECONDS)

    threading.Thread(target=watch_status, daemon=True).start()

    for line in sys.stdin:
        parts = line.strip().split()
        if not parts:
            continue
        command = parts[0]
        if command == "pause":
            try:
                media.pause()
                emit(event="status", volume=round(cast.status.volume_level, 2),
                     state="PAUSED")
            except Exception as error:
                emit(event="error", message=str(error))
        elif command == "resume":
            try:
                start_stream()
                emit(event="status", volume=round(cast.status.volume_level, 2),
                     state=media.status.player_state)
            except Exception as error:
                emit(event="error", message=f"Could not resume: {error}")
        elif command == "vol" and len(parts) == 2:
            try:
                level = max(0.0, min(1.0, float(parts[1])))
                cast.set_volume(level)
                emit(event="status", volume=round(level, 2),
                     state=cast.media_controller.status.player_state)
            except Exception as error:
                emit(event="error", message=str(error))
        elif command == "stop":
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
