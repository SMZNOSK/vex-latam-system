import { ButtonStyle, ChannelType, ModalBuilder, PermissionFlagsBits as P } from 'discord.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { mexicoDate, shortName } from './tournament-domain.js';
import { textLabel, row, button, privateFlags, noMentions } from './ui.js';

export class PrivateMatches {
  constructor(bot) { this.bot = bot; this.drafts = new Drafts(20 * 60000); }
  async destination(i, id) {
    const channel = await i.guild.channels.fetch(id).catch(() => null);
    const me = await i.guild.members.fetchMe();
    if (channel?.type !== ChannelType.GuildText || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles]))
      throw new UserError('El bot necesita ver el canal y tener permisos para enviar mensajes y adjuntar archivos.');
    return channel;
  }
  async command(i) {
    const channel = i.options.getChannel('canal', true);
    await this.destination(i, channel.id);
    const d = this.drafts.create('private-match', i.guildId, i.user.id, { channel: channel.id });
    return i.showModal(new ModalBuilder().setCustomId(`privada:submit:${d.id}`).setTitle('Anunciar partida privada').addLabelComponents(
      textLabel('name', 'Nombre de la privada', '', true, 70, 'Ej. Noche de combate'),
      textLabel('theme', 'Temática', '', true, 100, 'Ej. Solo francotiradores'),
      textLabel('date', 'Fecha · Ciudad de México', '', true, 10, 'AAAA-MM-DD'),
      textLabel('time', 'Hora · Ciudad de México', '', true, 5, 'HH:MM · formato 24 horas'),
    ));
  }
  async handle(i) {
    this.bot.mailboxes.assertAdminCommand(i);
    const [, action, id] = i.customId.split(':');
    const d = this.drafts.get(id, i.guildId, i.user.id);
    if (action === 'submit' && i.isModalSubmit()) {
      if (d.step !== 'filters') throw new UserError('Este formulario ya fue enviado.');
      const name = shortName(i.fields.getTextInputValue('name'), 'Nombre');
      const theme = i.fields.getTextInputValue('theme').trim();
      if (!theme || theme.length > 100 || /[\r\n<>@]/.test(theme)) throw new UserError('Temática: usa de 1 a 100 caracteres, sin menciones ni saltos de línea.');
      const startsAt = mexicoDate(i.fields.getTextInputValue('date').trim(), i.fields.getTextInputValue('time').trim());
      d.step = 'rendering';
      await i.deferReply({ flags: privateFlags });
      try {
        const image = await this.bot.renderer.render('private-match', { name, theme, startsAt }, 1100);
        d.data.image = image; d.step = 'ready';
        return await i.editReply({ content: `Vista previa. Destino: <#${d.data.channel}>`, files: [{ attachment: image, name: 'privada.png' }], components: [row(button(`privada:publish:${id}`, 'Publicar', ButtonStyle.Success), button(`privada:cancel:${id}`, 'Cancelar'))], allowedMentions: noMentions });
      } catch (error) { this.drafts.remove(id); throw error; }
    }
    if (!i.isButton() || d.step !== 'ready') throw new UserError('Esta vista previa ya no está disponible.');
    if (action === 'cancel') { this.drafts.remove(id); return i.update({ content: 'Publicación cancelada.', components: [], attachments: [] }); }
    if (action !== 'publish') throw new UserError('Acción no válida.');
    d.step = 'publishing';
    await i.deferUpdate();
    try {
      const channel = await this.destination(i, d.data.channel);
      await channel.send({ files: [{ attachment: d.data.image, name: 'privada.png' }], allowedMentions: noMentions, nonce: id, enforceNonce: true });
      this.drafts.remove(id);
      return await i.editReply({ content: `Tarjeta publicada en <#${channel.id}>.`, components: [], attachments: [] });
    } catch (error) {
      this.drafts.remove(id);
      await i.editReply({ content: 'No se pudo confirmar la publicación. Revisa el canal antes de crear otra para evitar duplicados.', components: [], attachments: [] }).catch(() => {});
      throw error;
    }
  }
}
