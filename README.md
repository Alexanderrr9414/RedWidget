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

1. Abre **Actions → Build Windows app** en GitHub y descarga el artefacto
   `RedEnVivo-Windows` de la última ejecución correcta.
2. Extrae y ejecuta `RedEnVivo.exe`. El icono queda junto al reloj de Windows;
   haz clic en él para abrir el panel. Cerrar el panel lo deja en la bandeja.
3. Haz clic derecho en el icono para cambiar de tema, actualizar la IP pública
   o salir. La preferencia de tema se guarda en `%APPDATA%\RedEnVivo`.
   Conserva también la carpeta `ThirdPartyLicenses` incluida en el archivo.

El `.exe` se genera automáticamente para Windows mediante GitHub Actions.

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
