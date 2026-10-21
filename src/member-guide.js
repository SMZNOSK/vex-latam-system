import { ChannelType, EmbedBuilder } from 'discord.js';
import { commands } from './commands.js';
import { UserError } from './domain.js';
import { noMentions } from './ui.js';
import { pinIfAllowed } from './pins.js';

const footer = 'VEX LATAM SYSTEM · Guía para miembros';
const missing = error => { if ([10003, 10008].includes(error.code)) return null; throw error; };
const descriptions = {
  ayuda: 'Consulta cómo usar el bot y sus funciones.',
  perfil: 'Crea tu perfil o consulta y edita tu ficha privada: Embark ID, RS, clase y patrocinador.',
  buscar: 'Abre el asistente para buscar compañeros con filtros. Requiere un perfil completo y activo.',
  leaderboard: 'Consulta el top 10 por RS de los perfiles registrados en esta comunidad.',
};

export class MemberGuide {
  constructor(bot) { this.bot = bot; this.pending = new Set(); }
  async setup(guild) {
    this.pending.add(guild.id);
    await guild.channels.fetch();
    const settings = this.bot.store.settings(guild.id), ref = settings.memberGuide;
    let channel = ref?.channel ? await guild.channels.fetch(ref.channel).catch(missing) : null;
    if (!channel) {
      const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name.includes('comandos-del-bot'));
      if (matches.size > 1) throw new UserError('Hay varios canales de comandos del bot. Conserva uno para publicar la guía.');
      channel = matches.first();
    }
    if (!channel) {
      const registration = guild.channels.cache.get(settings.panels?.registro?.channel);
      channel = await guild.channels.create({ name: 'comandos-del-bot', type: ChannelType.GuildText,
        ...(registration?.parentId ? { parent: registration.parentId } : {}), reason: 'Guía pública de comandos para miembros' });
    }
    if (channel.type !== ChannelType.GuildText) throw new UserError('La guía debe publicarse en un canal de texto.');
    await this.bot.community.permissions(guild, channel);
    const publicCommands = commands.filter(c => c.default_member_permissions == null);
    const command = name => {
      const registered = guild.commands.cache.find(c => c.name === name);
      return registered ? `</${name}:${registered.id}>` : `\`/${name}\``;
    };
    const link = (id, fallback) => id ? `<#${id}>` : fallback;
    const payload = { embeds: [new EmbedBuilder().setColor(0xed243b).setTitle('🎮 Comandos para miembros')
      .setDescription('Puedes usar estos comandos sin ser administrador. Sus respuestas son privadas.\n\n'
        + publicCommands.map(c => `${command(c.name)}\n${descriptions[c.name] ?? c.description}`).join('\n\n'))
      .addFields(
        { name: '🕹️ También puedes usar los paneles', value: `**Perfil:** ${link(settings.panels?.registro?.channel, '#configurar-perfil')}.\n**Buscar compañeros:** ${link(settings.panels?.buscar?.channel, '#buscar-equipo')}. En las tarjetas de equipo puedes unirte, salir y acceder a la sala de voz cuando esté disponible.` },
        { name: '🏆 Participar en torneos', value: `Consulta los anuncios en ${link(settings.tournamentsChannel, '#torneos')}. Abre el canal de inscripciones del torneo y pulsa el botón de inscripción individual o de equipo que ofrezca su cartel.` },
        { name: '🛡️ Solicitar ingreso a un clan', value: `Completa tu perfil y adjunta una captura de tu Embark ID y RS.\n**VXTG · Oro recomendado:** ${link(settings.clans?.vxtg?.joinChannel,'#unete-a-vxtg')}. Con menos de 20,000 RS puedes solicitar; se avisa al staff.\n**VXLTM · Cualquier RS:** ${link(settings.clans?.vxltm?.joinChannel,'#unete-a-vxltm')}.\nPulsa **Solicitar ingreso**. Solo puedes pertenecer a un clan; los administradores revisan la solicitud.` },
        { name: '📬 Feedback y reportes', value: `**Ideas y sugerencias:** ${link(settings.mailboxes?.channels?.feedbackPublic, '#feedback')}, botón del cartel. Máximo 3 al día por persona; anonimato opcional.\n**Reportar a un usuario:** ${link(settings.mailboxes?.channels?.reportPublic, '#reportes')}, botón del cartel. Solo los administradores reciben estos envíos.` },
      ).setFooter({ text: footer })], allowedMentions: noMentions };
    let message = ref?.channel === channel.id && ref.message ? await channel.messages.fetch(ref.message).catch(missing) : null;
    if (message && message.author.id !== this.bot.client.user.id) throw new UserError('La guía guardada no pertenece al bot.');
    if (!message) {
      const recent = await channel.messages.fetch({ limit: 100 });
      message = recent.find(m => m.author.id === this.bot.client.user.id && m.embeds.some(e => e.footer?.text === footer));
    }
    if (message) message = await message.edit(payload);
    else message = await channel.send(payload);
    const latest = this.bot.store.settings(guild.id);
    latest.memberGuide = { channel: channel.id, message: message.id };
    this.bot.store.saveSettings(guild.id, latest);
    await pinIfAllowed(message,'Comandos disponibles para todos los miembros');
    this.pending.delete(guild.id);
    return message;
  }
  async tick(guild) {
    if (this.pending.has(guild.id) || !guild.channels.cache.has(this.bot.store.settings(guild.id).memberGuide?.channel)) await this.setup(guild);
  }
}
