# Red en vivo

Red en vivo es un desklet para Cinnamon y una aplicación para la bandeja del
sistema de Windows. Muestra la velocidad de descarga y subida, la interfaz
activa, el tráfico acumulado durante la sesión y las IP local y pública. Las
velocidades se actualizan cada segundo; la IP pública se consulta una vez por
minuto mediante `api.ipify.org`. Cada IP tiene un botón para copiarla.
Puedes cambiar entre los temas **Océano**, **Medianoche**, **Bosque** y
**Claro** desde el menú de clic derecho; el tema elegido se guarda.

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

### Cinnamon (Linux)

1. Clona este repositorio en
   `~/.local/share/cinnamon/desklets/netinfo@local`.
2. Activa **Red en vivo** desde la aplicación **Desklets** de Cinnamon.
3. Usa el clic derecho en el escritorio para ajustar el tamaño.

En ambas versiones, la IP pública requiere conexión a Internet.

## Derechos de autor

Copyright © 2026 Alexanderrr9414. Todos los derechos reservados. El código se
publica para consulta; no se permite copiarlo, modificarlo, redistribuirlo ni
crear derivados sin permiso escrito. Consulta `LICENSE`.
