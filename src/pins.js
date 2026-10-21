// Missing PinMessages must not prevent delivery or cause duplicate announcements.
export async function pinIfAllowed(message, reason) {
  if (message.pinned) return true;
  try { await message.pin(reason); return true; }
  catch (error) { if ([50013,50001].includes(error.code)) return false; throw error; }
}
