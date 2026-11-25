# Red en vivo

Red en vivo es un desklet para Cinnamon y una aplicación para la bandeja del
sistema de Windows. Muestra la velocidad de descarga y subida, la interfaz
activa, el tráfico acumulado durante la sesión y las IP local y pública. Las
velocidades se actualizan cada segundo; la IP pública se consulta una vez por
minuto mediante varios servicios alternativos. Cada IP se puede copiar.
En Cinnamon y Windows puedes cambiar entre los temas **Océano**,
**Medianoche**, **Bosque** y **Claro**; el tema elegido se guarda.

![Captura del widget Red en vivo](screenshots/red-en-vivo.png)

## Instalación

### Windows

1. Ejecuta `windows/RedEnVivo.exe`. En el primer inicio se configura para
   arrancar con Windows; el icono queda junto al reloj;
   haz clic en él para abrir el panel. Cerrar el panel lo deja en la bandeja.
2. Haz clic derecho en el icono para cambiar de tema, activar o desactivar el
   inicio automático, actualizar la IP pública o salir. El tema se guarda en
   `%APPDATA%\RedEnVivo`.

El `.exe` está incluido directamente en `windows/`. GitHub Actions comprueba que
la versión de Windows se pueda compilar, pero no necesitas descargar nada desde
Actions. Las fuentes y licencias están fuera de la carpeta `windows/`.
En una máquina virtual, la IP privada mostrada pertenece a Windows dentro de
la VM (por ejemplo, `10.0.2.15` con VirtualBox en modo NAT), no necesariamente
al ordenador anfitrión.

El `.exe` no está firmado digitalmente; Windows SmartScreen puede avisar de
que es una aplicación poco frecuente.

### Cinnamon (Linux)

1. Abre una terminal y ejecuta:

   ```bash
   mkdir -p ~/.local/share/cinnamon/desklets
   git clone https://github.com/Alexanderrr9414/RedWidget.git \
     ~/.local/share/cinnamon/desklets/netinfo@local
   ```

2. Abre **Preferencias del sistema → Desklets**, busca **Red en vivo** en la
   lista de desklets instalados y añádelo al escritorio.
3. Usa el clic derecho sobre el desklet para cambiar el tema o el tamaño.

Para actualizarlo cuando haya una nueva versión, ejecuta:

```bash
git -C ~/.local/share/cinnamon/desklets/netinfo@local pull
```

Si no aparece después de instalarlo, cierra y vuelve a abrir la ventana de
**Desklets**.

### GNOME Shell (Ubuntu 24.04 o posterior)

La extensión necesita GNOME Shell 46 o posterior. Comprueba tu versión con
`gnome-shell --version`. Abre una terminal y ejecuta:

```bash
sudo apt update
sudo apt install -y curl iproute2

EXT="$HOME/.local/share/gnome-shell/extensions/red-en-vivo@alexanderrr9414"
mkdir -p "$EXT"
curl -fsSL https://raw.githubusercontent.com/Alexanderrr9414/RedWidget/main/gnome/red-en-vivo@alexanderrr9414/metadata.json -o "$EXT/metadata.json"
curl -fsSL https://raw.githubusercontent.com/Alexanderrr9414/RedWidget/main/gnome/red-en-vivo@alexanderrr9414/extension.js -o "$EXT/extension.js"
gnome-extensions enable red-en-vivo@alexanderrr9414
```

El monitor aparece en la barra superior. Haz clic en él para ver las IP y
copiarlas. Si no aparece, cierra sesión y vuelve a entrar. Para actualizar,
repite los dos comandos `curl` y reinicia la extensión:

```bash
gnome-extensions disable red-en-vivo@alexanderrr9414
gnome-extensions enable red-en-vivo@alexanderrr9414
```

En Cinnamon, GNOME y Windows, la consulta de IP pública requiere conexión a
Internet.

## Derechos de autor

Copyright © 2026 Alexanderrr9414. Todos los derechos reservados. El código se
publica para consulta; no se permite copiarlo, modificarlo, redistribuirlo ni
crear derivados sin permiso escrito. Consulta `LICENSE`.
