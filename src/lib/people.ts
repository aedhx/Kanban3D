/**
 * Les deux personnes qui utilisent le tableau.
 *
 * Ce n'est pas un système de comptes : juste une étiquette choisie une fois par
 * appareil et conservée dans le navigateur, pour savoir qui a demandé quoi.
 * Pour changer les prénoms, il suffit de modifier cette liste.
 */
export const PEOPLE = ['Aedh', 'Alexandre'] as const

export type Person = (typeof PEOPLE)[number]

export const IDENTITY_STORAGE_KEY = 'kanban3d.identity'
