import { Drafts } from './drafts.js';
import { ALL_CLASSES, classes, classChoices, pruneSkills, selectedClasses, classLabel } from './catalog.js';
import { UserError, score, rankFromRS, validateIdentity, validateProfile, validateSearch } from './domain.js';
import { card, profileModal, withImage } from './ui.js';
import { draftId, profileDraftPayload, profilePrivatePayload, searchDraftPayload, skillsModal,
  rangeModal, descriptionModal, teamPrivatePayload, teamSelector, playerCardModal } from './wizard-ui.js';
import { processRoleJobs } from './setup.js';
import { getSponsor } from './sponsors.js';

export class Workflows {
  constructor(bot) { this.bot = bot; this.drafts = new Drafts(); }
  startProfile(i) {
    const p = this.bot.store.profile(i.guildId, i.user.id);
    const data = { ...(p ?? {}), playerClass: p?.playerClass ?? 'Ligero', specializationIds: p?.specializationIds ?? [] };
    const d = this.drafts.create('profile', i.guildId, i.user.id, data);
    d.base = p;
    return i.showModal(profileModal(data, draftId(d, 'identity-submit')));
  }
  async profile(i, notice = '') {
    const p = this.bot.requireProfile(i);
    await this.bot.ackCard(i);
    return this.bot.replyCard(i, await withImage(profilePrivatePayload(p, notice), this.bot.renderer, 'profile', await this.bot.visualProfile(p)));
  }
  async startSearch(i) {
    const existing = this.bot.store.activeSearch(i.guildId, i.user.id);
    if (existing) {
      if (existing.status === 'pending') throw new UserError('Tu búsqueda se está publicando. Espera un momento; solo puedes tener una activa.');
      return this.bot.replyCard(i, teamPrivatePayload(existing, i.user.id,
        'Ya tienes una búsqueda activa. Ciérrala o espera a que caduque antes de abrir otra, normal o HOT.'));
    }
    const p = this.bot.requireProfile(i);
    if (!p.searchable || p.needsCompletion || !Number.isInteger(p.score)) throw new UserError('Completa y activa tu perfil antes de buscar compañeros.');
    const d = this.drafts.create('search', i.guildId, i.user.id, { mode: 'Ranked', playerClass: ALL_CLASSES, playerClasses: [...classes],
      specializationIds: [], teammates: 2, minScore: Math.max(0, p.score - 5000), maxScore: Math.min(999999, p.score + 5000), description: '' });
    return this.display(i, d);
  }
  async display(i, d, update = false) {
    await this.bot.ackCard(i, update);
    return this.bot.queue(`draft-view:${d.id}`, async () => {
      let payload = d.kind === 'profile' ? profileDraftPayload(d) : searchDraftPayload(d);
      if (d.kind === 'profile' && d.step === 'review') {
        const p = { ...d.data, rank: rankFromRS(d.data.score, d.data.leaderboardPosition) };
        payload = await withImage(payload, this.bot.renderer, 'profile', await this.bot.visualProfile(p));
      } else payload.attachments = [];
      return this.bot.replyCard(i, payload);
    });
  }
  async myTeams(i) {
    const teams = this.bot.store.searches(i.guildId).filter(s => s.status === 'open' && s.expires > Date.now() && s.members.includes(i.user.id));
    for (const room of this.bot.store.voiceRooms(i.guildId)) {
      const s = this.bot.store.search(room.searchId);
      if (s?.members.includes(i.user.id) && !teams.some(t => t.id === s.id)) teams.push(s);
    }
    return this.bot.replyCard(i, teams.length === 1 ? teamPrivatePayload(teams[0], i.user.id) : teams.length ? teamSelector(teams)
      : card('Mis equipos', 'No participas en equipos abiertos. Crea una búsqueda o pulsa Unirme en #equipos.'));
  }
  async handle(i) {
    const id = i.customId;
    if (id === 'profile:edit') { await this.startProfile(i); return true; }
    if (id === 'profile:view') { await this.profile(i); return true; }
    if (id === 'profile:image') {
      const p = this.bot.requireProfile(i), d = this.drafts.create('photo', i.guildId, i.user.id, { ...p }); d.base = p;
      await i.showModal(playerCardModal(d)); return true;
    }
    if (id === 'profile:image-remove') {
      const before = this.bot.requireProfile(i);
      await this.bot.ackCard(i);
      if (this.bot.requireProfile(i).updatedAt !== before.updatedAt) throw new UserError('Tu perfil cambió. Vuelve a abrir Mi perfil.');
      this.bot.store.saveProfile(i.guildId, i.user.id, { cardImage: null });
      await this.bot.refreshMemberTeams(i.guildId, i.user.id);
      await this.profile(i, 'Tarjeta retirada. En tus equipos aparecerá tu Embark ID.'); return true;
    }
    if (id === 'search:create') { await this.startSearch(i); return true; }
    if (id === 'search:mine') { await this.myTeams(i); return true; }
    if (id === 'teams:select') {
      const s = this.bot.store.search(i.values[0]);
      if (!s || s.guild !== i.guildId || !s.members.includes(i.user.id)) throw new UserError('Ya no perteneces a este equipo.');
      await this.bot.replyCard(i, teamPrivatePayload(s, i.user.id)); return true;
    }
    if (!id?.startsWith('draft:')) return false;
    const [, draft, revision, action, value] = id.split(':');
    const d = this.drafts.get(draft, i.guildId, i.user.id);
    if (d.revision !== Number(revision)) throw new UserError('Este control pertenece a una versión anterior. Usa el asistente más reciente.');
    if (d.submitting) throw new UserError('Estamos guardando este borrador. Espera un momento.');
    const modal = i.isModalSubmit?.() === true;
    if (action === 'photo-submit' && d.kind === 'photo' && modal) {
      const files = i.fields.getUploadedFiles('cardImage');
      if (files?.size > 1) throw new UserError('Adjunta una sola tarjeta del juego.');
      if (!files?.size) {
        this.drafts.remove(d.id);
        const current = this.bot.requireProfile(i);
        await this.profile(i, current.cardImage ? 'Sin cambios. Conservamos tu tarjeta actual.' : 'Continuaste sin foto. En tus equipos aparecerá tu Embark ID.');
        return true;
      }
      d.submitting = true;
      await this.bot.ackCard(i);
      try {
        const image = await this.bot.playerCards.upload(files.first());
        this.drafts.get(d.id, i.guildId, i.user.id);
        const current = this.bot.requireProfile(i);
        if (current.updatedAt !== d.base.updatedAt) throw new UserError('Tu perfil cambió durante la subida. Vuelve a abrir Subir tarjeta.');
        this.bot.store.saveProfile(i.guildId, i.user.id, { cardImage: image });
        this.drafts.remove(d.id);
        await this.bot.refreshMemberTeams(i.guildId, i.user.id);
        await this.profile(i, 'Tarjeta guardada. Tus equipos abiertos se han actualizado.');
      } finally { d.submitting = false; }
      return true;
    }
    if (action === 'identity' && d.kind === 'profile' && !modal) {
      await i.showModal(profileModal(d.data, draftId(d, 'identity-submit'))); return true;
    }
    if (action === 'skills' && !modal) { await i.showModal(skillsModal(d)); return true; }
    if (action === 'range' && d.kind === 'search' && d.data.mode === 'Ranked' && !modal) { await i.showModal(rangeModal(d)); return true; }
    if (action === 'description' && d.kind === 'search' && !modal) { await i.showModal(descriptionModal(d)); return true; }
    if (action === 'cancel' && !modal) {
      this.drafts.remove(d.id); await this.bot.ackCard(i, true); await this.bot.replyCard(i, card('Borrador cancelado', 'Puedes abrir otro asistente desde el panel.')); return true;
    }
    if (action === 'identity-submit' && d.kind === 'profile' && modal) {
      const input = validateIdentity({ embarkId: i.fields.getTextInputValue('embarkId'), score: i.fields.getTextInputValue('score') });
      const selectedSponsors = i.fields.getStringSelectValues('sponsor');
      if (selectedSponsors.length !== 1 || !getSponsor(selectedSponsors[0])) throw new UserError('Selecciona un patrocinador válido.');
      input.sponsorId = selectedSponsors[0];
      const files = i.fields.getUploadedFiles?.('cardImage');
      if (files?.size > 1) throw new UserError('Adjunta una sola tarjeta del juego.');
      let cardImage = d.data.cardImage ?? null;
      if (files?.size) {
        d.submitting = true;
        await this.bot.ackCard(i);
        try {
          cardImage = await this.bot.playerCards.upload(files.first());
          this.drafts.get(d.id, i.guildId, i.user.id);
        } finally { d.submitting = false; }
      }
      const same = d.base?.embarkId === input.embarkId && d.base?.score === input.score;
      d.data = { ...d.data, ...input, cardImage, leaderboardPosition: same ? d.base.leaderboardPosition : null,
        rankSource: same ? d.base.rankSource : 'manual', season: same ? d.base.season : null };
      d.data.rank = rankFromRS(input.score, d.data.leaderboardPosition); d.step = 'class';
    } else if (action === 'class' && i.isStringSelectMenu?.()) {
      const old = d.data.specializationIds;
      if (d.kind === 'search') {
        if (!i.values?.length || i.values.length > 3 || i.values.some(c => !classes.includes(c))) throw new UserError('Marca al menos una clase válida.');
        d.data.playerClasses = selectedClasses(i.values);
        d.data.playerClass = classLabel(d.data);
        d.data.specializationIds = pruneSkills(old, d.data);
      } else {
        const next = i.values[0];
        if (!classChoices.includes(next) || i.values.length !== 1) throw new UserError('Clase no válida.');
        d.data.playerClass = next; d.data.specializationIds = pruneSkills(old, next);
      }
      d.notice = old.length !== d.data.specializationIds.length ? 'Se retiraron las especializaciones incompatibles con la nueva clase.' : '';
      if (d.kind === 'profile') d.step = 'class';
    } else if (action === 'skills-submit' && modal) {
      const groups = selectedClasses(d.kind === 'search' ? d.data : d.data.playerClass);
      const ids = groups.flatMap(c => i.fields.getCheckboxGroup(`skills-${c}`));
      const candidate = { ...d.data, specializationIds: ids };
      if (d.kind === 'profile') validateProfile(candidate); else validateSearch(candidate);
      d.data.specializationIds = ids; d.notice = '';
      if (d.kind === 'profile') { d.data.needsCompletion = false; d.step = 'review'; }
    } else if (action === 'back' && d.kind === 'profile' && !modal) {
      d.step = 'class';
    } else if (action === 'image-remove' && d.kind === 'profile' && !modal) {
      d.data.cardImage = null;
    } else if (action === 'mode' && d.kind === 'search' && !modal) {
      if (!['Ranked', 'Chill'].includes(value)) throw new UserError('Modo no válido.');
      d.data.mode = value;
    } else if (action === 'count' && d.kind === 'search' && !modal) {
      const n = Number(value); if (![1, 2, 3, 4].includes(n)) throw new UserError('Busca entre 1 y 4 compañeros.'); d.data.teammates = n;
    } else if (['min', 'max'].includes(action) && d.kind === 'search' && d.data.mode === 'Ranked' && !modal) {
      const delta = Number(value); if (![-2500, 2500].includes(delta)) throw new UserError('Ajuste RS no válido.');
      const field = action === 'min' ? 'minScore' : 'maxScore';
      const proposed = Math.max(0, Math.min(999999, d.data[field] + delta));
      d.data[field] = action === 'min' ? Math.min(proposed, d.data.maxScore) : Math.max(proposed, d.data.minScore);
    } else if (action === 'range-submit' && d.kind === 'search' && d.data.mode === 'Ranked' && modal) {
      const candidate = { ...d.data, minScore: score(i.fields.getTextInputValue('minScore')), maxScore: score(i.fields.getTextInputValue('maxScore')) };
      validateSearch(candidate); d.data = candidate;
    } else if (action === 'description-submit' && d.kind === 'search' && modal) {
      const candidate = { ...d.data, description: i.fields.getTextInputValue('description') };
      validateSearch(candidate); d.data = candidate;
    } else if (action === 'save' && d.kind === 'profile' && d.step === 'review' && !modal) {
      const profile = validateProfile(d.data), current = this.bot.store.profile(i.guildId, i.user.id);
      if (current?.updatedAt !== d.base?.updatedAt) throw new UserError('Tu perfil cambió durante el registro. Abre Editar perfil de nuevo.');
      d.submitting = true;
      await this.bot.ackCard(i, true);
      try {
        if (this.bot.store.profile(i.guildId, i.user.id)?.updatedAt !== current?.updatedAt) throw new UserError('Tu perfil cambió mientras guardábamos. Abre Editar perfil de nuevo.');
        const same = current?.embarkId === profile.embarkId && current?.score === profile.score;
        const position = same ? current.leaderboardPosition : null;
        const p = this.bot.store.saveProfile(i.guildId, i.user.id, { ...profile, rank: rankFromRS(profile.score, position),
          leaderboardPosition: position, rankSource: same ? current.rankSource : 'manual',
          season: same ? current.season : null, rankUpdatedAt: same ? current.rankUpdatedAt : Date.now(), legacySpecialization: current?.legacySpecialization ?? '',
          cardImage: d.data.cardImage ?? null });
        this.bot.store.queueRole(i.guildId, i.user.id);
        this.drafts.remove(d.id);
        await processRoleJobs(this.bot, i.guild);
        const pending = this.bot.store.roleJobs(i.guildId, Number.MAX_SAFE_INTEGER).some(j => j.user === i.user.id);
        await this.bot.refreshMemberTeams(i.guildId, i.user.id);
        await this.bot.replyCard(i, await withImage(profilePrivatePayload(p, `Perfil guardado.${pending ? ' Tus roles están pendientes; se reintentará automáticamente.' : ' Tus roles de perfil y patrocinador están listos.'}`), this.bot.renderer, 'profile', await this.bot.visualProfile(p)));
      } finally { d.submitting = false; }
      return true;
    } else if (action === 'publish' && d.kind === 'search' && !modal) {
      const filters = validateSearch(d.data); d.submitting = true;
      await this.bot.ackCard(i, true);
      try { await this.bot.publishSearch(i, filters); this.drafts.remove(d.id); } finally { d.submitting = false; }
      return true;
    } else throw new UserError('Este control ya no es válido. Abre un nuevo asistente.');
    d.revision++;
    await this.display(i, d, !modal);
    return true;
  }
}
