export type CrewMascotId = 'stretch' | 'blades' | 'navigator' | 'cook' | 'chirp'

export type CrewMascot = {
  id: CrewMascotId
  name: string
  vibe: string
  src: string
}

/** Project AP-I pirate crew used by the demo voyage tutorial. */
export const CREW_MASCOTS: Record<CrewMascotId, CrewMascot> = {
  stretch: {
    id: 'stretch',
    name: 'Stretch',
    vibe: 'Lookout mate',
    src: '/pirate/crew-stretch.svg?v=4',
  },
  blades: {
    id: 'blades',
    name: 'Blades',
    vibe: 'Deck fighter',
    src: '/pirate/crew-blades.svg?v=4',
  },
  navigator: {
    id: 'navigator',
    name: 'Navi',
    vibe: 'Chart reader',
    src: '/pirate/crew-navigator.svg?v=4',
  },
  cook: {
    id: 'cook',
    name: 'Cookie',
    vibe: 'Galley quartermaster',
    src: '/pirate/crew-cook.svg?v=4',
  },
  chirp: {
    id: 'chirp',
    name: 'Chirp',
    vibe: "Ship's doctor bird",
    src: '/pirate/crew-bird.svg?v=4',
  },
}
