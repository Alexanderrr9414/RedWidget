import ipaddress
import urllib.request


PROVIDERS = (
    "https://api.ipify.org",
    "https://checkip.amazonaws.com",
    "https://ipv4.icanhazip.com",
    "https://api64.ipify.org",
)


def fetch_public_ip():
    errors = []
    for url in PROVIDERS:
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "RedEnVivo/1.0"},
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                address = response.read(128).decode("ascii").strip()
            return str(ipaddress.ip_address(address))
        except (OSError, UnicodeError, ValueError) as error:
            errors.append(f"{url}: {error}")

    raise RuntimeError("Fallaron todos los servicios de IP pública. " + " | ".join(errors))
