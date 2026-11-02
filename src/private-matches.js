import { ButtonStyle, ChannelType, ModalBuilder, PermissionFlagsBits as P } from 'discord.js';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { mexicoDate, shortName } from './tournament-domain.js';
import { textLabel, row, button, privateFlags, noMentions } from './ui.js';

export class PrivateMatches {
  constructor(bot) { this.bot = bot; this.drafts = new Drafts(20 * 60000); }
  async message(channel, id) {
    const message = await channel.messages.fetch(id).catch(() => null);
    const attachment = [...(message?.attachments?.values() ?? [])].find(a => a.name === 'privada.png');
    if (!message || message.author?.id !== this.bot.client.user.id || !attachment)
      throw new UserError('No encontré una tarjeta de privadas publicada por este bot en ese enlace.');
    return { message, attachment };
  }
  save(guild, message, data) {
    const settings = this.bot.store.settings(guild);
    settings.privateMatches ??= {};
    settings.privateMatches[message] = data;
    this.bot.store.saveSettings(guild, settings);
  }
  async destination(i, id, editing = false) {
    const channel = await i.guild.channels.fetch(id).catch(() => null);
    const me = await i.guild.members.fetchMe();
    if (channel?.type !== ChannelType.GuildText || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles, ...(editing ? [P.ReadMessageHistory] : [])]))
      throw new UserError('El bot necesita ver el canal y tener permisos para enviar mensajes, adjuntar archivos y, para editar, leer el historial.');
    return channel;
  }
  async command(i) {
    let data;
    if (i.commandName === 'privadas-editar') {
      const link = i.options.getString('enlace', true).trim();
      const match = /^https:\/\/(?:www\.|canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/.exec(link);
      if (!match || match[1] !== i.guildId) throw new UserError('Copia el enlace de un mensaje de privadas de este servidor.');
      const channel = await this.destination(i, match[2], true);
      const { attachment } = await this.message(channel, match[3]);
      const saved = this.bot.store.settings(i.guildId).privateMatches?.[match[3]];
      data = { channel: match[2], message: match[3], attachment: attachment.id, values: saved?.channel === match[2] ? saved : {} };
    } else {
      const channel = i.options.getChannel('canal', true);
      await this.destination(i, channel.id);
      data = { channel: channel.id, values: {} };
    }
    const d = this.drafts.create('private-match', i.guildId, i.user.id, data), v = data.values;
    return i.showModal(new ModalBuilder().setCustomId(`privada:submit:${d.id}`).setTitle(data.message ? 'Editar partida privada' : 'Anunciar partida privada').addLabelComponents(
      textLabel('name', 'Nombre de la privada', v.name ?? '', true, 70, 'Ej. Noche de combate'),
      textLabel('theme', 'Temática', v.theme ?? '', true, 100, 'Ej. Solo francotiradores'),
      textLabel('date', 'Fecha · Ciudad de México', v.date ?? '', true, 10, 'AAAA-MM-DD'),
      textLabel('time', 'Hora · Ciudad de México', v.time ?? '', true, 5, 'HH:MM · formato 24 horas'),
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
      const date = i.fields.getTextInputValue('date').trim(), time = i.fields.getTextInputValue('time').trim();
      const startsAt = mexicoDate(date, time);
      d.step = 'rendering';
      await i.deferReply({ flags: privateFlags });
      try {
        const image = await this.bot.renderer.render('private-match', { name, theme, startsAt }, 1100);
        d.data.image = image; d.data.values = { name, theme, date, time }; d.step = 'ready';
        return await i.editReply({ content: `Vista previa. ${d.data.message ? 'Se actualizará el mensaje existente' : 'Destino'}: <#${d.data.channel}>`, files: [{ attachment: image, name: 'privada.png' }], components: [row(button(`privada:publish:${id}`, d.data.message ? 'Guardar cambios' : 'Publicar', ButtonStyle.Success), button(`privada:cancel:${id}`, 'Cancelar'))], allowedMentions: noMentions });
      } catch (error) { this.drafts.remove(id); throw error; }
    }
    if (!i.isButton() || d.step !== 'ready') throw new UserError('Esta vista previa ya no está disponible.');
    if (action === 'cancel') { this.drafts.remove(id); return i.update({ content: 'Publicación cancelada.', components: [], attachments: [] }); }
    if (action !== 'publish') throw new UserError('Acción no válida.');
    d.step = 'publishing';
    await i.deferUpdate();
    try {
      const channel = await this.destination(i, d.data.channel, Boolean(d.data.message));
      const link = await this.bot.queue(`privada:${i.guildId}:${d.data.message ?? id}`, async () => {
        let message;
        if (d.data.message) {
          const existing = await this.message(channel, d.data.message);
          if (existing.attachment.id !== d.data.attachment) throw new UserError('La tarjeta cambió. Abre de nuevo /privadas-editar.');
          message = await existing.message.edit({ attachments: [], files: [{ attachment: d.data.image, name: 'privada.png' }], allowedMentions: noMentions });
        } else {
          message = await channel.send({ files: [{ attachment: d.data.image, name: 'privada.png' }], allowedMentions: noMentions, nonce: id, enforceNonce: true });
        }
        this.save(i.guildId, message.id, { ...d.data.values, channel: channel.id });
        return `https://discord.com/channels/${i.guildId}/${channel.id}/${message.id}`;
      });
      this.drafts.remove(id);
      return await i.editReply({ content: `Tarjeta ${d.data.message ? 'actualizada' : 'publicada'}: ${link}`, components: [], attachments: [], allowedMentions: noMentions });
    } catch (error) {
      this.drafts.remove(id);
      const notice = error instanceof UserError ? error.message : 'No se pudo confirmar el cambio. Revisa el canal antes de intentarlo de nuevo.';
      await i.editReply({ content: notice, components: [], attachments: [] }).catch(() => {});
      throw error;
    }
  }
}
