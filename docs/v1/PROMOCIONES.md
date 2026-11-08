# Promociones · V1.4

## Autorizar a una persona

Desde #admin-bot, con las cuentas administrativas autorizadas del bot:

    /rollpromocion usuario:@Persona

El comando selecciona automáticamente **Creador VEX** si la persona pertenece a VXTG o VXLTM, según sus roles de clan o su membresía registrada. Para externos asigna **Promo VEX**. Reutiliza el rol existente o crea el que falte sin permisos globales. Al volver a ejecutarlo actualiza la categoría y retira el otro rol de promociones, sin tocar los roles del clan.

Los nombres Promo VEX y Creador VEX sustituyen el nombre Publicidad solicitado inicialmente. Ambos autorizan únicamente las funciones de promociones del bot; no otorgan administración ni permiso para mencionar @here directamente.

## Publicar un video

    /agregar promocion

Se puede abrir desde un canal del servidor. El formulario solicita título, enlace HTTPS y descripción opcional. Permite adjuntar una carátula PNG, JPG o WebP estática de hasta 8 MB. Para enlaces de YouTube intenta obtener automáticamente la miniatura; para cualquier otra plataforma se puede adjuntar la imagen. Si no hay carátula, se genera una composición con el título.

La vista previa es privada. **Publicar en Promo** envía una tarjeta blanca de la propuesta 02 / Editorial, con Saira Extra Condensed ExtraBold, avatar de Discord circular ampliado, nombre visible en Discord y rótulo **Promo VEX** o **Creador VEX**. El video se abre con el botón nativo **Ver video** y el título enlazado. La imagen generada no reproduce el video dentro de ella.

La publicación se dirige únicamente al canal configurado. En producción se reutiliza **📢・☆『🌐』-𝗣𝗥𝗢𝗠𝗢**, ID `1561609436286423070`, guardado en `promotionChannels` de bot.config.json. No se puede elegir otro destino desde el formulario. En un servidor sin vinculación, el comando administrativo reutiliza un canal Promo inequívoco o prepara #promo si falta.

El mensaje público contiene únicamente `@here` como texto de aviso. El título, la descripción y el enlace del usuario no se incorporan al texto que procesa las menciones. Los borradores y sus errores no notifican a nadie.

## Permisos y recuperación

El bot necesita Administrar roles y estar por encima de Promo VEX y Creador VEX para asignarlos. En Promo necesita Ver canal, Enviar mensajes, Insertar enlaces, Adjuntar archivos, Leer historial y Mencionar @everyone/@here. Si prepara un canal nuevo también necesita Administrar canales; los permisos de mención se conceden solo al bot dentro de ese canal.

El acceso se vuelve a comprobar al recibir el formulario y al publicar. Quitar el rol impide nuevas publicaciones. Los borradores pertenecen a su autor y caducan a los veinte minutos. Si cambia su pertenencia al clan entre la vista previa y la publicación, debe abrir el formulario de nuevo para comprobar el rótulo actualizado.

Los datos y recibos se guardan en SQLite mediante la configuración del servidor. Una respuesta perdida de Discord puede recuperarse desde la misma vista previa o desde `/agregar promocion` después de reiniciar: primero se busca el recibo para no repetir el aviso. Cancelar una vista previa nueva no publica nada.

## Diseño

Las tres propuestas y las muestras finales están en `design/promociones`. `node scripts/preview-promotions.js` las reproduce usando datos de ejemplo. La muestra visual emplea el video de referencia; el avatar final se obtiene del usuario que publica. El tema de VXLTM conserva el negativo blanco y negro y añade franjas rojas en diagonal en la cabecera y el pie.

Reinicia el bot para registrar los comandos y actualizar los carteles. Este cambio de código no publica anuncios ni asigna roles a personas por sí solo.
