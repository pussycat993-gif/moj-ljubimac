/** Kratki jedinstveni ID — dovoljno za lokalnu bazu; pri prelasku na backend zameniti UUID-om. */
export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
