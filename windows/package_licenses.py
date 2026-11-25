import shutil
from importlib.metadata import distribution
from pathlib import Path


PACKAGES = {
    "pystray": {"copying", "copying.lgpl"},
    "psutil": {"license"},
    "pillow": {"license"},
}


def main():
    destination = Path("dist/ThirdPartyLicenses")
    destination.mkdir(parents=True, exist_ok=True)

    for package, license_names in PACKAGES.items():
        installed = distribution(package)
        matches = [
            item for item in installed.files or []
            if Path(str(item)).name.lower() in license_names
        ]
        if not matches:
            raise RuntimeError(f"No se encontró la licencia de {package}")
        for item in matches:
            source = installed.locate_file(item)
            shutil.copyfile(source, destination / f"{package}-{source.name}.txt")


if __name__ == "__main__":
    main()
