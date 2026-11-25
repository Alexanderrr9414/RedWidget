import os
import subprocess
import sys
from pathlib import Path


RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
VALUE_NAME = "RedEnVivo"
STARTUP_FOLDER = Path("Microsoft/Windows/Start Menu/Programs/Startup")
SHORTCUT_NAME = "Red en vivo.lnk"


def startup_shortcut():
    appdata = Path(os.environ.get("APPDATA", Path.home()))
    return appdata / STARTUP_FOLDER / SHORTCUT_NAME


def _powershell_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def startup_target():
    executable = Path(sys.executable).resolve()
    if getattr(sys, "frozen", False):
        return executable, "", executable.parent
    script = str(Path(sys.argv[0]).resolve())
    return executable, _powershell_literal(script), Path(script).parent


def is_startup_enabled():
    return startup_shortcut().is_file()


def set_startup_enabled(enabled):
    import winreg

    if enabled:
        executable, arguments, working_directory = startup_target()
        shortcut = startup_shortcut()
        shortcut.parent.mkdir(parents=True, exist_ok=True)
        script = (
            "$shell = New-Object -ComObject WScript.Shell; "
            f"$shortcut = $shell.CreateShortcut({_powershell_literal(shortcut)}); "
            f"$shortcut.TargetPath = {_powershell_literal(executable)}; "
            f"$shortcut.Arguments = {_powershell_literal(arguments)}; "
            f"$shortcut.WorkingDirectory = {_powershell_literal(working_directory)}; "
            "$shortcut.Description = 'Red en vivo'; "
            "$shortcut.Save()"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode:
            raise OSError(
                result.stderr.strip() or "No se pudo crear el acceso directo de inicio."
            )
        _delete_run_entry()
        return

    try:
        startup_shortcut().unlink()
    except FileNotFoundError:
        pass
    _delete_run_entry()


def _delete_run_entry():
    import winreg

    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE
        ) as key:
            winreg.DeleteValue(key, VALUE_NAME)
    except FileNotFoundError:
        pass
