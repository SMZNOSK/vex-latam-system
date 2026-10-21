import { ChannelType, PermissionFlagsBits as P, ButtonStyle } from 'discord.js';
import { createHash } from 'node:crypto';
import { Drafts } from './drafts.js';
import { UserError } from './domain.js';
import { TournamentStore } from './tournament-store.js';
import { TournamentLayout } from './tournament-layout.js';
import { tournamentId, tournamentEmbarkId, embarkKey, validateBasics, validateRules, validateRegistrationMode, validateSignupMode, validateEntrant, shortName, tournamentPlayable, tournamentStatus, localDate } from './tournament-domain.js';
import { tournamentModal, draftPanel, draftControl, tournamentPayload, registrationPayload, teamPayload, voiceLink, rulesText } from './tournament-ui.js';
import { noMentions, privateFlags, safe, card, row, button } from './ui.js';
import { boundRole, assertPermanentRoleCreation } from './role-provisioning.js';
import { requireOperator, canOperate } from './admin-access.js';

export const tournamentCommands = ['torneo', 'torneos', 'torneo-formar-equipo', 'torneo-chat-de-voz-general', 'torneo-chat-de-voz-equipos'];
export function requireTournamentAdmin(i) {
  requireOperator(i);
}
const missing = error => [10003, 10008, 10011, 10007].includes(error.code);
const fetchOrNull = async task => { try { return await task(); } catch (e) { if (missing(e)) return null; throw e; } };
function mexicoFields(stamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(stamp).map(x => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export class Tournaments {
  constructor(bot) { this.bot = bot; this.store = new TournamentStore(bot.store); this.drafts = new Drafts(45 * 60000); this.layout = new TournamentLayout(this); }
  event(id, guild) {
    const t = this.store.get(id);
    if (!t || t.guild !== guild) throw new UserError('Selecciona un torneo de este servidor. Usa /torneo revisar.');
    return t;
  }
  async setup(guild) {
    const settings = this.bot.store.settings(guild.id);
    await guild.roles.fetch();
    let role = boundRole(guild, 'clan.vxtg') ?? (settings.tournamentClanRole ? guild.roles.cache.get(settings.tournamentClanRole) : null);
    if (!role) {
      const matches = guild.roles.cache.filter(r => r.name === 'VXTG');
      if (matches.size > 1) throw new UserError('Hay varios roles VXTG. Conserva un único rol de clan para configurar torneos.');
      role = matches.first();
      if (!role) {
        assertPermanentRoleCreation(guild, 'VXTG');
        role = await guild.roles.create({ name: 'VXTG', permissions: [], mentionable: false, reason: 'Identificación del clan para torneos; asignación manual por administradores' });
      }
    }
    let channel = settings.tournamentsChannel ? await fetchOrNull(() => guild.channels.fetch(settings.tournamentsChannel)) : null;
    if (!channel) {
      const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name === 'torneos');
      if (matches.size > 1) throw new UserError('Hay varios canales #torneos. Conserva uno para los anuncios de torneos.');
      channel = matches.first() ?? await guild.channels.create({ name: 'torneos', type: ChannelType.GuildText, permissionOverwrites: this.textPermissions(guild), reason: 'Anuncios de torneos VEX LATAM' });
    }
    const latest = this.bot.store.settings(guild.id);
    latest.tournamentClanRole = role.id; latest.tournamentsChannel = channel.id;
    this.bot.store.saveSettings(guild.id, latest);
    return { role, channel };
  }
  textPermissions(guild) {
    return [{ id: guild.id, type: 0, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads] },
      { id: this.bot.client.user.id, type: 1, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles, P.ManageChannels] }];
  }
  async autocomplete(i) {
    if (!canOperate(i)) return i.respond([]);
    const query = i.options.getFocused().toLowerCase();
    return i.respond(this.store.list(i.guildId).filter(t => `${t.name} ${t.id}`.toLowerCase().includes(query)).slice(0, 25).map(t => ({ name: `${tournamentStatus(t)} · ${t.name} · ${t.id}`.slice(0, 100), value: t.id })));
  }
  async command(i) {
    requireTournamentAdmin(i);
    const sub = ['torneo', 'torneos'].includes(i.commandName) ? i.options.getSubcommand() : null;
    if (sub === 'crear') {
      const d = this.drafts.create('tournament-create', i.guildId, i.user.id, { rules: validateRules({}), access: 'public', registrationMode: 'mixed' });
      return i.showModal(tournamentModal(d, 'basics'));
    }
    const id = i.options.getString('torneo');
    if (sub === 'revisar' && !id) {
      const all = this.store.list(i.guildId);
      return this.bot.replyCard(i, card('Torneos del servidor', all.slice(0, 20).map(t => `**${safe(t.name)}** · ${tournamentStatus(t)}\nID: \`${t.id}\`${t.registrationChannel ? ` · <#${t.registrationChannel}>` : ''}${t.deleteAt && !t.channelsDeletedAt ? `\nEliminar canales: <t:${Math.floor(t.deleteAt / 1000)}:R>` : ''}`).join('\n\n') || 'Todavía no hay torneos. Usa /torneo crear.'));
    }
    const t = this.event(id, i.guildId);
    if (sub === 'editar') {
      if (!tournamentPlayable(t)) throw new UserError('Solo puedes editar un torneo publicado que no haya terminado.');
      const d = this.drafts.create('tournament-edit', i.guildId, i.user.id, {
        ...t, ...mexicoFields(t.startsAt), capacity: t.capacity == null ? '' : String(t.capacity),
        baseRevision: t.editRevision ?? 0, tournament: t.id, rulesDone: true, skillsDone: true,
      });
      return this.bot.replyCard(i, draftPanel(d));
    }
    if (sub === 'cerrar' || sub === 'convocatoria') {
      if (!tournamentPlayable(t)) throw new UserError('El torneo terminó o todavía no fue publicado.');
      return this.bot.replyCard(i, card('Cerrar convocatoria', `**${safe(t.name)}**\nSe bloquearán las nuevas inscripciones. Podrás seguir formando equipos y creando o usando las salas de voz. Para iniciar los 7 días de conservación, usa /torneo terminar.`, [row(button(`tour:close:${t.id}`, 'Cerrar convocatoria'))]));
    }
    if (sub === 'terminar') {
      if (t.status === 'finished') return this.bot.replyCard(i, tournamentPayload(t, this.store.entries(t.id), this.store.teams(t.id)));
      if (!tournamentPlayable(t)) throw new UserError('Publica el torneo antes de darlo por terminado.');
      return this.bot.replyCard(i, card('Terminar torneo', `**${safe(t.name)}**\nSe dará por terminado el torneo y se cerrarán las inscripciones. Sus canales de inscripciones, equipos y voz se eliminarán automáticamente 7 días después de confirmar, incluidas las salas de voz que sigan ocupadas.`, [row(button(`tour:finish:${t.id}`, 'Confirmar fin del torneo', ButtonStyle.Danger))]));
    }
    await i.deferReply({ flags: privateFlags });
    if (sub === 'revisar') {
      const payload = tournamentPayload(t, this.store.entries(t.id), this.store.teams(t.id));
      if (t.status === 'publishing') payload.components = [row(button(`tour:retry:${t.id}`, 'Reintentar publicación'))];
      return i.editReply(payload);
    }
    return this.bot.queue(`tournament:${t.id}`, async () => {
      if (i.commandName === 'torneo-formar-equipo') {
        const profiles = new Map(this.bot.store.profiles(i.guildId).map(p => [p.user, p]));
        const result = this.store.form(t.id, Math.random, profiles);
        const posted = await this.sync(i.guild, t.id).then(() => true).catch(e => { this.bot.log(e, 'Publicar equipos; se reintentará'); return false; });
        return this.bot.sendPrivate(i, `${result.teams.length} equipos formados; ${result.pending} jugadores siguen pendientes.${posted ? ' Tarjetas actualizadas.' : ' Equipos guardados; las tarjetas se reintentarán automáticamente.'}`);
      }
      if (!tournamentPlayable(this.event(t.id, i.guildId))) throw new UserError('El torneo terminó o todavía no fue publicado.');
      const report = await this.createVoices(i.guild, t.id, i.commandName === 'torneo-chat-de-voz-equipos');
      return this.bot.sendPrivate(i, report);
    });
  }
  async handle(i) {
    if (!i.customId?.startsWith('tour:')) return false;
    const [, kind, id, revision, action] = i.customId.split(':');
    if (kind === 'join') {
      const t = this.event(id, i.guildId);
      if (t.status !== 'open') throw new UserError('Las inscripciones están cerradas.');
      validateSignupMode(t, revision);
      const existing = this.store.entries(id).find(p => p.user === i.user.id);
      if (existing) {
        const team = existing.team ? this.store.teams(id).find(x => x.id === existing.team) : null;
        if (team?.source === 'premade' && team.leader !== i.user.id) {
          await this.bot.sendPrivate(i, `Ya estás inscrito con **${safe(team.name)}**. El líder gestiona la cancelación del equipo.`); return true;
        }
        await this.bot.replyCard(i, this.receipt(id, 'Ya estás registrado en este torneo.')); return true;
      }
      const own = this.bot.store.profile(i.guildId, i.user.id);
      if (revision === 'solo' && own?.embarkId) {
        await this.bot.ackCard(i);
        const person = await this.participant(i.guild, i.user.id);
        await this.bot.queue(`tournament:${id}`, async () => {
          const current = this.event(id, i.guildId);
          const people = await this.verifyPlayers(i.guild, current, [person], i.user.id);
          this.store.register(id, people);
          await this.sync(i.guild, id).catch(e => this.bot.log(e, 'Actualizar torneo; se reintentará'));
        });
        await this.bot.replyCard(i, this.receipt(id, 'Ya estás registrado en el torneo.')); return true;
      }
      const d = this.drafts.create(`tournament-signup-${id}`, i.guildId, i.user.id, { tournament: id, mode: revision, people: [] });
      await i.showModal(tournamentModal(d, revision === 'solo' ? 'solo-id' : 'identity')); return true;
    }
    if (kind === 'withdraw') {
      await this.bot.ackCard(i);
      let removed;
      await this.bot.queue(`tournament:${id}`, async () => {
        this.event(id, i.guildId);
        removed = this.store.withdraw(id, i.user.id);
        const latest = this.event(id, i.guildId);
        if (latest.voiceRole) for (const user of removed.removedUsers) {
          const member = await fetchOrNull(() => i.guild.members.fetch(user));
          if (member?.roles.cache.has(latest.voiceRole)) await member.roles.remove(latest.voiceRole).catch(e => this.bot.log(e, 'Retirar acceso a voz del torneo'));
        }
        if (removed.team) {
          const t = this.event(id, i.guildId);
          const channel = t.teamsChannel ? await fetchOrNull(() => i.guild.channels.fetch(t.teamsChannel)) : null;
          if (channel && removed.team.message) await fetchOrNull(() => channel.messages.fetch(removed.team.message)).then(m => m?.delete().catch(e => this.bot.log(e, 'Retirar tarjeta del equipo')));
          if (removed.team.voiceChannel) await fetchOrNull(() => i.guild.channels.fetch(removed.team.voiceChannel)).then(c => c?.delete().catch(e => this.bot.log(e, 'Retirar sala del equipo')));
        }
        await this.sync(i.guild, id).catch(e => this.bot.log(e, 'Actualizar torneo; se reintentará'));
      });
      await this.bot.sendPrivate(i, removed.team?.source === 'premade' ? 'Inscripción del equipo cancelada.' : 'Tu inscripción fue cancelada.'); return true;
    }
    if (kind === 'rename') {
      const team = this.store.teams(id).find(x => x.id === revision);
      if (!team || team.leader !== i.user.id) throw new UserError('Solo el líder puede cambiar el nombre de este equipo.');
      const d = this.drafts.create('tournament-rename', i.guildId, i.user.id, { tournament: id, team: team.id, name: team.name });
      await i.showModal(tournamentModal(d, 'rename')); return true;
    }
    if (['close', 'finish', 'retry'].includes(kind)) {
      requireTournamentAdmin(i); this.event(id, i.guildId);
      await i.deferReply({ flags: privateFlags });
      let synced = true;
      await this.bot.queue(`tournament:${id}`, async () => {
        this.event(id, i.guildId);
        if (kind === 'close') this.store.closeRegistration(id);
        if (kind === 'finish') this.store.finish(id);
        if (kind === 'retry') await this.sync(i.guild, id);
        else await this.sync(i.guild, id).catch(e => { synced = false; this.bot.log(e, 'Actualizar estado del torneo; se reintentará'); });
      });
      const t = this.event(id, i.guildId);
      const message = kind === 'close' ? 'Convocatoria cerrada. El torneo continúa: puedes formar equipos y usar las salas. La cuenta de 7 días comenzará con /torneo terminar.'
        : kind === 'finish' ? t.channelsDeletedAt ? 'El torneo ya terminó y sus canales fueron eliminados.'
          : `Torneo terminado. Sus canales se eliminarán el ${localDate(t.deleteAt)} (centro de México), <t:${Math.floor(t.deleteAt / 1000)}:R>.`
        : 'Publicación recuperada.';
      await this.bot.sendPrivate(i, message + (synced ? '' : ' El cambio quedó guardado; la actualización de los paneles se reintentará automáticamente.')); return true;
    }
    if (kind !== 'd') throw new UserError('Control de torneo desconocido.');
    const d = this.drafts.get(id, i.guildId, i.user.id);
    if (['tournament-create', 'tournament-edit'].includes(d.kind)) requireTournamentAdmin(i);
    if (d.revision !== Number(revision) || d.busy) throw new UserError('Usa el panel más reciente o espera a que termine la acción actual.');
    if (action === 'cancel') { this.drafts.remove(d.id); await this.bot.sendPrivate(i, 'Asistente cancelado.'); return true; }
    if (['basics', 'rules', 'skills', 'identity', 'solo-id', 'missing', 'rename'].includes(action)) {
      const adminStep = ['basics', 'rules', 'skills'].includes(action);
      if (adminStep !== ['tournament-create', 'tournament-edit'].includes(d.kind)) throw new UserError('Este formulario no corresponde al asistente.');
      if (!adminStep && d.kind.startsWith('tournament-signup-')) validateSignupMode(this.event(d.data.tournament, i.guildId), d.data.mode);
      await i.showModal(tournamentModal(d, action)); return true;
    }
    d.busy = true;
    try {
      if (action?.startsWith('save-') && i.isModalSubmit()) {
        const step = action.slice(5), value = key => i.fields.getTextInputValue(key), selected = key => i.fields.getStringSelectValues(key);
        if (['tournament-create', 'tournament-edit'].includes(d.kind)) {
          if (step === 'basics') {
            const sameDate = d.kind === 'tournament-edit' && value('date') === mexicoFields(d.data.startsAt).date && value('time') === mexicoFields(d.data.startsAt).time;
            d.data = { ...d.data, ...validateBasics({ name: value('name'), date: value('date'), time: value('time'), capacity: value('capacity'), access: selected('access')[0] }, sameDate ? d.data.startsAt - 1 : Date.now()) };
          }
          else if (step === 'rules') {
            const registrationMode = validateRegistrationMode(selected('registrationMode')[0] ?? d.data.registrationMode);
            const rules = validateRules({ minRS: value('minRS'), maxRS: value('maxRS'), allowedClasses: selected('allowedClasses'), bannedClasses: selected('bannedClasses') });
            d.data = { ...d.data, registrationMode, rules, rulesDone: true, skillsDone: false };
          } else if (step === 'skills' && d.data.rulesDone) {
            d.data.rules = validateRules({ ...d.data.rules, allowedSkills: selected('allowedSkills'), bannedSkills: selected('bannedSkills') }); d.data.skillsDone = true;
          } else throw new UserError('Completa el asistente en orden.');
        } else if (d.kind === 'tournament-rename') {
          if (step !== 'rename') throw new UserError('Formulario de nombre inválido.');
          await this.bot.ackCard(i);
          await this.bot.queue(`tournament:${d.data.tournament}`, async () => {
            this.store.renameTeam(d.data.tournament, i.user.id, { team: d.data.team, value: value('teamName') });
            this.drafts.remove(d.id);
            await this.sync(i.guild, d.data.tournament).catch(e => this.bot.log(e, 'Actualizar tarjeta del equipo; se reintentará'));
          });
          await this.bot.sendPrivate(i, 'Nombre del equipo actualizado.'); return true;
        } else {
          const t = this.event(d.data.tournament, i.guildId);
          if (t.status !== 'open') throw new UserError('Este torneo ya cerró.');
          validateSignupMode(t, d.data.mode);
          await this.bot.ackCard(i);
          if (step === 'solo-id' && d.data.mode === 'solo') {
            d.data.people = [await this.participant(i.guild, i.user.id, value('embarkId'))];
          } else if (step === 'identity' && d.data.mode === 'team') {
            const teammates = i.fields.getSelectedUsers('teammates', true);
            const ids = [...teammates.keys()];
            if (ids.length !== 2 || ids.includes(i.user.id)) throw new UserError('Selecciona dos compañeros distintos de ti.');
            d.data.teamName = shortName(value('teamName'), 'Equipo');
            d.data.people = await Promise.all([i.user.id, ...ids].map(user => this.participant(i.guild, user)));
          } else if (step === 'missing' && d.data.mode === 'team') {
            const missing = d.data.people.find(p => !p.embarkId);
            if (!missing) throw new UserError('Todos los jugadores ya tienen Embark ID.');
            d.data.people[d.data.people.indexOf(missing)] = await this.participant(i.guild, missing.user, value('embarkId'));
          } else throw new UserError('Formulario de inscripción inválido.');
          if (d.data.people.every(p => p.embarkId)) {
            d.revision++;
            await this.finishRegistration(i, d); return true;
          }
        }
        d.revision++;
        await this.bot.ackCard(i);
        let payload = draftPanel(d);
        if (['tournament-create', 'tournament-edit'].includes(d.kind) && d.data.skillsDone) {
          // Native embed preview includes exactly the graphic that will be posted publicly.
          const previewData = { ...d.data, id: 'vista-previa', status: 'open' };
          const preview = await this.graphic(tournamentPayload(previewData), 'tournament-poster', previewData, { posterOnly: true });
          await i.followUp({ ...preview, flags: privateFlags });
        }
        await this.bot.replyCard(i, payload); return true;
      }
      if (action === 'publish' && ['tournament-create', 'tournament-edit'].includes(d.kind)) {
        if (!d.data.skillsDone) throw new UserError('Completa todas las reglas antes de publicar.');
        const basics = validateBasics(d.data, d.kind === 'tournament-edit' && d.data.startsAt <= Date.now() ? d.data.startsAt - 1 : Date.now());
        validateRules(d.data.rules);
        const registrationMode = validateRegistrationMode(d.data.registrationMode);
        await this.bot.ackCard(i);
        if (d.kind === 'tournament-edit') {
          const updated = await this.bot.queue(`tournament:${d.data.tournament}`, async () => {
            const { name, startsAt, capacity, access } = basics;
            const { rules } = d.data;
            const saved = this.store.updateDetails(d.data.tournament, d.data.baseRevision, { name, startsAt, capacity, access, rules, registrationMode });
            await this.sync(i.guild, saved.id).catch(e => this.bot.log(e, 'Actualizar torneo editado; se reintentará'));
            return saved;
          });
          this.drafts.remove(d.id);
          await this.bot.sendPrivate(i, `Cambios guardados en **${safe(updated.name)}**. Los carteles y tarjetas se están actualizando.`); return true;
        }
        const t = this.store.save({ ...d.data, registrationMode, id: tournamentId(), guild: i.guildId, creator: i.user.id, status: 'publishing', created: Date.now(), dirty: true });
        this.drafts.remove(d.id);
        try { await this.bot.queue(`tournament:${t.id}`, () => this.sync(i.guild, t.id)); }
        catch (e) { this.bot.log(e, 'Publicar torneo pendiente'); await this.bot.sendPrivate(i, `Torneo guardado (${t.id}). Faltó completar la publicación; se reintentará automáticamente. Usa /torneos revisar para recuperarlo.`); return true; }
        const published = this.store.get(t.id);
        await this.bot.sendPrivate(i, `Torneo publicado en <#${published.announcementChannel}>. Inscripciones en <#${published.registrationChannel}>.${t.access === 'clan' ? ' Recuerda asignar manualmente el rol VXTG a todos los miembros del clan.' : ''}`); return true;
      }
      if (action === 'register' && d.kind.startsWith('tournament-signup-')) {
        if (!d.data.people?.length || d.data.people.some(p => !p.embarkId)) throw new UserError('Asocia los Embark ID pendientes.');
        await this.finishRegistration(i, d); return true;
      }
      throw new UserError('Control de torneo inválido.');
    } finally { d.busy = false; }
  }
  receipt(id, message) {
    return card('✅ Inscripción confirmada', message, [row(button(`tour:withdraw:${id}`, 'Cancelar registro', ButtonStyle.Danger))]);
  }
  async participant(guild, user, suppliedId = null) {
    const member = await fetchOrNull(() => guild.members.fetch({ user, force: true }));
    if (!member || member.user?.bot) throw new UserError('Selecciona miembros humanos que sigan en este servidor.');
    const profile = this.bot.store.profile(guild.id, user);
    const embarkId = profile?.embarkId ? tournamentEmbarkId(profile.embarkId) : suppliedId ? tournamentEmbarkId(suppliedId) : null;
    if (embarkId) {
      const matches = this.bot.store.profiles(guild.id).filter(p => embarkKey(p.embarkId) === embarkKey(embarkId));
      if (matches.some(p => p.user !== user) || matches.length > 1) throw new UserError(`${embarkId} ya pertenece al perfil de otro miembro.`);
    }
    return { user, embarkId, score: profile?.score ?? null, playerClass: profile?.playerClass ?? null,
      specializationIds: profile?.specializationIds ?? [], profileMatched: Boolean(profile?.embarkId),
      approximate: false, displayName: member.displayName ?? member.user?.username ?? 'jugador' };
  }
  async finishRegistration(i, d) {
    await this.bot.ackCard(i);
    await this.bot.queue(`tournament:${d.data.tournament}`, async () => {
      const t = this.event(d.data.tournament, i.guildId);
      validateSignupMode(t, d.data.mode);
      const people = await this.verifyPlayers(i.guild, t, d.data.people, d.data.mode === 'solo' ? i.user.id : null);
      this.store.register(t.id, people, d.data.teamName, Date.now(), d.data.mode === 'team' ? i.user.id : null);
      this.drafts.remove(d.id);
      await this.sync(i.guild, t.id).catch(e => this.bot.log(e, 'Actualizar torneo; se reintentará'));
    });
    await this.bot.replyCard(i, this.receipt(d.data.tournament,
      d.data.mode === 'solo' ? 'Ya estás registrado individualmente. Te avisaremos cuando se forme tu equipo.'
        : `El equipo **${safe(d.data.teamName)}** quedó inscrito. Tú eres el líder y podrás cambiar su nombre.`));
  }
  async verifyPlayers(guild, t, people, soloUser = null) {
    const checked = [], roleId = this.bot.store.settings(guild.id).tournamentClanRole;
    for (const raw of people) {
      if (!raw.user || soloUser && raw.user !== soloUser) throw new UserError('Cada participante debe estar vinculado a su usuario de Discord.');
      const latest = await this.participant(guild, raw.user, raw.embarkId);
      if (latest.embarkId && raw.embarkId && embarkKey(latest.embarkId) !== embarkKey(raw.embarkId)) throw new UserError('Un jugador cambió su Embark ID. Reabre la inscripción.');
      const p = validateEntrant(latest, t), matches = this.bot.store.profiles(guild.id).filter(x => embarkKey(x.embarkId) === embarkKey(p.embarkId));
      if (matches.length > 1) throw new UserError(`${p.embarkId}: resuelve los perfiles duplicados antes de inscribirte.`);
      const profile = matches[0];
      if (profile && profile.user !== raw.user) throw new UserError('El Embark ID pertenece al perfil de otra persona.');
      p.user = raw.user; p.profileMatched = Boolean(profile); p.clanVerified = false;
      let member = p.user ? await fetchOrNull(() => guild.members.fetch({ user: p.user, force: true })) : null;
      if (p.user && !member) throw new UserError(`${p.embarkId}: el miembro vinculado ya no está en el servidor.`);
      if (t.access === 'clan') {
        if (!roleId || !member?.roles.cache.has(roleId)) throw new UserError(`${p.embarkId}: necesitas el rol VXTG asignado por un administrador.`);
        p.clanVerified = true;
      }
      checked.push(p);
    }
    return checked;
  }
  async graphic(payload, kind, data, { posterOnly = false } = {}) {
    if (!this.bot.renderer) return payload;
    try {
      const image = await this.bot.renderer.render(kind, data, kind === 'tournament-poster' ? 1100 : 720), name = `${kind}.png`;
      const description = ['tournament', 'tournament-poster'].includes(kind)
        ? `${data.name}. ${rulesText(data).replace(/\*\*/g, '')}`.slice(0, 1024)
        : 'Tarjeta del equipo. Los integrantes y sus RS también aparecen como texto en el mensaje.';
      payload.files = [{ attachment: image, name, description }];
      payload.attachments = []; payload.embeds[0].setImage(`attachment://${name}`);
      if (posterOnly) payload.embeds[0].setDescription(null);
    } catch (e) { this.bot.log(e, 'Tarjeta de torneo: usando texto accesible'); }
    return payload;
  }
  async ensureText(guild, t, field, prefix) {
    let channel = t[field] ? await fetchOrNull(() => guild.channels.fetch(t[field])) : null;
    const marker = `VEX tournament:${t.id}:${field}`;
    const slug = t.name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'torneo';
    const channelName = `${prefix}-${slug}-${t.id.slice(0, 4)}`;
    if (!channel) {
      if (t[field]) {
        if (field === 'registrationChannel') { delete t.registrationMessage; delete t.voiceMessage; }
        if (field === 'teamsChannel') for (const team of this.store.teams(t.id)) { delete team.message; delete team.voiceMessage; this.store.saveTeam(team); }
        t.dirty = true;
      }
      channel = guild.channels.cache.find(c => c.topic === marker);
      if (!channel) {
        channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: t.categoryChannel, topic: marker, permissionOverwrites: this.textPermissions(guild), reason: `Torneo ${t.id}` });
      }
      t[field] = channel.id; this.store.save(t);
    }
    if (channel.topic === marker && channel.name !== channelName) await channel.setName(channelName, `Actualizar nombre del torneo ${t.id}`);
    if (t.categoryChannel && channel.parentId !== t.categoryChannel) await channel.setParent(t.categoryChannel, { lockPermissions: false, reason: `Agrupar canales del torneo ${t.id}` });
    return channel;
  }
  async upsertMessage(channel, holder, field, key, payload, save, edit = true) {
    let message = holder[field] ? await fetchOrNull(() => channel.messages.fetch(holder[field])) : null;
    // Recover the send/persist crash window using a durable footer marker, paginating all history.
    if (!message) {
      let before;
      for (;;) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        message = batch.find(m => m.author.id === this.bot.client.user.id && m.embeds.some(e => e.footer?.text === payload.embeds[0].data.footer?.text));
        if (message || batch.size < 100) break;
        before = batch.last().id;
      }
    }
    if (message) {
      if (edit) await message.edit({ ...payload, content: payload.content ?? null, allowedMentions: noMentions });
    } else {
      const nonce = createHash('sha256').update(key).digest('hex').slice(0, 25);
      message = await channel.send({ ...payload, nonce, enforceNonce: true });
    }
    holder[field] = message.id; save(holder); return message;
  }
  async sync(guild, id, now = Date.now()) {
    let t = this.event(id, guild.id);
    // Delete overdue channels before rendering or fetching announcement messages. A failed
    // poster/announcement update must never prevent an expired tournament from being cleaned up.
    if (t.status === 'finished' && !t.channelsDeletedAt && t.deleteAt <= now) await this.cleanupChannels(guild, t, now);
    if (!t.channelsDeletedAt && (t.status === 'publishing' || tournamentPlayable(t) || t.status === 'finished')) await this.layout.ensure(guild, t);
    if (t.posterVersion !== 5) t.dirty = true;
    const settings = this.bot.store.settings(guild.id);
    if (!settings.tournamentsChannel || !settings.tournamentClanRole) await this.setup(guild);
    if (t.status === 'publishing' || tournamentPlayable(t)) {
      await guild.channels.fetch();
      await this.ensureText(guild, t, 'registrationChannel', 'inscripciones');
      await this.ensureText(guild, t, 'teamsChannel', 'equipos');
      if (t.status === 'publishing') t.status = 'open';
      this.store.save(t);
    }
    const entries = this.store.entries(id), teams = this.store.teams(id), save = value => this.store.save(value);
    for (const team of teams) if (!team.leader) {
      const members = entries.filter(p => p.team === team.id && p.user);
      const leader = team.source === 'balanced'
        ? [...members].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.created - b.created)[0]
        : members[0];
      if (leader) { team.leader = leader.user; this.store.saveTeam(team); }
    }
    if (t.dirty || !t.announcementMessage || (t.registrationChannel && !t.registrationMessage)) {
      t.announcementChannel ??= this.bot.store.settings(guild.id).tournamentsChannel;
      const announcement = await fetchOrNull(() => guild.channels.fetch(t.announcementChannel));
      if (!announcement) throw new UserError('Falta el canal de anuncios del torneo.');
      const role = this.bot.store.settings(guild.id).finalsRole;
      const announcementPayload = await this.graphic(tournamentPayload(t, entries, teams), 'tournament-poster', t, { posterOnly: true });
      if (role) {
        announcementPayload.content = `<@&${role}>`;
        announcementPayload.allowedMentions = { ...noMentions, roles: t.status === 'open' ? [role] : [] };
      }
      await this.upsertMessage(announcement, t, 'announcementMessage', `tournament:${id}`, announcementPayload, save);
      const registration = t.registrationChannel ? await fetchOrNull(() => guild.channels.fetch(t.registrationChannel)) : null;
      if (registration) {
        const registrationPanel = await this.graphic(registrationPayload(t, entries, teams), 'tournament-poster', t, { posterOnly: true });
        if (role) registrationPanel.content = `<@&${role}>`;
        await this.upsertMessage(registration, t, 'registrationMessage', `registration:${id}`, registrationPanel, save);
      }
      t.dirty = false; t.posterVersion = 5; save(t);
    }
    if (t.teamsChannel) {
      const channel = await fetchOrNull(() => guild.channels.fetch(t.teamsChannel));
      if (channel) for (const team of teams) if (!team.message || team.cardVersion !== 2 || team.cardTournamentRevision !== (t.editRevision ?? 0)) {
        const people = entries.filter(p => p.team === team.id);
        const roster = await Promise.all(people.map(async p => {
          const member = p.user ? await fetchOrNull(() => guild.members.fetch(p.user)) : null;
          return { ...p, discordName: member?.displayName ?? member?.user?.username ?? p.displayName ?? p.user ?? 'Sin vincular' };
        }));
        const payload = await this.graphic(teamPayload(t, team, roster, !team.message), 'tournament-team', { ...team, tournamentName: t.name, people: roster });
        await this.upsertMessage(channel, team, 'message', `team:${team.id}`, payload, value => this.store.saveTeam(value));
        team.cardVersion = 2; team.cardTournamentRevision = t.editRevision ?? 0; this.store.saveTeam(team);
      }
    }
    if (tournamentPlayable(t)) {
      if (t.voiceGeneralRequested) await this.createVoices(guild, id, false, false);
      if (t.voiceTeamsRequested) await this.createVoices(guild, id, true, false);
    }
  }
  async voiceChannel(guild, t, holder, name, people, general = false) {
    let channel = holder.voiceChannel ? await fetchOrNull(() => guild.channels.fetch(holder.voiceChannel)) : null;
    const save = () => holder === t ? this.store.save(t) : this.store.saveTeam(holder);
    const roomName = `${name.slice(0, 75)} · ${holder.id.slice(0, 8)}`;
    if (channel && channel.name !== roomName && channel.name.endsWith(` · ${holder.id.slice(0, 8)}`)) {
      await channel.setName(roomName, `Actualizar nombre de la sala del torneo ${t.id}`);
    }
    let voiceRole;
    if (general) {
      voiceRole = t.voiceRole ? await fetchOrNull(() => guild.roles.fetch(t.voiceRole)) : null;
      if (!voiceRole) {
        const roleName = `Torneo ${t.id}`;
        await guild.roles.fetch();
        voiceRole = guild.roles.cache.find(r => r.name === roleName) ?? await guild.roles.create({ name: roleName, permissions: [], mentionable: false, reason: 'Acceso a voz general del torneo' });
        t.voiceRole = voiceRole.id; this.store.save(t);
        if (channel) await channel.permissionOverwrites.edit(voiceRole.id, { ViewChannel: true, Connect: true, Speak: true });
      }
      if (voiceRole.managed || voiceRole.permissions.bitfield !== 0n) throw new UserError('El rol de voz del torneo debe existir y no tener permisos globales. Corrígelo antes de asignarlo.');
    }
    if (!channel) {
      // The stable suffix also recovers channels after a process interruption before SQLite save.
      await guild.channels.fetch();
      channel = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name === roomName);
      const permissions = [{ id: guild.id, type: 0, deny: [P.ViewChannel, P.Connect] }, { id: this.bot.client.user.id, type: 1, allow: [P.ViewChannel, P.Connect, P.Speak, P.MoveMembers, P.ManageChannels] }];
      if (general) {
        // Participant role avoids Discord's per-channel overwrite limit on large open tournaments.
        permissions.push({ id: voiceRole.id, type: 0, allow: [P.ViewChannel, P.Connect, P.Speak] });
      } else for (const user of new Set(people.map(p => p.user).filter(Boolean))) permissions.push({ id: user, type: 1, allow: [P.ViewChannel, P.Connect, P.Speak] });
      if (!channel) channel = await guild.channels.create({ name: roomName, type: ChannelType.GuildVoice, parent: await this.layout.voiceParent(guild, t), userLimit: general ? 0 : 3, permissionOverwrites: permissions, reason: `Voz de torneo ${t.id}` });
      holder.voiceChannel = channel.id; save();
    }
    if (t.categoryChannel && !(t.categoryChannels ?? [t.categoryChannel]).includes(channel.parentId)) await channel.setParent(await this.layout.voiceParent(guild, t), { lockPermissions: false, reason: `Agrupar voz del torneo ${t.id}` });
    if (general && t.voiceRole) for (const p of people.filter(p => p.user)) {
      const member = await fetchOrNull(() => guild.members.fetch(p.user));
      if (member && !member.roles.cache.has(t.voiceRole)) await member.roles.add(t.voiceRole, 'Participante inscrito en torneo');
    }
    return channel;
  }
  async createVoices(guild, id, byTeam, move = true) {
    const t = this.event(id, guild.id), entries = this.store.entries(id), teams = this.store.teams(id);
    if (!tournamentPlayable(t)) throw new UserError('El torneo terminó o todavía no fue publicado.');
    if (byTeam && !teams.length) throw new UserError('Todavía no hay equipos formados.');
    await this.layout.ensure(guild, t);
    t[byTeam ? 'voiceTeamsRequested' : 'voiceGeneralRequested'] = true;
    this.store.save(t);
    const targets = byTeam ? teams : [t]; let moved = 0, disconnected = 0, unlinked = 0, failed = 0;
    for (const holder of targets) {
      const people = byTeam ? entries.filter(p => p.team === holder.id) : entries;
      const previousChannel = holder.voiceChannel;
      const channel = await this.voiceChannel(guild, t, holder, byTeam ? holder.name : `General · ${t.name}`, people, !byTeam);
      const me = await guild.members.fetchMe();
      for (const p of move ? people : []) {
        if (!p.user) { unlinked++; continue; }
        const member = await fetchOrNull(() => guild.members.fetch({ user: p.user, force: true }));
        if (!member?.voice.channelId) { disconnected++; continue; }
        if (member.voice.channelId === channel.id) continue;
        if (!channel.permissionsFor(me)?.has([P.Connect, P.MoveMembers])) { failed++; continue; }
        try { await member.voice.setChannel(channel, 'Distribución de participantes del torneo'); moved++; } catch { failed++; }
      }
      if (!move && holder.voiceMessage && previousChannel === channel.id) continue;
      const text = await guild.channels.fetch(byTeam ? t.teamsChannel : t.registrationChannel);
      const payload = { embeds: [tournamentPayload(t).embeds[0].setTitle(`🔊 ${byTeam ? holder.name : 'Voz general'}`).setDescription(`Sala del torneo: <#${channel.id}>\nSi estás desconectado, entra usando el botón. Los jugadores sin perfil vinculado necesitan acceso manual de un administrador.`).setFields([]).setFooter({ text: `VEX LATAM · Voz ${holder.id}` })], components: [voiceLink(guild.id, channel.id)], allowedMentions: noMentions };
      await this.upsertMessage(text, holder, 'voiceMessage', `voice:${holder.id}`, payload, x => byTeam ? this.store.saveTeam(x) : this.store.save(x));
    }
    return `${targets.length} salas listas. Traslados: ${moved}. Desconectados: ${disconnected}. Sin perfil vinculado: ${unlinked}. Traslados no disponibles: ${failed}. Los enlaces están en los canales del torneo.`;
  }
  async cleanupChannels(guild, t, now = Date.now()) {
    if (t.status !== 'finished' || !Number.isFinite(t.deleteAt) || now < t.deleteAt || t.channelsDeletedAt) return;
    // Each successful deletion is persisted separately. Interrupted or failed cleanup
    // resumes on the next tick, including channels deleted manually in the meantime.
    await guild.channels.fetch();
    for (const holder of [t, ...this.store.teams(t.id)]) {
      const name = `${(holder === t ? `General · ${t.name}` : holder.name).slice(0, 75)} · ${holder.id.slice(0, 8)}`;
      const candidates = new Map(guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice && c.name === name).map(c => [c.id, c]));
      if (holder.voiceChannel) {
        const channel = await fetchOrNull(() => guild.channels.fetch(holder.voiceChannel));
        if (channel) candidates.set(channel.id, channel);
      }
      for (const channel of candidates.values()) {
        if (channel.type !== ChannelType.GuildVoice) throw new UserError('La referencia de voz apunta a un canal de otro tipo; revisa el torneo antes de limpiarlo.');
        await channel.delete('Torneo terminado: vencieron los 7 días de conservación');
      }
      delete holder.voiceChannel; delete holder.voiceMessage;
      if (holder === t) this.store.save(t); else this.store.saveTeam(holder);
    }
    await guild.roles.fetch();
    const roleName = `Torneo ${t.id}`;
    const role = t.voiceRole ? await fetchOrNull(() => guild.roles.fetch(t.voiceRole)) : guild.roles.cache.find(r => r.name === roleName);
    if (role) {
      if (role.managed || role.name !== roleName || role.permissions.bitfield !== 0n) throw new UserError('El rol temporal del torneo fue modificado; revísalo antes de limpiarlo.');
      await role.delete('Torneo terminado: vencieron los 7 días de conservación');
    }
    delete t.voiceRole; this.store.save(t);
    const settings = this.bot.store.settings(guild.id);
    const shared = new Set([settings.tournamentsChannel, settings.teamsChannel, t.announcementChannel].filter(Boolean));
    for (const field of ['registrationChannel', 'teamsChannel']) {
      const marker = `VEX tournament:${t.id}:${field}`;
      const candidates = new Map(guild.channels.cache.filter(c => c.topic === marker).map(c => [c.id, c]));
      if (t[field]) {
        const channel = await fetchOrNull(() => guild.channels.fetch(t[field]));
        if (channel) candidates.set(channel.id, channel);
      }
      for (const channel of candidates.values()) {
        if (channel.type !== ChannelType.GuildText || shared.has(channel.id)) throw new UserError('La referencia de texto apunta a un canal compartido o de otro tipo; revisa el torneo antes de limpiarlo.');
        await channel.delete('Torneo terminado: vencieron los 7 días de conservación');
      }
      delete t[field];
      if (field === 'registrationChannel') delete t.registrationMessage;
      else for (const team of this.store.teams(t.id)) { delete team.message; this.store.saveTeam(team); }
      this.store.save(t);
    }
    await this.layout.removeEmpty(guild, t);
    t.channelsDeletedAt = now; t.dirty = true; this.store.save(t);
  }
  async tick(guild) {
    this.drafts.expire();
    if (this.bot.client.isReady && !this.bot.client.isReady()) return;
    const settings = this.bot.store.settings(guild.id);
    if (!settings.tournamentsChannel || !guild.channels.cache.has(settings.tournamentsChannel) || !guild.roles.cache.has(settings.tournamentClanRole)) await this.setup(guild);
    for (const t of this.store.list(guild.id)) await this.bot.queue(`tournament:${t.id}`, () => this.sync(guild, t.id)).catch(e => this.bot.log(e, `Recuperar torneo ${t.id}`));
  }
}
