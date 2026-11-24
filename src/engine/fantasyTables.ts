import { CharacterTrait, Character, CourtRole, AIArchetype, Culture, Religion, Realm, TitleTier, WorldState } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import { CulturalLinguisticFamily, resolveLinguisticFamily } from './namingEngine';

/**
 * RealmSmith Character Trait System
 * Contains 119 authentic feudal traits spanning:
 * 1. Personality Traits (35 core traits in opposing pairs)
 * 2. Education Traits (Tiers 1-4 for Diplomacy, Martial, Stewardship, Intrigue, Learning)
 * 3. Congenital & Genetic Traits
 * 4. Health, Trauma & Condition Traits
 * 5. Commander Warfare Traits
 * 6. Lifestyle, Fame & Infamy Traits
 * 7. Court & Dynastic Status Traits
 */
export const CHARACTER_TRAITS: CharacterTrait[] = [
  // ==========================================
  // 1. PERSONALITY TRAITS (35 Core Traits)
  // ==========================================
  {
    id: 'brave',
    name: 'Brave',
    description: 'Leads from the vanguard. Never retreats from battle or a deadly duel of champions.',
    category: 'personality',
    oppositeId: 'craven',
    diplomacyMod: 1,
    martialMod: 3,
    stewardshipMod: 0,
    intrigueMod: -1,
    learningMod: 0,
    prowessMod: 3,
    aiHonor: 20,
    aiVengefulness: 10,
  },
  {
    id: 'craven',
    name: 'Craven',
    description: 'Curls in terror at the clang of steel. Prefers humiliating concessions over peril.',
    category: 'personality',
    oppositeId: 'brave',
    diplomacyMod: -1,
    martialMod: -3,
    stewardshipMod: 1,
    intrigueMod: 2,
    learningMod: 0,
    prowessMod: -3,
    aiHonor: -20,
    aiRationality: 15,
  },
  {
    id: 'ambitious',
    name: 'Ambitious',
    description: 'Never content with current standing; constantly plots for higher crowns and domains.',
    category: 'personality',
    oppositeId: 'content',
    diplomacyMod: 1,
    martialMod: 1,
    stewardshipMod: 1,
    intrigueMod: 2,
    learningMod: 1,
    prowessMod: 1,
    aiGreed: 40,
    aiHonor: -10,
  },
  {
    id: 'content',
    name: 'Content',
    description: 'Satisfied with their allotted feudal station; harbors no desire to usurp titles.',
    category: 'personality',
    oppositeId: 'ambitious',
    diplomacyMod: 2,
    martialMod: -1,
    stewardshipMod: 1,
    intrigueMod: -2,
    learningMod: 1,
    aiGreed: -40,
    aiHonor: 20,
  },
  {
    id: 'deceitful',
    name: 'Deceitful',
    description: 'A master of whispers and false smiles. Loyalty is merely a negotiable transaction.',
    category: 'personality',
    oppositeId: 'honest',
    diplomacyMod: -2,
    martialMod: 0,
    stewardshipMod: 0,
    intrigueMod: 4,
    learningMod: 0,
    aiHonor: -50,
    aiVengefulness: 15,
  },
  {
    id: 'honest',
    name: 'Honest',
    description: 'Cannot bear to speak falsehood. Words are bound by sacred oath and feudal honor.',
    category: 'personality',
    oppositeId: 'deceitful',
    diplomacyMod: 3,
    martialMod: 0,
    stewardshipMod: 0,
    intrigueMod: -4,
    learningMod: 0,
    aiHonor: 50,
  },
  {
    id: 'wrathful',
    name: 'Wrathful',
    description: 'Quick to summon the executioner; insults are answered with blood, iron, and fire.',
    category: 'personality',
    oppositeId: 'calm',
    diplomacyMod: -2,
    martialMod: 3,
    stewardshipMod: -1,
    intrigueMod: 1,
    learningMod: -1,
    prowessMod: 2,
    dreadMod: 15,
    aiVengefulness: 50,
    aiRationality: -30,
  },
  {
    id: 'calm',
    name: 'Calm',
    description: 'Never raises voice in anger. Weighs state decisions with serene, stoic detachment.',
    category: 'personality',
    oppositeId: 'wrathful',
    diplomacyMod: 2,
    martialMod: 0,
    stewardshipMod: 1,
    intrigueMod: 1,
    learningMod: 1,
    aiVengefulness: -40,
    aiRationality: 40,
  },
  {
    id: 'compassionate',
    name: 'Compassionate',
    description: 'Ached by the suffering of peasants and hostages. Reluctant to sign death warrants.',
    category: 'personality',
    oppositeId: 'callous',
    diplomacyMod: 3,
    martialMod: -1,
    stewardshipMod: 0,
    intrigueMod: -3,
    learningMod: 1,
    dreadMod: -15,
    aiHonor: 35,
  },
  {
    id: 'callous',
    name: 'Callous',
    description: 'Indifferent to tears, dungeon wailing, or burning villages. Mercy is considered weakness.',
    category: 'personality',
    oppositeId: 'compassionate',
    diplomacyMod: -2,
    martialMod: 1,
    stewardshipMod: 1,
    intrigueMod: 2,
    learningMod: 0,
    dreadMod: 15,
    aiHonor: -30,
  },
  {
    id: 'sadistic',
    name: 'Sadistic',
    description: 'Finds exquisite pleasure in the torment of rivals. Dungeon executions relieve stress.',
    category: 'personality',
    oppositeId: 'compassionate',
    diplomacyMod: -3,
    martialMod: 1,
    stewardshipMod: 0,
    intrigueMod: 3,
    learningMod: 0,
    dreadMod: 35,
    prowessMod: 2,
    aiHonor: -60,
    aiVengefulness: 60,
  },
  {
    id: 'lustful',
    name: 'Lustful',
    description: 'Consumed by carnal passions. Frequently entangled in scandalous bedchamber affairs.',
    category: 'personality',
    oppositeId: 'chaste',
    diplomacyMod: 1,
    martialMod: 0,
    stewardshipMod: 0,
    intrigueMod: 2,
    learningMod: -1,
    aiHonor: -15,
  },
  {
    id: 'chaste',
    name: 'Chaste',
    description: 'Guards purity fiercely. Disdains courtly seductions and keeps wedding vows sacred.',
    category: 'personality',
    oppositeId: 'lustful',
    diplomacyMod: 0,
    martialMod: 0,
    stewardshipMod: 1,
    intrigueMod: -1,
    learningMod: 2,
    aiHonor: 25,
    aiZeal: 20,
  },
  {
    id: 'greedy',
    name: 'Greedy',
    description: 'Counts every silver groat. Imposes extortionate tithes and loathes paying ransoms.',
    category: 'personality',
    oppositeId: 'generous',
    diplomacyMod: -2,
    martialMod: 0,
    stewardshipMod: 3,
    intrigueMod: 1,
    learningMod: 0,
    aiGreed: 60,
  },
  {
    id: 'generous',
    name: 'Generous',
    description: 'Bestows lavish gifts on vassals, minstrels, and holy temples without hesitation.',
    category: 'personality',
    oppositeId: 'greedy',
    diplomacyMod: 3,
    martialMod: 0,
    stewardshipMod: -2,
    intrigueMod: -1,
    learningMod: 0,
    aiGreed: -60,
    aiHonor: 20,
  },
  {
    id: 'arrogant',
    name: 'Arrogant',
    description: 'Considers commoners and lesser nobles beneath contempt. Demands subservient kowtows.',
    category: 'personality',
    oppositeId: 'humble',
    diplomacyMod: -2,
    martialMod: 1,
    stewardshipMod: 0,
    intrigueMod: 0,
    learningMod: 0,
    dreadMod: 10,
    aiHonor: -10,
  },
  {
    id: 'humble',
    name: 'Humble',
    description: 'Wears modest linen robes despite royal blood. Listens attentively to council elders.',
    category: 'personality',
    oppositeId: 'arrogant',
    diplomacyMod: 2,
    martialMod: 0,
    stewardshipMod: 1,
    intrigueMod: 0,
    learningMod: 1,
    aiHonor: 25,
  },
  {
    id: 'cynical',
    name: 'Cynical',
    description: 'Mocks holy prophecies, relic veneration, and the divine legitimacy of anointed kings.',
    category: 'personality',
    oppositeId: 'zealous',
    diplomacyMod: 0,
    martialMod: 0,
    stewardshipMod: 1,
    intrigueMod: 2,
    learningMod: 2,
    aiZeal: -60,
    aiRationality: 30,
  },
  {
    id: 'zealous',
    name: 'Zealous',
    description: 'Burns with celestial fire. Enforces holy dogma and burns heretics at the cathedral pyre.',
    category: 'personality',
    oppositeId: 'cynical',
    diplomacyMod: 0,
    martialMod: 2,
    stewardshipMod: 0,
    intrigueMod: -1,
    learningMod: 3,
    aiZeal: 70,
    aiVengefulness: 25,
  },
  {
    id: 'paranoid',
    name: 'Paranoid',
    description: 'Sees venom in every goblet, assassins behind every tapestry, and treason in every gaze.',
    category: 'personality',
    oppositeId: 'trusting',
    diplomacyMod: -3,
    martialMod: 1,
    stewardshipMod: 0,
    intrigueMod: 4,
    learningMod: 1,
    dreadMod: 15,
    aiHonor: -25,
    aiRationality: -30,
  },
  {
    id: 'trusting',
    name: 'Trusting',
    description: 'Believes in the inherent goodwill of peers. Vulnerable to spymaster entrapments.',
    category: 'personality',
    oppositeId: 'paranoid',
    diplomacyMod: 2,
    martialMod: 0,
    stewardshipMod: 0,
    intrigueMod: -4,
    learningMod: 0,
    aiHonor: 30,
  },
  {
    id: 'stubborn',
    name: 'Stubborn',
    description: 'Once a course is set, neither siege famine nor papal bulls can alter their resolve.',
    category: 'personality',
    oppositeId: 'fickle',
    diplomacyMod: -1,
    martialMod: 2,
    stewardshipMod: 1,
    intrigueMod: 0,
    learningMod: 0,
    prowessMod: 1,
    aiRationality: -20,
  },
  {
    id: 'fickle',
    name: 'Fickle',
    description: 'Changes alliances and decrees with every prevailing wind. Unpredictable in war.',
    category: 'personality',
    oppositeId: 'stubborn',
    diplomacyMod: 1,
    martialMod: -1,
    stewardshipMod: -1,
    intrigueMod: 2,
    learningMod: 0,
    aiHonor: -30,
  },
  {
    id: 'vengeful',
    name: 'Vengeful',
    description: 'Never forgets a slight. Spends decades orchestrating the downfall of slighting houses.',
    category: 'personality',
    oppositeId: 'forgiving',
    diplomacyMod: -2,
    martialMod: 2,
    stewardshipMod: 0,
    intrigueMod: 3,
    learningMod: 0,
    dreadMod: 15,
    aiVengefulness: 80,
  },
  {
    id: 'forgiving',
    name: 'Forgiving',
    description: 'Eager to pardon rebel barons and mend fractured dynasties with peace covenants.',
    category: 'personality',
    oppositeId: 'vengeful',
    diplomacyMod: 3,
    martialMod: -1,
    stewardshipMod: 0,
    intrigueMod: -2,
    learningMod: 1,
    dreadMod: -15,
    aiVengefulness: -70,
    aiHonor: 30,
  },
  {
    id: 'diligent',
    name: 'Diligent',
    description: 'Audits every grain silo, tax register, and fortress masonry line personally.',
    category: 'personality',
    oppositeId: 'lazy',
    diplomacyMod: 1,
    martialMod: 1,
    stewardshipMod: 3,
    intrigueMod: 1,
    learningMod: 2,
    aiRationality: 35,
  },
  {
    id: 'lazy',
    name: 'Lazy',
    description: 'Sleeps past noon while chancellors mismanage the realm. Loathes military inspection.',
    category: 'personality',
    oppositeId: 'diligent',
    diplomacyMod: -1,
    martialMod: -2,
    stewardshipMod: -3,
    intrigueMod: -1,
    learningMod: -1,
    aiRationality: -30,
  },
  {
    id: 'gluttonous',
    name: 'Gluttonous',
    description: 'Holds ten-course banquets while border villages starve. Indulges in roasted boar and wine.',
    category: 'personality',
    oppositeId: 'temperate',
    diplomacyMod: -1,
    martialMod: -1,
    stewardshipMod: -2,
    intrigueMod: 0,
    learningMod: 0,
    aiRationality: -20,
  },
  {
    id: 'temperate',
    name: 'Temperate',
    description: 'Fastens belt tight. Dines on dry bread and water, conserving coin for the crown.',
    category: 'personality',
    oppositeId: 'gluttonous',
    diplomacyMod: 1,
    martialMod: 0,
    stewardshipMod: 3,
    intrigueMod: 0,
    learningMod: 1,
    aiRationality: 30,
  },
  {
    id: 'gregarious',
    name: 'Gregarious',
    description: 'The life of every tournament and banquet. Wins over adversaries with honeyed warmth.',
    category: 'personality',
    oppositeId: 'shy',
    diplomacyMod: 4,
    martialMod: 0,
    stewardshipMod: 0,
    intrigueMod: -1,
    learningMod: 0,
    aiHonor: 15,
  },
  {
    id: 'shy',
    name: 'Shy',
    description: 'Dreads high court ceremonies. Speaks in hushed whispers and shrinks from crowds.',
    category: 'personality',
    oppositeId: 'gregarious',
    diplomacyMod: -3,
    martialMod: 0,
    stewardshipMod: 1,
    intrigueMod: 1,
    learningMod: 1,
  },
  {
    id: 'just',
    name: 'Just',
    description: 'Upholds the high laws without fear or favor. Beloved by smallfolk, feared by tyrants.',
    category: 'personality',
    oppositeId: 'arbitrary',
    diplomacyMod: 2,
    martialMod: 0,
    stewardshipMod: 3,
    intrigueMod: -3,
    learningMod: 2,
    aiHonor: 60,
  },
  {
    id: 'arbitrary',
    name: 'Arbitrary',
    description: 'Dispenses justice based on personal whims and flattery. Ignores ancient charters.',
    category: 'personality',
    oppositeId: 'just',
    diplomacyMod: -2,
    martialMod: 0,
    stewardshipMod: -2,
    intrigueMod: 2,
    learningMod: -1,
    aiHonor: -60,
  },
  {
    id: 'patient',
    name: 'Patient',
    description: 'Can wait years for an enemy fortress to starve or a rival line to wither away.',
    category: 'personality',
    oppositeId: 'impatient',
    diplomacyMod: 2,
    martialMod: 1,
    stewardshipMod: 1,
    intrigueMod: 2,
    learningMod: 2,
    aiRationality: 40,
  },
  {
    id: 'impatient',
    name: 'Impatient',
    description: 'Orders reckless frontal charges against stone ramparts. Despises diplomatic protocols.',
    category: 'personality',
    oppositeId: 'patient',
    diplomacyMod: -2,
    martialMod: 2,
    stewardshipMod: -1,
    intrigueMod: -1,
    learningMod: -1,
    prowessMod: 1,
    aiRationality: -30,
  },

  // ==========================================
  // 2. EDUCATION TRAITS (Tiers 1-4, 24 Traits)
  // ==========================================
  // Diplomacy Education
  { id: 'amateurish_plotter', name: 'Amateurish Plotter', description: 'Struggles with court etiquette and etiquette nuances.', category: 'education', tier: 1, diplomacyMod: 2, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'flamboyant_trickster', name: 'Flamboyant Trickster', description: 'Entertains foreign ambassadors with witty toasts and pleasantries.', category: 'education', tier: 2, diplomacyMod: 4, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 0 },
  { id: 'charismatic_negotiator', name: 'Charismatic Negotiator', description: 'Brokers durable peace treaties and dynastic betrothals.', category: 'education', tier: 3, diplomacyMod: 6, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 1 },
  { id: 'grey_eminence', name: 'Grey Eminence', description: 'The grand architect of alliances whose words move entire continents.', category: 'education', tier: 4, diplomacyMod: 9, martialMod: 0, stewardshipMod: 2, intrigueMod: 2, learningMod: 2 },

  // Martial Education
  { id: 'misguided_warrior', name: 'Misguided Warrior', description: 'Has swung a broadsword, but lacks tactical instinct or battle discipline.', category: 'education', tier: 1, diplomacyMod: 0, martialMod: 2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 1 },
  { id: 'tough_soldier', name: 'Tough Soldier', description: 'Seasoned in castle skirmishes and brutal shieldwall clashes.', category: 'education', tier: 2, diplomacyMod: 0, martialMod: 4, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 2 },
  { id: 'skilled_tactician', name: 'Skilled Tactician', description: 'Coordinates flanking cavalry maneuvers and archer volleys with precision.', category: 'education', tier: 3, diplomacyMod: 0, martialMod: 6, stewardshipMod: 1, intrigueMod: 0, learningMod: 1, prowessMod: 3 },
  { id: 'brilliant_strategist', name: 'Brilliant Strategist', description: 'A legendary field marshal who wins unwinnable wars through tactical genius.', category: 'education', tier: 4, diplomacyMod: 1, martialMod: 9, stewardshipMod: 1, intrigueMod: 1, learningMod: 2, prowessMod: 4 },

  // Stewardship Education
  { id: 'indulgent_wastrel', name: 'Indulgent Wastrel', description: 'Spends gold coin faster than bailiffs collect taxes.', category: 'education', tier: 1, diplomacyMod: 0, martialMod: 0, stewardshipMod: 2, intrigueMod: 0, learningMod: 0 },
  { id: 'thrifty_clerk', name: 'Thrifty Clerk', description: 'Keeps ledger entries, tax rolls, and warehouse tallies in immaculate order.', category: 'education', tier: 2, diplomacyMod: 0, martialMod: 0, stewardshipMod: 4, intrigueMod: 0, learningMod: 0 },
  { id: 'fortune_builder', name: 'Fortune Builder', description: 'Expands guild trade hubs, silver mints, and toll bridges.', category: 'education', tier: 3, diplomacyMod: 1, martialMod: 0, stewardshipMod: 6, intrigueMod: 1, learningMod: 1 },
  { id: 'midas_touched', name: 'Midas Touched', description: 'Turns barren provinces into overflowing treasuries through supreme financial acumen.', category: 'education', tier: 4, diplomacyMod: 2, martialMod: 1, stewardshipMod: 9, intrigueMod: 1, learningMod: 2 },

  // Intrigue Education
  { id: 'intrepid_shadow', name: 'Intrepid Shadow', description: 'Understands eavesdropping and lockpicking, but leaves clumsy traces.', category: 'education', tier: 1, diplomacyMod: 0, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 0 },
  { id: 'suspicious_flunkey', name: 'Suspicious Flunkey', description: 'Competent at inspecting ciphered letters and hiring cutthroats.', category: 'education', tier: 2, diplomacyMod: -1, martialMod: 0, stewardshipMod: 0, intrigueMod: 4, learningMod: 0 },
  { id: 'flamboyant_schemer', name: 'Flamboyant Schemer', description: 'Orchestrates complex assassinations, framed poisonings, and abductions.', category: 'education', tier: 3, diplomacyMod: 0, martialMod: 0, stewardshipMod: 1, intrigueMod: 6, learningMod: 1 },
  { id: 'elusive_shadow', name: 'Elusive Shadow', description: 'An unseen wraith who topples sovereign dynasties from pitch-black darkness.', category: 'education', tier: 4, diplomacyMod: 1, martialMod: 0, stewardshipMod: 1, intrigueMod: 9, learningMod: 2, dreadMod: 15 },

  // Learning Education
  { id: 'conscientious_scribe', name: 'Conscientious Scribe', description: 'Transcribes sacred texts and ancient treaties with steady calligraphy.', category: 'education', tier: 1, diplomacyMod: 0, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 2 },
  { id: 'insightful_thinker', name: 'Insightful Thinker', description: 'Studies theology, celestial geometry, and canonical law.', category: 'education', tier: 2, diplomacyMod: 0, martialMod: 0, stewardshipMod: 1, intrigueMod: 0, learningMod: 4 },
  { id: 'astute_intellectual', name: 'Astute Intellectual', description: 'Reforms university curriculums, legal codes, and anatomical studies.', category: 'education', tier: 3, diplomacyMod: 1, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 6 },
  { id: 'mastermind_philosopher', name: 'Mastermind Philosopher', description: 'A towering sage whose philosophical treatises guide entire civilizations.', category: 'education', tier: 4, diplomacyMod: 2, martialMod: 1, stewardshipMod: 2, intrigueMod: 1, learningMod: 9 },

  // Prowess Education (Martial Chivalry)
  { id: 'bumbling_squire', name: 'Bumbling Squire', description: 'Carries lances and polishes mail coats; still unsteady in the saddle.', category: 'education', tier: 1, diplomacyMod: 0, martialMod: 1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 2 },
  { id: 'confident_knight', name: 'Confident Knight', description: 'Proven in tourney melees and judicial trials by combat.', category: 'education', tier: 2, diplomacyMod: 0, martialMod: 2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 4 },
  { id: 'formidable_duelist', name: 'Formidable Duelist', description: 'A deadly swordmaster whose parries and ripostes are swift as lightning.', category: 'education', tier: 3, diplomacyMod: 0, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 7 },
  { id: 'legendary_blademaster', name: 'Legendary Blademaster', description: 'An invincible warrior whose steel cuts through iron plate with effortless grace.', category: 'education', tier: 4, diplomacyMod: 1, martialMod: 4, stewardshipMod: 0, intrigueMod: 0, learningMod: 1, prowessMod: 11, dreadMod: 15 },

  // ==========================================
  // 3. CONGENITAL & GENETIC TRAITS (24 Traits)
  // ==========================================
  // Intellect Tiered
  { id: 'genius', name: 'Genius', description: 'An extraordinary intellect that masters statecraft effortlessly.', category: 'congenital', diplomacyMod: 5, martialMod: 5, stewardshipMod: 5, intrigueMod: 5, learningMod: 5, prowessMod: 2 },
  { id: 'intelligent', name: 'Intelligent', description: 'Possesses a remarkably piercing mind and keen analytical memory.', category: 'congenital', diplomacyMod: 3, martialMod: 3, stewardshipMod: 3, intrigueMod: 3, learningMod: 3, prowessMod: 1 },
  { id: 'quick', name: 'Quick', description: 'Sharp-witted and rapid to perceive political opportunities.', category: 'congenital', diplomacyMod: 2, martialMod: 2, stewardshipMod: 2, intrigueMod: 2, learningMod: 2 },
  { id: 'slow', name: 'Slow', description: 'Takes a long time to grasp complex treaties or court diplomacy.', category: 'congenital', diplomacyMod: -2, martialMod: -2, stewardshipMod: -2, intrigueMod: -2, learningMod: -2 },
  { id: 'stupid', name: 'Stupid', description: 'Easily duped by sycophants and cunning spymasters.', category: 'congenital', diplomacyMod: -3, martialMod: -3, stewardshipMod: -3, intrigueMod: -3, learningMod: -3, prowessMod: -1 },
  { id: 'imbecile', name: 'Imbecile', description: 'Severely impaired judgment; unable to read royal decrees.', category: 'congenital', diplomacyMod: -5, martialMod: -5, stewardshipMod: -5, intrigueMod: -5, learningMod: -5, prowessMod: -3 },

  // Beauty Tiered
  { id: 'beautiful', name: 'Beautiful', description: 'Breathtaking beauty that dazzles peers and foreign ambassadors.', category: 'congenital', diplomacyMod: 4, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 0 },
  { id: 'handsome', name: 'Handsome', description: 'Stately and noble countenance admired across the kingdom.', category: 'congenital', diplomacyMod: 3, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 0 },
  { id: 'comely', name: 'Comely', description: 'Pleasing features, bright eyes, and charming presence.', category: 'congenital', diplomacyMod: 2, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 0 },
  { id: 'homely', name: 'Homely', description: 'Plain and uninspiring appearance.', category: 'congenital', diplomacyMod: -1, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'ugly', name: 'Ugly', description: 'Unflattering visage that invites cruel snickers from young courtiers.', category: 'congenital', diplomacyMod: -2, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'hideous', name: 'Hideous', description: 'Repulsive countenance that causes superstitious peasants to cross themselves.', category: 'congenital', diplomacyMod: -4, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 0, dreadMod: 10 },

  // Physique Tiered
  { id: 'herculean', name: 'Herculean', description: 'Blessed with godly physical stature, immense muscle, and stamina.', category: 'congenital', diplomacyMod: 1, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 8 },
  { id: 'robust', name: 'Robust', description: 'Broad-shouldered, healthy, and resilient to battlefield injury.', category: 'congenital', diplomacyMod: 0, martialMod: 2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 4 },
  { id: 'hale', name: 'Hale', description: 'Stout constitution and natural vitality against sickness.', category: 'congenital', diplomacyMod: 0, martialMod: 1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 2 },
  { id: 'delicate', name: 'Delicate', description: 'Fragile constitution that catches chills easily.', category: 'congenital', diplomacyMod: 0, martialMod: -1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -2 },
  { id: 'frail', name: 'Frail', description: 'Weak-boned and easily bruised by armor plates.', category: 'congenital', diplomacyMod: 0, martialMod: -2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -4 },
  { id: 'feeble', name: 'Feeble', description: 'Constantly bedridden with fever and exhaustion.', category: 'congenital', diplomacyMod: -1, martialMod: -3, stewardshipMod: -1, intrigueMod: 0, learningMod: 0, prowessMod: -6 },

  // Special Congenital
  { id: 'giant', name: 'Giant', description: 'Towers head and shoulders over common knights with terrifying bulk.', category: 'congenital', diplomacyMod: -1, martialMod: 2, stewardshipMod: 0, intrigueMod: -1, learningMod: 0, prowessMod: 6, dreadMod: 10 },
  { id: 'dwarf', name: 'Dwarf', description: 'Diminutive stature; often underestimated by arrogant foes.', category: 'congenital', diplomacyMod: -1, martialMod: 0, stewardshipMod: 1, intrigueMod: 2, learningMod: 0, prowessMod: -2 },
  { id: 'pure_blooded', name: 'Pure-Blooded', description: 'Unbroken divine royal lineage resistant to genetic defects.', category: 'congenital', diplomacyMod: 2, martialMod: 1, stewardshipMod: 1, intrigueMod: 1, learningMod: 1, prowessMod: 2 },
  { id: 'fecund', name: 'Fecund', description: 'Blessed with numerous royal sons and daughters to ensure succession.', category: 'congenital', diplomacyMod: 1, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'albino', name: 'Albino', description: 'Pale snow-white hair and ruby eyes; regarded with superstitious awe.', category: 'congenital', diplomacyMod: -1, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 1, dreadMod: 15 },
  { id: 'scaly', name: 'Scaly', description: 'Hard, ichthyotic skin resembling serpent scales.', category: 'congenital', diplomacyMod: -2, martialMod: 1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 1, dreadMod: 10 },
  { id: 'clubfooted', name: 'Clubfooted', description: 'Walks with an awkward gait; unsuitable for mounted charges.', category: 'congenital', diplomacyMod: -1, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -2 },
  { id: 'hunchbacked', name: 'Hunchbacked', description: 'Deformed spine; subjected to cruel court whispers behind tapestries.', category: 'congenital', diplomacyMod: -2, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 1, prowessMod: -2 },
  { id: 'spindly', name: 'Spindly', description: 'Abnormally thin and elongated limbs.', category: 'congenital', diplomacyMod: 0, martialMod: -1, stewardshipMod: 0, intrigueMod: 1, learningMod: 0, prowessMod: -2 },
  { id: 'inbred', name: 'Inbred', description: 'The tragic consequence of excessive dynastic cousin marriages.', category: 'congenital', diplomacyMod: -3, martialMod: -3, stewardshipMod: -3, intrigueMod: -3, learningMod: -3, prowessMod: -4 },
  { id: 'bleeder', name: 'Bleeder', description: 'Blood does not clot easily; minor wounds prove life-threatening.', category: 'congenital', diplomacyMod: 0, martialMod: -2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -3 },

  // ==========================================
  // 4. HEALTH, TRAUMA & CONDITION TRAITS (18 Traits)
  // ==========================================
  { id: 'one_eyed', name: 'One-Eyed', description: 'Wears a leather patch over an eye lost in a castle breach.', category: 'health', diplomacyMod: 0, martialMod: 1, stewardshipMod: 0, intrigueMod: 1, learningMod: 0, prowessMod: -1, dreadMod: 10 },
  { id: 'one_legged', name: 'One-Legged', description: 'Walks with an ornate ironwood peg after a tourney shatter.', category: 'health', diplomacyMod: 0, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -4 },
  { id: 'disfigured', name: 'Disfigured', description: 'Wears a beaten silver mask to hide hideous battlefield burns.', category: 'health', diplomacyMod: -3, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 0, dreadMod: 20 },
  { id: 'scarred', name: 'Scarred', description: 'Duelling scars crisscross the jaw; badge of veteran courage.', category: 'health', diplomacyMod: 1, martialMod: 1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 1, dreadMod: 5 },
  { id: 'blind', name: 'Blind', description: 'Eyes blinded by hot iron or cataract; guided by a dedicated page.', category: 'health', diplomacyMod: -2, martialMod: -4, stewardshipMod: 0, intrigueMod: 2, learningMod: 3, prowessMod: -8 },
  { id: 'severely_injured', name: 'Severely Injured', description: 'Nursing broken ribs and deep sword gashes from recent combat.', category: 'health', diplomacyMod: -1, martialMod: -3, stewardshipMod: -1, intrigueMod: 0, learningMod: 0, prowessMod: -5 },
  { id: 'brutally_maimed', name: 'Brutally Maimed', description: 'A crushed hand and shattered collarbone never healed properly.', category: 'health', diplomacyMod: -2, martialMod: -4, stewardshipMod: -1, intrigueMod: 0, learningMod: 0, prowessMod: -7 },
  { id: 'infirm', name: 'Infirm', description: 'Frail with advanced age; bedridden in royal chambers.', category: 'health', diplomacyMod: -2, martialMod: -4, stewardshipMod: -2, intrigueMod: -2, learningMod: 0, prowessMod: -6 },
  { id: 'incapable', name: 'Incapable', description: 'Completely bedridden and comatose; realm ruled by appointed Regent.', category: 'health', diplomacyMod: -6, martialMod: -8, stewardshipMod: -6, intrigueMod: -6, learningMod: -4, prowessMod: -12 },
  { id: 'melancholic', name: 'Melancholic', description: 'Haunted by profound sadness, morbid visions, and existential despair.', category: 'health', diplomacyMod: -2, martialMod: -1, stewardshipMod: -1, intrigueMod: 0, learningMod: 1 },
  { id: 'lunatic', name: 'Lunatic', description: 'Appoints horses to chancellor seats and talks to stone gargoyles.', category: 'health', diplomacyMod: -3, martialMod: 1, stewardshipMod: -3, intrigueMod: 2, learningMod: -1, dreadMod: 25 },
  { id: 'possessed', name: 'Possessed', description: 'Speaks in ancient demonic tongues during full moons and solar eclipses.', category: 'health', diplomacyMod: -2, martialMod: 2, stewardshipMod: -1, intrigueMod: 3, learningMod: 2, dreadMod: 25 },
  { id: 'leprous', name: 'Leprous', description: 'Flesh afflicted by the pale wasting curse; exiled from court chambers.', category: 'health', diplomacyMod: -5, martialMod: -2, stewardshipMod: -2, intrigueMod: 1, learningMod: 2, dreadMod: 30 },
  { id: 'gout_ridden', name: 'Gout-Ridden', description: 'Painful swollen joints from rich venison and heavy cask wines.', category: 'health', diplomacyMod: -1, martialMod: -2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -3 },
  { id: 'great_pox', name: 'Great Pox', description: 'The insidious disease of courtly debauchery slowly ravaging mind and body.', category: 'health', diplomacyMod: -3, martialMod: -2, stewardshipMod: -2, intrigueMod: 0, learningMod: -1, dreadMod: 15 },
  { id: 'consumption', name: 'Consumption', description: 'Coughs blood into lace handkerchiefs during stormy nights.', category: 'health', diplomacyMod: -1, martialMod: -2, stewardshipMod: -1, intrigueMod: 0, learningMod: 1, prowessMod: -3 },
  { id: 'bubonic_plague', name: 'Bubonic Plague', description: 'Black swollen buboes across neck and groin; hours from judgment.', category: 'health', diplomacyMod: -5, martialMod: -6, stewardshipMod: -5, intrigueMod: -4, learningMod: -2, prowessMod: -10 },
  { id: 'lovers_pox', name: 'Lover’s Pox', description: 'Unsightly blemishes testifying to bedchamber indiscretions.', category: 'health', diplomacyMod: -2, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'pregnant', name: 'Pregnant', description: 'Expecting a child; carries the unborn child for 9 months until delivery.', category: 'health', diplomacyMod: 0, martialMod: -1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -2 },

  // ==========================================
  // 5. STRESS & COPING MECHANISMS (13 Traits)
  // ==========================================
  { id: 'drunkard', name: 'Drunkard', description: 'Drowns royal grief and state stress in flagons of spiced vintage.', category: 'lifestyle', diplomacyMod: -1, martialMod: -1, stewardshipMod: -2, intrigueMod: -1, learningMod: -1 },
  { id: 'flagellant', name: 'Flagellant', description: 'Whipped shoulders seek divine absolution for sins in private chapel.', category: 'lifestyle', diplomacyMod: -1, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 2, prowessMod: -1 },
  { id: 'hashishiyah', name: 'Hashishiyah', description: 'Inhales fragrant sweet herbs to quiet racing thoughts of betrayal.', category: 'lifestyle', diplomacyMod: 1, martialMod: -1, stewardshipMod: -1, intrigueMod: 0, learningMod: 1 },
  { id: 'profligate', name: 'Profligate', description: 'Copes with court dread by showering gold on minstrels and tapestries.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: -3, intrigueMod: 0, learningMod: 0 },
  { id: 'comfort_eater', name: 'Comfort Eater', description: 'Devours roast capons and almond tarts whenever bad news arrives.', category: 'lifestyle', diplomacyMod: -1, martialMod: -1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0 },
  { id: 'inappetetic', name: 'Inappetetic', description: 'Nauseated by food; wastes away during succession disputes.', category: 'lifestyle', diplomacyMod: 0, martialMod: -1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: -2 },
  { id: 'journaller', name: 'Journaller', description: 'Pours secret grievances into locked vellum diaries.', category: 'lifestyle', diplomacyMod: 0, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 2 },
  { id: 'confider', name: 'Confider', description: 'Shares intimate vulnerabilities with a trusted court companion.', category: 'lifestyle', diplomacyMod: 2, martialMod: 0, stewardshipMod: 0, intrigueMod: -1, learningMod: 0 },
  { id: 'athletic', name: 'Athletic', description: 'Burns off nervous fury through grueling morning sparring matches.', category: 'lifestyle', diplomacyMod: 0, martialMod: 1, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 3 },
  { id: 'rakish', name: 'Rakish', description: 'Frequents high-class brothels to escape burdensome state affairs.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: -1, intrigueMod: 1, learningMod: -1 },
  { id: 'reclusive', name: 'Reclusive', description: 'Bars chamber oak doors; refuses to grant audience to high council.', category: 'lifestyle', diplomacyMod: -3, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 2 },
  { id: 'irritable', name: 'Irritable', description: 'Snaps at cupbearers and councilors over tiny feudal slights.', category: 'lifestyle', diplomacyMod: -2, martialMod: 1, stewardshipMod: -1, intrigueMod: 0, learningMod: 0, dreadMod: 10 },
  { id: 'contrite', name: 'Contrite', description: 'Begs forgiveness from minor victims; wracked by feudal guilt.', category: 'lifestyle', diplomacyMod: 2, martialMod: -1, stewardshipMod: 0, intrigueMod: -2, learningMod: 1 },

  // ==========================================
  // 6. COMMANDER WARFARE TRAITS (14 Traits)
  // ==========================================
  { id: 'holy_warrior', name: 'Holy Warrior', description: 'Devastating against armies of foreign faiths under blessed banners.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 1, prowessMod: 2 },
  { id: 'unyielding_defender', name: 'Unyielding Defender', description: 'Holds castle walls and mountain passes against overwhelming hosts.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 1, intrigueMod: 0, learningMod: 0, prowessMod: 2 },
  { id: 'aggressive_attacker', name: 'Aggressive Attacker', description: 'Relentless shock charges that break enemy vanguards before battle lines form.', category: 'commander', diplomacyMod: 0, martialMod: 4, stewardshipMod: -1, intrigueMod: 0, learningMod: 0, prowessMod: 3 },
  { id: 'flexible_leader', name: 'Flexible Leader', description: 'Adapts tactical formations smoothly to any ambush or terrain.', category: 'commander', diplomacyMod: 1, martialMod: 3, stewardshipMod: 0, intrigueMod: 1, learningMod: 0 },
  { id: 'siege_engineer', name: 'Siege Engineer', description: 'Constructs counterweight trebuchets and mines beneath curtain walls.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 2, intrigueMod: 0, learningMod: 1 },
  { id: 'desert_fox', name: 'Desert Fox', description: 'Master of dune ambushes and deep water rationing across arid sands.', category: 'commander', diplomacyMod: 0, martialMod: 2, stewardshipMod: 1, intrigueMod: 1, learningMod: 0 },
  { id: 'forest_stalker', name: 'Forest Stalker', description: 'Specialist in woodland guerilla ambushes and concealed arrow traps.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 0, intrigueMod: 2, learningMod: 0 },
  { id: 'mountain_goatherd', name: 'Mountain Goatherd', description: 'Navigates sheer cliffs and avalanches with supply trains intact.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 1, intrigueMod: 0, learningMod: 0 },
  { id: 'open_plains_master', name: 'Open Plains Master', description: 'Coordinates sweeping cataphract cavalry charges across wide steppes.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 2 },
  { id: 'ford_crosser', name: 'Ford Crosser', description: 'Forces river crossings without suffering crippling defensive penalties.', category: 'commander', diplomacyMod: 0, martialMod: 2, stewardshipMod: 1, intrigueMod: 0, learningMod: 0 },
  { id: 'reaver', name: 'Reaver', description: 'Pillages enemy coastlines and sacks trade ports with ruthless speed.', category: 'commander', diplomacyMod: -2, martialMod: 3, stewardshipMod: 2, intrigueMod: 1, learningMod: 0, dreadMod: 15 },
  { id: 'winter_soldier', name: 'Winter Soldier', description: 'Troops thrive in sub-zero blizzards without succumbing to hypothermia.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 1, intrigueMod: 0, learningMod: 0 },
  { id: 'reckless', name: 'Reckless', description: 'Charges headfirst into pike squares without waiting for reserves.', category: 'commander', diplomacyMod: -1, martialMod: 3, stewardshipMod: -1, intrigueMod: -1, learningMod: -1, prowessMod: 4 },
  { id: 'organizer', name: 'Organizer', description: 'Marches armies fifty percent faster with rigid baggage discipline.', category: 'commander', diplomacyMod: 0, martialMod: 3, stewardshipMod: 2, intrigueMod: 0, learningMod: 1 },

  // ==========================================
  // 7. LIFESTYLE, PERK & FAME TRAITS (24 Traits)
  // ==========================================
  { id: 'master_schemer', name: 'Master Schemer', description: 'Puppeteer of court intrigues, poisoned daggers, and forged wills.', category: 'lifestyle', diplomacyMod: 0, martialMod: 0, stewardshipMod: 1, intrigueMod: 5, learningMod: 0, dreadMod: 15 },
  { id: 'torturer', name: 'Torturer', description: 'Extracts confessions with cold iron pincers in windowless dungeons.', category: 'lifestyle', diplomacyMod: -3, martialMod: 0, stewardshipMod: 0, intrigueMod: 4, learningMod: 0, dreadMod: 40 },
  { id: 'seducer', name: 'Seducer', description: 'Charms heirs and consorts across rival courts with irresistible courtly romance.', category: 'lifestyle', diplomacyMod: 3, martialMod: 0, stewardshipMod: 0, intrigueMod: 4, learningMod: 0 },
  { id: 'seductress', name: 'Seductress', description: 'Weaves political influence through whispered bedroom intimacy.', category: 'lifestyle', diplomacyMod: 4, martialMod: 0, stewardshipMod: 0, intrigueMod: 4, learningMod: 0 },
  { id: 'architect', name: 'Architect', description: 'Designs majestic cathedral domes, aqueducts, and fortress ramparts.', category: 'lifestyle', diplomacyMod: 0, martialMod: 1, stewardshipMod: 4, intrigueMod: 0, learningMod: 2 },
  { id: 'administrator', name: 'Administrator', description: 'Streamlines tax collection and reduces corruption across all crown counties.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: 4, intrigueMod: 0, learningMod: 1 },
  { id: 'avaricious', name: 'Avaricious', description: 'Extorts tribute and squeezes vassals for maximum feudal rents.', category: 'lifestyle', diplomacyMod: -2, martialMod: 0, stewardshipMod: 5, intrigueMod: 1, learningMod: 0 },
  { id: 'theologian', name: 'Theologian', description: 'Interprets sacred scripture and unmasks heresies before high synods.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 5 },
  { id: 'scholar', name: 'Scholar', description: 'Translates lost ancient codices and debates astronomy with natural philosophers.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: 1, intrigueMod: 0, learningMod: 5 },
  { id: 'august', name: 'August', description: 'Radiates imperial dignity; foreign kings bow in reverent respect.', category: 'lifestyle', diplomacyMod: 4, martialMod: 1, stewardshipMod: 1, intrigueMod: 0, learningMod: 1 },
  { id: 'diplomat', name: 'Diplomat', description: 'Defuses explosive territorial disputes before banners are raised.', category: 'lifestyle', diplomacyMod: 5, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 0 },
  { id: 'patriarch', name: 'Patriarch', description: 'Unites sprawling dynastic branches under rigid clan loyalty.', category: 'lifestyle', diplomacyMod: 3, martialMod: 1, stewardshipMod: 2, intrigueMod: 0, learningMod: 1 },
  { id: 'matriarch', name: 'Matriarch', description: 'Commands the reverence and obedience of generations of descendants.', category: 'lifestyle', diplomacyMod: 3, martialMod: 1, stewardshipMod: 2, intrigueMod: 1, learningMod: 1 },
  { id: 'mystic', name: 'Mystic', description: 'Communes with astral portents, herbal trances, and ancient spirits.', category: 'lifestyle', diplomacyMod: 0, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 4 },
  { id: 'miracle_worker', name: 'Miracle Worker', description: 'Holy touch reputed to heal battlefield gangrene and fevers.', category: 'lifestyle', diplomacyMod: 3, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 4 },
  { id: 'witch', name: 'Witch', description: 'Practices forbidden blood pacts and coven sabbats in midnight bogs.', category: 'lifestyle', diplomacyMod: -2, martialMod: 0, stewardshipMod: 0, intrigueMod: 4, learningMod: 3, dreadMod: 20 },
  { id: 'herbalist', name: 'Herbalist', description: 'Knows every soothing poultice, belladonna tincture, and fever draught.', category: 'lifestyle', diplomacyMod: 1, martialMod: 0, stewardshipMod: 1, intrigueMod: 2, learningMod: 3 },
  { id: 'traveler', name: 'Traveler', description: 'Has crossed distant seas and mountains, learning exotic customs.', category: 'lifestyle', diplomacyMod: 2, martialMod: 1, stewardshipMod: 1, intrigueMod: 1, learningMod: 2 },
  { id: 'hastiluder', name: 'Hastiluder', description: 'Champion of royal jousts, horse archery, and grand tourneys.', category: 'lifestyle', diplomacyMod: 1, martialMod: 2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 5 },
  { id: 'celibate', name: 'Celibate', description: 'Sworn to eternal chastity; avoids dynastic bedchambers completely.', category: 'lifestyle', diplomacyMod: 0, martialMod: 0, stewardshipMod: 1, intrigueMod: -1, learningMod: 3 },
  { id: 'aspiring_blademaster', name: 'Aspiring Blademaster', description: 'Constantly challenges roaming hedge knights to refine footwork.', category: 'lifestyle', diplomacyMod: 0, martialMod: 2, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 4 },
  { id: 'pilgrim', name: 'Pilgrim', description: 'Walked barefoot to the holiest mountain shrines of the high faith.', category: 'lifestyle', diplomacyMod: 2, martialMod: 0, stewardshipMod: 0, intrigueMod: 0, learningMod: 2 },
  { id: 'crusader', name: 'Crusader', description: 'Fought under the holy standard in foreign religious reconquests.', category: 'lifestyle', diplomacyMod: 1, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 1, prowessMod: 2 },
  { id: 'dreaded', name: 'Dreaded', description: 'Vassals cower in terror; open rebellion is unthinkable while they draw breath.', category: 'fame', diplomacyMod: -2, martialMod: 2, stewardshipMod: 0, intrigueMod: 2, learningMod: 0, dreadMod: 50 },

  // ==========================================
  // 8. COURT & DYNASTIC STATUS TRAITS (19 Traits)
  // ==========================================
  { id: 'paragon_of_virtue', name: 'Paragon of Virtue', description: 'Regarded as a living saint by the high priesthood.', category: 'status', diplomacyMod: 4, martialMod: 0, stewardshipMod: 1, intrigueMod: -2, learningMod: 3 },
  { id: 'religious_icon', name: 'Religious Icon', description: 'Anointed supreme temporal protector of the high faith.', category: 'status', diplomacyMod: 5, martialMod: 1, stewardshipMod: 0, intrigueMod: -2, learningMod: 4 },
  { id: 'kinslayer', name: 'Kinslayer', description: 'Cursed for spilling dynastic blood of a brother or close kin.', category: 'status', diplomacyMod: -4, martialMod: 0, stewardshipMod: 0, intrigueMod: 2, learningMod: 0, dreadMod: 25 },
  { id: 'familial_kinslayer', name: 'Familial Kinslayer', description: 'Murdered an uncle or first cousin to claim an inheritance.', category: 'status', diplomacyMod: -2, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 0, dreadMod: 15 },
  { id: 'excommunicated', name: 'Excommunicated', description: 'Cast out of the holy church; all treaties and feudal oaths declared null.', category: 'status', diplomacyMod: -5, martialMod: 0, stewardshipMod: -2, intrigueMod: 1, learningMod: -2 },
  { id: 'heresiarch', name: 'Heresiarch', description: 'Founder of a splinter religious creed challenging the Orthodox temples.', category: 'status', diplomacyMod: -3, martialMod: 2, stewardshipMod: 0, intrigueMod: 2, learningMod: 4, dreadMod: 20 },
  { id: 'crown_heir', name: 'Crown Heir', description: 'The designated successor to the imperial throne.', category: 'status', diplomacyMod: 2, martialMod: 1, stewardshipMod: 1, intrigueMod: 1, learningMod: 1 },
  { id: 'legitimated_bastard', name: 'Legitimated Bastard', description: 'Elevated by royal decree; deeply resented by trueborn heirs.', category: 'status', diplomacyMod: -1, martialMod: 1, stewardshipMod: 0, intrigueMod: 2, learningMod: 0 },
  { id: 'disinherited_bastard', name: 'Disinherited Bastard', description: 'Denied birthright; burns with vengeance against the crown.', category: 'status', diplomacyMod: -2, martialMod: 2, stewardshipMod: 0, intrigueMod: 3, learningMod: 0, prowessMod: 2 },
  { id: 'born_in_the_purple', name: 'Born in the Purple', description: 'Born while the parents reigned upon the imperial throne.', category: 'status', diplomacyMod: 3, martialMod: 0, stewardshipMod: 1, intrigueMod: 0, learningMod: 1 },
  { id: 'favored_child', name: 'Favored Child', description: 'The sovereign’s beloved darling; sparks bitter sibling feuds.', category: 'status', diplomacyMod: 2, martialMod: 0, stewardshipMod: 0, intrigueMod: -1, learningMod: 0 },
  { id: 'peasant_leader', name: 'Peasant Leader', description: 'Rallied angry smallfolk into a populist liberation army.', category: 'status', diplomacyMod: 2, martialMod: 3, stewardshipMod: -1, intrigueMod: 1, learningMod: 0, prowessMod: 2 },
  { id: 'regent', name: 'Regent', description: 'Holds the royal signet seal during the monarch’s minority or incapacitation.', category: 'status', diplomacyMod: 2, martialMod: 1, stewardshipMod: 3, intrigueMod: 3, learningMod: 1 },
  { id: 'court_champion', name: 'Court Champion', description: 'The supreme personal duelist fighting for the crown in trial by combat.', category: 'status', diplomacyMod: 0, martialMod: 3, stewardshipMod: 0, intrigueMod: 0, learningMod: 0, prowessMod: 7 },
  { id: 'royal_cupbearer', name: 'Royal Cupbearer', description: 'Holds the monarch’s goblet; trusted companion and target of poisoners.', category: 'status', diplomacyMod: 2, martialMod: 0, stewardshipMod: 1, intrigueMod: 2, learningMod: 0 },
  { id: 'grand_antiquarian', name: 'Grand Antiquarian', description: 'Maintains dynasty relics, ancestral armor, and historical tapestries.', category: 'status', diplomacyMod: 1, martialMod: 0, stewardshipMod: 1, intrigueMod: 1, learningMod: 4 },
  { id: 'court_physician', name: 'Court Physician', description: 'Surgical master licensed to bleed, purge, and amputate royal limbs.', category: 'status', diplomacyMod: 0, martialMod: 0, stewardshipMod: 0, intrigueMod: 1, learningMod: 5 },
  { id: 'high_inquisitor', name: 'High Inquisitor', description: 'Hunts heretics and tortures suspects to enforce church orthodoxy.', category: 'status', diplomacyMod: -2, martialMod: 1, stewardshipMod: 0, intrigueMod: 3, learningMod: 2, dreadMod: 30 },
  { id: 'court_jester', name: 'Court Jester', description: 'Licensed fool whose biting jests relieve royal melancholy.', category: 'status', diplomacyMod: 2, martialMod: -1, stewardshipMod: 0, intrigueMod: 2, learningMod: 1 },
];

export interface MedievalGovernmentProfile {
  id: string;
  name: string;
  category: 'Monarchical' | 'Ecclesiastical' | 'Mercantile' | 'Frontier & Clan';
  rarity: 'common' | 'uncommon' | 'rare';
  weight: number;
  shortDesc: string;
  rulerTitleMale: string;
  rulerTitleFemale: string;
  realmPrefixes: string[];
  preferredSocieties: string[];
  taxMod: number;
  levyMod: number;
  tradeMod: number;
  pietyMod: number;
  vassalLoyaltyMod: number;
}

export const MEDIEVAL_GOVERNMENT_TYPES: MedievalGovernmentProfile[] = [
  {
    id: 'feudal_monarchy',
    name: 'Feudal Monarchy',
    category: 'Monarchical',
    rarity: 'common',
    weight: 56,
    shortDesc: 'Hereditary crown bound by vassal oaths of knight-service and royal charters.',
    rulerTitleMale: 'King',
    rulerTitleFemale: 'Queen',
    realmPrefixes: ['Kingdom of'],
    preferredSocieties: ['Stratified Feudalism', 'Chivalric Tourney Court', 'Agrarian Peasantry & Yeomanry'],
    taxMod: 1.0,
    levyMod: 1.1,
    tradeMod: 1.0,
    pietyMod: 1.0,
    vassalLoyaltyMod: 2,
  },
  {
    id: 'high_duchy',
    name: 'High Duchy',
    category: 'Monarchical',
    rarity: 'common',
    weight: 28,
    shortDesc: 'Sovereign ducal realm anchored by stone keeps and hereditary peerages.',
    rulerTitleMale: 'Duke',
    rulerTitleFemale: 'Duchess',
    realmPrefixes: ['Duchy of', 'Duchy of', 'Duchy of', 'Grand Duchy of'],
    preferredSocieties: ['Stratified Feudalism', 'Chivalric Tourney Court', 'Borderland March-Folk'],
    taxMod: 1.02,
    levyMod: 1.08,
    tradeMod: 1.0,
    pietyMod: 1.0,
    vassalLoyaltyMod: 4,
  },
  {
    id: 'sovereign_county',
    name: 'Sovereign County',
    category: 'Monarchical',
    rarity: 'common',
    weight: 22,
    shortDesc: 'Compact hereditary county or earldom ruled from a fortified comital seat.',
    rulerTitleMale: 'Count',
    rulerTitleFemale: 'Countess',
    realmPrefixes: ['County of', 'County of', 'Earldom of'],
    preferredSocieties: ['Agrarian Peasantry & Yeomanry', 'Stratified Feudalism', 'Borderland March-Folk'],
    taxMod: 0.98,
    levyMod: 1.04,
    tradeMod: 1.0,
    pietyMod: 1.0,
    vassalLoyaltyMod: 6,
  },
  {
    id: 'elective_crown',
    name: 'Elective Crown',
    category: 'Monarchical',
    rarity: 'uncommon',
    weight: 2.0,
    shortDesc: 'Sovereign chosen by an electoral diet of dukes, palatines, and prince-bishops.',
    rulerTitleMale: 'High King',
    rulerTitleFemale: 'High Queen',
    realmPrefixes: ['Kingdom of', 'Electoral Kingdom of'],
    preferredSocieties: ['Stratified Feudalism', 'Chivalric Tourney Court', 'Scholarly & Courtly Patrons'],
    taxMod: 0.96,
    levyMod: 1.05,
    tradeMod: 1.05,
    pietyMod: 1.0,
    vassalLoyaltyMod: 10,
  },
  {
    id: 'crown_principality',
    name: 'Crown Principality',
    category: 'Monarchical',
    rarity: 'uncommon',
    weight: 1.6,
    shortDesc: 'Dynastic principality balancing upland fortresses, river tolls, and chartered towns.',
    rulerTitleMale: 'Prince',
    rulerTitleFemale: 'Princess',
    realmPrefixes: ['Principality of'],
    preferredSocieties: ['Terraced & Alpine Miners', 'Scholarly & Courtly Patrons', 'Stratified Feudalism'],
    taxMod: 1.06,
    levyMod: 1.0,
    tradeMod: 1.1,
    pietyMod: 1.0,
    vassalLoyaltyMod: 5,
  },
  {
    id: 'palatine_march',
    name: 'Palatine March',
    category: 'Frontier & Clan',
    rarity: 'uncommon',
    weight: 1.6,
    shortDesc: 'Militarized border march where frontier wardens hold swift martial authority.',
    rulerTitleMale: 'Margrave',
    rulerTitleFemale: 'Margravine',
    realmPrefixes: ['Margraviate of', 'March of'],
    preferredSocieties: ['Borderland March-Folk', 'Chivalric Tourney Court', 'Terraced & Alpine Miners'],
    taxMod: 0.92,
    levyMod: 1.28,
    tradeMod: 0.95,
    pietyMod: 0.95,
    vassalLoyaltyMod: 3,
  },
  {
    id: 'tribal_chiefdom',
    name: 'Tribal Chiefdom',
    category: 'Frontier & Clan',
    rarity: 'rare',
    weight: 0.8,
    shortDesc: 'Kinship tribes and timber strongholds led by sworn war-chiefs and elders.',
    rulerTitleMale: 'Chieftain',
    rulerTitleFemale: 'Chieftess',
    realmPrefixes: ['Chiefdom of', 'Tribe of'],
    preferredSocieties: ['Pastoral Clan & Kinship', 'Borderland March-Folk', 'Nomadic Steppe Hordes'],
    taxMod: 0.84,
    levyMod: 1.28,
    tradeMod: 0.88,
    pietyMod: 1.05,
    vassalLoyaltyMod: 4,
  },
  {
    id: 'city_state',
    name: 'City-State',
    category: 'Mercantile',
    rarity: 'rare',
    weight: 0.9,
    shortDesc: 'Autonomous walled metropolis governed by patrician burgomasters and guild courts.',
    rulerTitleMale: 'Lord Mayor',
    rulerTitleFemale: 'Lady Consul',
    realmPrefixes: ['City-State of', 'Free City of'],
    preferredSocieties: ["Guild & Burghers' Commune", 'Seafaring & Maritime Guilds', 'Scholarly & Courtly Patrons'],
    taxMod: 1.24,
    levyMod: 0.86,
    tradeMod: 1.38,
    pietyMod: 0.98,
    vassalLoyaltyMod: 7,
  },
  {
    id: 'imperial_autocracy',
    name: 'Imperial Autocracy',
    category: 'Monarchical',
    rarity: 'rare',
    weight: 0.55,
    shortDesc: 'Centralized bureaucratic empire of theme governors, golden chrysobulls, and crown legions.',
    rulerTitleMale: 'Emperor',
    rulerTitleFemale: 'Empress',
    realmPrefixes: ['Empire of'],
    preferredSocieties: ['Scholarly & Courtly Patrons', 'Stratified Feudalism', "Guild & Burghers' Commune"],
    taxMod: 1.18,
    levyMod: 1.12,
    tradeMod: 1.08,
    pietyMod: 1.0,
    vassalLoyaltyMod: -6,
  },
  {
    id: 'prince_bishopric',
    name: 'Prince-Bishopric',
    category: 'Ecclesiastical',
    rarity: 'rare',
    weight: 0.7,
    shortDesc: 'Cathedral chapter and anointed prelates governing canon courts and tithe lands.',
    rulerTitleMale: 'Prince-Bishop',
    rulerTitleFemale: 'Prince-Abbess',
    realmPrefixes: ['Prince-Bishopric of', 'Archbishopric of'],
    preferredSocieties: ['Monastic & Devotional', 'Scholarly & Courtly Patrons', 'Agrarian Peasantry & Yeomanry'],
    taxMod: 1.05,
    levyMod: 0.88,
    tradeMod: 1.0,
    pietyMod: 1.45,
    vassalLoyaltyMod: 8,
  },
  {
    id: 'theocratic_order',
    name: 'Theocratic Order',
    category: 'Ecclesiastical',
    rarity: 'rare',
    weight: 0.6,
    shortDesc: 'Monastic-military brethren sworn to vows of steel, austerity, and pilgrimage defense.',
    rulerTitleMale: 'Grand Master',
    rulerTitleFemale: 'Grand Matriarch',
    realmPrefixes: ['Holy Order of'],
    preferredSocieties: ['Monastic & Devotional', 'Borderland March-Folk', 'Chivalric Tourney Court'],
    taxMod: 0.95,
    levyMod: 1.22,
    tradeMod: 0.92,
    pietyMod: 1.5,
    vassalLoyaltyMod: 6,
  },
  {
    id: 'monastic_commonwealth',
    name: 'Monastic Commonwealth',
    category: 'Ecclesiastical',
    rarity: 'rare',
    weight: 0.5,
    shortDesc: 'Federated cloisters, scriptoria, and sanctuary hospices linked by sacred charters.',
    rulerTitleMale: 'Archimandrite',
    rulerTitleFemale: 'Arch-Abbess',
    realmPrefixes: ['Abbey-Realm of'],
    preferredSocieties: ['Monastic & Devotional', 'Scholarly & Courtly Patrons', 'Terraced & Alpine Miners'],
    taxMod: 1.04,
    levyMod: 0.82,
    tradeMod: 1.06,
    pietyMod: 1.55,
    vassalLoyaltyMod: 11,
  },
  {
    id: 'merchant_republic',
    name: 'Merchant Republic',
    category: 'Mercantile',
    rarity: 'rare',
    weight: 0.75,
    shortDesc: 'Maritime patrician houses, galley admiralty courts, and chartered guild syndicates.',
    rulerTitleMale: 'Doge',
    rulerTitleFemale: 'Dogaressa',
    realmPrefixes: ['Republic of', 'Serene Republic of'],
    preferredSocieties: ['Seafaring & Maritime Guilds', "Guild & Burghers' Commune", 'Scholarly & Courtly Patrons'],
    taxMod: 1.24,
    levyMod: 0.85,
    tradeMod: 1.42,
    pietyMod: 0.95,
    vassalLoyaltyMod: 3,
  },
  {
    id: 'free_imperial_league',
    name: 'Hanseatic League',
    category: 'Mercantile',
    rarity: 'rare',
    weight: 0.6,
    shortDesc: 'Sworn confederation of walled guild towns defending common coinage and toll charters.',
    rulerTitleMale: 'High Burgomaster',
    rulerTitleFemale: 'Lady Consul',
    realmPrefixes: ['Hanseatic League of', 'League of'],
    preferredSocieties: ["Guild & Burghers' Commune", 'Seafaring & Maritime Guilds', 'Agrarian Peasantry & Yeomanry'],
    taxMod: 1.2,
    levyMod: 0.9,
    tradeMod: 1.35,
    pietyMod: 0.98,
    vassalLoyaltyMod: 9,
  },
  {
    id: 'caliphal_emirate',
    name: 'Caliphal Emirate',
    category: 'Monarchical',
    rarity: 'rare',
    weight: 0.7,
    shortDesc: 'Dynastic iqta court of oasis citadels, madrasa scholarship, and gilded caravan protection.',
    rulerTitleMale: 'Emir',
    rulerTitleFemale: 'Sultana',
    realmPrefixes: ['Emirate of', 'Sultanate of', 'Caliphate of'],
    preferredSocieties: ['Oasis Caravan & Artisans', 'Scholarly & Courtly Patrons', 'Chivalric Tourney Court'],
    taxMod: 1.12,
    levyMod: 1.08,
    tradeMod: 1.24,
    pietyMod: 1.25,
    vassalLoyaltyMod: 2,
  },
  {
    id: 'clan_confederation',
    name: 'Clan Confederation',
    category: 'Frontier & Clan',
    rarity: 'rare',
    weight: 0.7,
    shortDesc: 'Highland or forest septs bound by blood-oaths, moot councils, and ancestral law.',
    rulerTitleMale: 'High Chieftain',
    rulerTitleFemale: 'High Chieftess',
    realmPrefixes: ['High Chiefdom of', 'Clans of'],
    preferredSocieties: ['Pastoral Clan & Kinship', 'Borderland March-Folk', 'Agrarian Peasantry & Yeomanry'],
    taxMod: 0.88,
    levyMod: 1.25,
    tradeMod: 0.9,
    pietyMod: 1.05,
    vassalLoyaltyMod: 7,
  },
  {
    id: 'steppe_khanate',
    name: 'Steppe Khanate',
    category: 'Frontier & Clan',
    rarity: 'rare',
    weight: 0.7,
    shortDesc: 'Pastoral horse-lords summoned through kurultai assemblies and swift tumen banners.',
    rulerTitleMale: 'Khagan',
    rulerTitleFemale: 'Khatun',
    realmPrefixes: ['Khanate of', 'Khaganate of'],
    preferredSocieties: ['Nomadic Steppe Hordes', 'Pastoral Clan & Kinship', 'Borderland March-Folk'],
    taxMod: 0.9,
    levyMod: 1.35,
    tradeMod: 1.05,
    pietyMod: 0.95,
    vassalLoyaltyMod: 0,
  },
];

export interface MedievalSocietyProfile {
  id: string;
  name: string;
  shortDesc: string;
  dominantEstate: string;
  taxMod: number;
  levyMod: number;
  tradeMod: number;
  devGrowthMod: number;
  preferredGovernments: string[];
}

export const MEDIEVAL_SOCIETY_TYPES: MedievalSocietyProfile[] = [
  {
    id: 'stratified_feudalism',
    name: 'Stratified Feudalism',
    shortDesc: 'Three estates of armored lords, cathedral clergy, and manor-bound peasantry.',
    dominantEstate: 'Landed Knightly Nobility',
    taxMod: 1.0,
    levyMod: 1.12,
    tradeMod: 0.98,
    devGrowthMod: 1.0,
    preferredGovernments: ['Feudal Monarchy', 'High Duchy', 'Elective Crown'],
  },
  {
    id: 'guild_commune',
    name: "Guild & Burghers' Commune",
    shortDesc: 'Chartered craft masters, town bailiffs, and wool-hall syndics drive civic life.',
    dominantEstate: 'Urban Master Guilds',
    taxMod: 1.2,
    levyMod: 0.88,
    tradeMod: 1.32,
    devGrowthMod: 1.25,
    preferredGovernments: ['Free Imperial League', 'Merchant Republic', 'Crown Principality'],
  },
  {
    id: 'pastoral_kinship',
    name: 'Pastoral Clan & Kinship',
    shortDesc: 'Extended blood-septs, wergild compensation, seasonal pasture rights, and bardic memory.',
    dominantEstate: 'Hereditary Kin-Elders',
    taxMod: 0.88,
    levyMod: 1.22,
    tradeMod: 0.92,
    devGrowthMod: 0.95,
    preferredGovernments: ['Clan Confederation', 'Steppe Khanate', 'Palatine March'],
  },
  {
    id: 'monastic_devotional',
    name: 'Monastic & Devotional',
    shortDesc: 'Parish bells, scriptoria, pilgrimage inns, and alms-hospices shape daily rhythm.',
    dominantEstate: 'Abbots & Cathedral Chapter',
    taxMod: 1.02,
    levyMod: 0.9,
    tradeMod: 1.0,
    devGrowthMod: 1.12,
    preferredGovernments: ['Prince-Bishopric', 'Theocratic Order', 'Monastic Commonwealth'],
  },
  {
    id: 'seafaring_guilds',
    name: 'Seafaring & Maritime Guilds',
    shortDesc: 'Shipwright yards, admiralty charts, salt-fish fleets, and island customs.',
    dominantEstate: 'Admiralty & Shipmasters',
    taxMod: 1.16,
    levyMod: 0.95,
    tradeMod: 1.38,
    devGrowthMod: 1.18,
    preferredGovernments: ['Merchant Republic', 'Free Imperial League', 'Feudal Monarchy'],
  },
  {
    id: 'chivalric_court',
    name: 'Chivalric Tourney Court',
    shortDesc: 'Heraldic orders, tournament lists, troubadour courts, and sworn knightly retinues.',
    dominantEstate: 'Banneret Knights & Heralds',
    taxMod: 0.98,
    levyMod: 1.18,
    tradeMod: 1.02,
    devGrowthMod: 1.05,
    preferredGovernments: ['Feudal Monarchy', 'High Duchy', 'Elective Crown', 'Palatine March'],
  },
  {
    id: 'agrarian_yeomanry',
    name: 'Agrarian Peasantry & Yeomanry',
    shortDesc: 'Freeholder longbowmen, common-field parishes, harvest moots, and watermill hamlets.',
    dominantEstate: 'Freehold Yeoman Commons',
    taxMod: 1.05,
    levyMod: 1.1,
    tradeMod: 0.96,
    devGrowthMod: 1.08,
    preferredGovernments: ['Feudal Monarchy', 'Elective Crown', 'Free Imperial League'],
  },
  {
    id: 'borderland_march',
    name: 'Borderland March-Folk',
    shortDesc: 'Stone peel-towers, signal beacons, march-wardens, and fortified farmsteads.',
    dominantEstate: 'March Wardens & Castles',
    taxMod: 0.92,
    levyMod: 1.26,
    tradeMod: 0.94,
    devGrowthMod: 0.96,
    preferredGovernments: ['Palatine March', 'Theocratic Order', 'Clan Confederation'],
  },
  {
    id: 'nomadic_steppe',
    name: 'Nomadic Steppe Hordes',
    shortDesc: 'Felt-yurt camps, vast horse herds, composite bows, and seasonal migration routes.',
    dominantEstate: 'Equestrian Noyan Clans',
    taxMod: 0.86,
    levyMod: 1.34,
    tradeMod: 1.06,
    devGrowthMod: 0.9,
    preferredGovernments: ['Steppe Khanate', 'Clan Confederation'],
  },
  {
    id: 'scholarly_patrons',
    name: 'Scholarly & Courtly Patrons',
    shortDesc: 'Cathedral academies, astrolabe workshops, manuscript scribes, and diplomatic chanceries.',
    dominantEstate: 'Chancery & Scholars',
    taxMod: 1.12,
    levyMod: 0.92,
    tradeMod: 1.16,
    devGrowthMod: 1.3,
    preferredGovernments: ['Imperial Autocracy', 'Caliphal Emirate', 'Crown Principality', 'Monastic Commonwealth'],
  },
  {
    id: 'alpine_miners',
    name: 'Terraced & Alpine Miners',
    shortDesc: 'Chartered silver-delvers, charcoal burners, pass toll-keepers, and stonewrights.',
    dominantEstate: 'Mining Guilds & Castles',
    taxMod: 1.14,
    levyMod: 1.08,
    tradeMod: 1.1,
    devGrowthMod: 1.12,
    preferredGovernments: ['Crown Principality', 'High Duchy', 'Palatine March'],
  },
  {
    id: 'oasis_caravan',
    name: 'Oasis Caravan & Artisans',
    shortDesc: 'Qanat irrigation gardens, spiced silk souks, geometric tilemakers, and camel caravans.',
    dominantEstate: 'Caravan Syndics & Madrasas',
    taxMod: 1.15,
    levyMod: 1.0,
    tradeMod: 1.34,
    devGrowthMod: 1.2,
    preferredGovernments: ['Caliphal Emirate', 'Merchant Republic', 'Imperial Autocracy'],
  },
];

export function getGovernmentProfile(govName?: string): MedievalGovernmentProfile {
  const clean = (govName || '').trim().toLowerCase();
  const exact = MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.name.toLowerCase() === clean || g.id === clean);
  if (exact) return exact;
  if (clean.includes('theocrat') || clean.includes('order')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'theocratic_order')!;
  if (clean.includes('bishop') || clean.includes('see')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'prince_bishopric')!;
  if (clean.includes('monast') || clean.includes('abbey')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'monastic_commonwealth')!;
  if (clean.includes('city-state') || clean.includes('city state') || clean.includes('commune')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'city_state')!;
  if (clean.includes('merchant') || clean.includes('republic') || clean.includes('doge')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'merchant_republic')!;
  if (clean.includes('league') || clean.includes('hanse')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'free_imperial_league')!;
  if (clean.includes('emir') || clean.includes('sultan') || clean.includes('caliph')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'caliphal_emirate')!;
  if (clean.includes('khan') || clean.includes('horde')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'steppe_khanate')!;
  if (clean.includes('tribe') || clean.includes('tribal') || clean.includes('chief')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'tribal_chiefdom')!;
  if (clean.includes('clan') || clean.includes('sept')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'clan_confederation')!;
  if (clean.includes('march') || clean.includes('margrav')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'palatine_march')!;
  if (clean.includes('princip')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'crown_principality')!;
  if (clean.includes('empire') || clean.includes('imperial') || clean.includes('autocra')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'imperial_autocracy')!;
  if (clean.includes('elect')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'elective_crown')!;
  if (clean.includes('county') || clean.includes('earl')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'sovereign_county')!;
  if (clean.includes('duchy')) return MEDIEVAL_GOVERNMENT_TYPES.find((g) => g.id === 'high_duchy')!;
  return MEDIEVAL_GOVERNMENT_TYPES[0];
}

const REALM_PREFIX_REGEX =
  /^(?:High Kingdom of|Electoral Kingdom of|Kingdom of|Crown of|High Realm of|Crown-Diet of|Empire of|Dominion of|Imperial Theme of|Archduchy of|Grand Duchy of|Royal Duchy of|Duchy of|Palatinate of|Earldom of|Crown County of|Appanage County of|County of|Shire of|Principality of|Sovereign Seat of|Margraviate of|March of|Border Ward of|Caliphate of|Sultanate of|Emirate of|Khaganate of|Khanate of|Golden Horde of|High Chiefdom of|Chiefdom of|Tribe of|Kindred of|Sept-League of|Highland Moot of|Clans of|City-State of|Free City of|Commune of|Signoria of|Serene Republic of|Merchant Realm of|Dogeate of|Republic of|Hanseatic League of|Guild League of|League of|Civic Pact of|Prince-Bishopric of|Archbishopric of|See of|Holy Order of|Commandery of|Knights of|Abbey-Realm of|Holy Commonwealth of|Sanctuary of|Free State of|Free Duchy of|Free County of)\s+/i;

export function stripRealmPrefix(name?: string): string {
  const raw = (name || '').trim();
  if (!raw) return 'the Realm';
  const stripped = raw.replace(REALM_PREFIX_REGEX, '').trim();
  return stripped || raw;
}

export interface SovereignRankInfo {
  maleTitle: string;
  femaleTitle: string;
  rankTitle: string;
  titleTier: TitleTier;
  isRoyalOrHigher: boolean;
}

export function getRealmSovereignRank(
  realm?: Pick<Realm, 'name' | 'government'> | null,
  gender?: 'male' | 'female'
): SovereignRankInfo {
  const rName = (realm?.name || '').trim().toLowerCase();
  const gov = getGovernmentProfile(realm?.government);

  let maleTitle = gov.rulerTitleMale;
  let femaleTitle = gov.rulerTitleFemale;
  let titleTier: TitleTier = 'King';

  // Match explicit state prefix in realm name first so "Earldom of X" -> Earl, "Sultanate of X" -> Sultan, etc.
  if (rName.startsWith('empire of') || rName.startsWith('imperial ') || rName.startsWith('dominion of')) {
    maleTitle = 'Emperor';
    femaleTitle = 'Empress';
    titleTier = 'Emperor';
  } else if (rName.startsWith('caliphate of')) {
    maleTitle = 'Caliph';
    femaleTitle = 'Calipha';
    titleTier = 'Emperor';
  } else if (rName.startsWith('khaganate of')) {
    maleTitle = 'Khagan';
    femaleTitle = 'Khatun';
    titleTier = 'Emperor';
  } else if (rName.startsWith('high kingdom of') || rName.startsWith('electoral kingdom of')) {
    maleTitle = 'High King';
    femaleTitle = 'High Queen';
    titleTier = 'King';
  } else if (rName.startsWith('kingdom of') || rName.startsWith('crown of') || rName.startsWith('high realm of')) {
    maleTitle = 'King';
    femaleTitle = 'Queen';
    titleTier = 'King';
  } else if (rName.startsWith('sultanate of')) {
    maleTitle = 'Sultan';
    femaleTitle = 'Sultana';
    titleTier = 'King';
  } else if (rName.startsWith('emirate of')) {
    maleTitle = 'Emir';
    femaleTitle = 'Emira';
    titleTier = 'King';
  } else if (rName.startsWith('khanate of') || rName.startsWith('golden horde of')) {
    maleTitle = 'Khan';
    femaleTitle = 'Khatun';
    titleTier = 'King';
  } else if (rName.startsWith('archduchy of')) {
    maleTitle = 'Archduke';
    femaleTitle = 'Archduchess';
    titleTier = 'Duke';
  } else if (rName.startsWith('grand duchy of')) {
    maleTitle = 'Grand Duke';
    femaleTitle = 'Grand Duchess';
    titleTier = 'Duke';
  } else if (rName.startsWith('duchy of') || rName.startsWith('royal duchy of') || rName.startsWith('free duchy of')) {
    maleTitle = 'Duke';
    femaleTitle = 'Duchess';
    titleTier = 'Duke';
  } else if (rName.startsWith('principality of') || rName.startsWith('sovereign seat of')) {
    maleTitle = 'Prince';
    femaleTitle = 'Princess';
    titleTier = 'Duke';
  } else if (rName.startsWith('margraviate of') || rName.startsWith('march of') || rName.startsWith('border ward of')) {
    maleTitle = 'Margrave';
    femaleTitle = 'Margravine';
    titleTier = 'Duke';
  } else if (rName.startsWith('earldom of')) {
    maleTitle = 'Earl';
    femaleTitle = 'Countess';
    titleTier = 'Count';
  } else if (rName.startsWith('county of') || rName.startsWith('palatinate of') || rName.startsWith('free county of') || rName.startsWith('shire of')) {
    maleTitle = 'Count';
    femaleTitle = 'Countess';
    titleTier = 'Count';
  } else if (rName.startsWith('city-state of') || rName.startsWith('free city of') || rName.startsWith('commune of') || rName.startsWith('signoria of')) {
    maleTitle = 'Lord Mayor';
    femaleTitle = 'Lady Consul';
    titleTier = 'Count';
  } else if (rName.startsWith('serene republic of') || rName.startsWith('republic of') || rName.startsWith('merchant realm of') || rName.startsWith('dogeate of')) {
    maleTitle = 'Doge';
    femaleTitle = 'Dogaressa';
    titleTier = 'Duke';
  } else if (rName.startsWith('hanseatic league of') || rName.startsWith('league of') || rName.startsWith('guild league of') || rName.startsWith('civic pact of')) {
    maleTitle = 'High Burgomaster';
    femaleTitle = 'Lady Consul';
    titleTier = 'Duke';
  } else if (rName.startsWith('tribe of') || rName.startsWith('chiefdom of') || rName.startsWith('kindred of')) {
    maleTitle = 'Chieftain';
    femaleTitle = 'Chieftess';
    titleTier = 'Count';
  } else if (rName.startsWith('high chiefdom of') || rName.startsWith('clans of') || rName.startsWith('sept-league of') || rName.startsWith('highland moot of')) {
    maleTitle = 'High Chieftain';
    femaleTitle = 'High Chieftess';
    titleTier = 'Duke';
  } else if (rName.startsWith('prince-bishopric of') || rName.startsWith('archbishopric of') || rName.startsWith('see of')) {
    maleTitle = 'Prince-Bishop';
    femaleTitle = 'Prince-Abbess';
    titleTier = 'Duke';
  } else if (rName.startsWith('holy order of') || rName.startsWith('commandery of') || rName.startsWith('knights of')) {
    maleTitle = 'Grand Master';
    femaleTitle = 'Grand Matriarch';
    titleTier = 'Duke';
  } else if (rName.startsWith('abbey-realm of') || rName.startsWith('holy commonwealth of') || rName.startsWith('sanctuary of')) {
    maleTitle = 'Archimandrite';
    femaleTitle = 'Arch-Abbess';
    titleTier = 'Duke';
  } else {
    // Fallback by government profile ID
    if (gov.id === 'imperial_autocracy') titleTier = 'Emperor';
    else if (
      gov.id === 'feudal_monarchy' ||
      gov.id === 'elective_crown' ||
      gov.id === 'caliphal_emirate' ||
      gov.id === 'steppe_khanate'
    ) {
      titleTier = 'King';
    } else if (
      gov.id === 'high_duchy' ||
      gov.id === 'crown_principality' ||
      gov.id === 'palatine_march' ||
      gov.id === 'merchant_republic' ||
      gov.id === 'free_imperial_league' ||
      gov.id === 'prince_bishopric' ||
      gov.id === 'theocratic_order' ||
      gov.id === 'monastic_commonwealth' ||
      gov.id === 'clan_confederation'
    ) {
      titleTier = 'Duke';
    } else {
      titleTier = 'Count';
    }
  }

  const rankTitle = gender === 'female' ? femaleTitle : maleTitle;
  const isRoyalOrHigher = titleTier === 'Emperor' || titleTier === 'King';
  return { maleTitle, femaleTitle, rankTitle, titleTier, isRoyalOrHigher };
}

export const TITLE_TIER_RANK: Record<TitleTier, number> = {
  Emperor: 6,
  King: 5,
  Duke: 4,
  Count: 3,
  Baron: 2,
  Mayor: 1,
  Commoner: 0,
};

export function getTitleTierRank(tier?: TitleTier): number {
  if (!tier) return 0;
  return TITLE_TIER_RANK[tier] ?? 0;
}

export function getLowerTitleTier(maxTier: TitleTier, preferredTier?: TitleTier): TitleTier {
  const maxRank = getTitleTierRank(maxTier);
  const capRank = Math.max(0, maxRank - 1);
  if (preferredTier && getTitleTierRank(preferredTier) <= capRank) {
    return preferredTier;
  }
  switch (capRank) {
    case 5:
      return 'King';
    case 4:
      return 'Duke';
    case 3:
      return 'Count';
    case 2:
      return 'Baron';
    case 1:
      return 'Mayor';
    default:
      return 'Commoner';
  }
}

export interface SovereignTerritoryProfile {
  floodDrag: number;
  areaCapRatio: number | null;
  minCounties: number;
  maxCounties: number;
}

export function getSovereignTerritoryProfile(
  tier: TitleTier,
  govId?: string
): SovereignTerritoryProfile {
  if (govId === 'city_state') {
    return { floodDrag: 4.8, areaCapRatio: 0.11, minCounties: 1, maxCounties: 1 };
  }
  switch (tier) {
    case 'Emperor':
      return { floodDrag: 0.72, areaCapRatio: null, minCounties: 8, maxCounties: 24 };
    case 'King':
      return { floodDrag: 0.92, areaCapRatio: null, minCounties: 5, maxCounties: 18 };
    case 'Duke':
      return { floodDrag: 2.65, areaCapRatio: 0.34, minCounties: 2, maxCounties: 4 };
    case 'Count':
    default:
      return { floodDrag: 4.3, areaCapRatio: 0.16, minCounties: 1, maxCounties: 2 };
  }
}

export function getHeirStyleForRealm(
  realm: Pick<Realm, 'name' | 'government'> | null | undefined,
  monarchTier: TitleTier,
  gender: 'male' | 'female',
  fiefBurgName?: string
): { titleTier: TitleTier; title: string; fiefName?: string } {
  const isFem = gender === 'female';
  const realmClean = stripRealmPrefix(realm?.name);
  const gov = getGovernmentProfile(realm?.government);
  const isRoyalOrHigher = monarchTier === 'Emperor' || monarchTier === 'King';

  // Ensure heir's tier is STRICTLY lower than the sovereign's tier
  const desiredTier: TitleTier = fiefBurgName
    ? 'Count'
    : isRoyalOrHigher
    ? 'Duke'
    : monarchTier === 'Duke'
    ? 'Count'
    : 'Baron';
  const titleTier = getLowerTitleTier(monarchTier, desiredTier);

  if (fiefBurgName) {
    if (titleTier === 'Count') {
      const prefix = isRoyalOrHigher
        ? (isFem ? 'Crown Princess' : 'Crown Prince')
        : (isFem ? 'Heiress' : 'Heir');
      return {
        titleTier,
        title: `${prefix} & ${isFem ? 'Countess' : 'Count'} of ${fiefBurgName}`,
        fiefName: `Appanage County of ${fiefBurgName}`,
      };
    }
    if (titleTier === 'Baron') {
      if (gov.id === 'city_state') {
        return {
          titleTier,
          title: `${isFem ? 'Heiress' : 'Heir'} & Alderman of ${fiefBurgName}`,
          fiefName: `Appanage Ward of ${fiefBurgName}`,
        };
      }
      if (gov.id === 'tribal_chiefdom') {
        return {
          titleTier,
          title: `${isFem ? 'Heiress' : 'Heir'} & Thane of ${fiefBurgName}`,
          fiefName: `Appanage Stead of ${fiefBurgName}`,
        };
      }
      return {
        titleTier,
        title: `${isFem ? 'Heiress' : 'Heir'} & ${isFem ? 'Baroness' : 'Baron'} of ${fiefBurgName}`,
        fiefName: `Appanage Barony of ${fiefBurgName}`,
      };
    }
    return {
      titleTier,
      title: `${isFem ? 'Heiress' : 'Heir'} of ${fiefBurgName}`,
      fiefName: `Appanage Seat of ${fiefBurgName}`,
    };
  }

  const title = isRoyalOrHigher
    ? (isFem ? `Crown Princess of ${realmClean}` : `Crown Prince of ${realmClean}`)
    : (isFem ? `Heiress Presumptive of ${realmClean}` : `Heir Presumptive of ${realmClean}`);
  return { titleTier, title };
}

/**
 * True ONLY when the character belongs directly to the sovereign dynasty of a Kingdom or Empire
 * (never for Duchies, Counties, or children/heirs of subordinate vassal Dukes/Counts/Barons).
 */
export function isCharacterRoyalLineage(
  char: Partial<Character> | null | undefined,
  world?: { realms?: Realm[]; characters?: Character[] } | null
): boolean {
  if (!char) return false;
  if (char.titleTier === 'Emperor' || char.titleTier === 'King') return true;
  const realm = world?.realms?.find((r) => r.id === char.realmId);
  if (!realm) return false;
  const sovRank = getRealmSovereignRank(realm);
  if (!sovRank.isRoyalOrHigher) return false;

  const nonRoyalVassalRoles = new Set<string>([
    'Vassal Duke',
    'Vassal Count',
    'Vassal Baron',
    'Vassal Heir',
    'Vassal Consort',
    'Lord Mayor',
    'Merchant Guildmaster',
    'Guildmaster',
    'Portmaster',
    'Village Bailiff',
    'Noble Scion',
  ]);
  if (char.role && nonRoyalVassalRoles.has(char.role)) return false;

  const monarch = world?.characters?.find((c) => c.id === realm.rulerId);
  if (!monarch) {
    return (
      char.role === 'Monarch' ||
      char.role === 'Crown Heir' ||
      char.role === 'Cadet Prince' ||
      char.role === 'Cadet Princess' ||
      char.role === 'Royal Uncle'
    );
  }

  if (char.id === monarch.id || char.id === monarch.heirId || char.id === monarch.spouseId) {
    return true;
  }

  // If parents are known, verify the character descends from the royal sovereign/house (not a vassal Duke/Count)
  if (char.knownFatherId || char.motherId) {
    const father = char.knownFatherId ? world?.characters?.find((c) => c.id === char.knownFatherId) : undefined;
    const mother = char.motherId ? world?.characters?.find((c) => c.id === char.motherId) : undefined;
    if (
      father?.id === monarch.id ||
      mother?.id === monarch.id ||
      (monarch.spouseId && (father?.id === monarch.spouseId || mother?.id === monarch.spouseId)) ||
      father?.titleTier === 'King' ||
      father?.titleTier === 'Emperor' ||
      mother?.titleTier === 'King' ||
      mother?.titleTier === 'Emperor'
    ) {
      return true;
    }
    if (father || mother) {
      // Check one generation higher (e.g. monarch's siblings/cousins/grandchildren) via royal house name
      const royalHouse = monarch.houseName;
      const parentIsRoyalHouse = Boolean(
        royalHouse &&
          !char.isCadetFounder &&
          ((father && father.houseName === royalHouse && !nonRoyalVassalRoles.has(father.role)) ||
            (mother && mother.houseName === royalHouse && !nonRoyalVassalRoles.has(mother.role)))
      );
      return parentIsRoyalHouse;
    }
  }

  return Boolean(
    monarch.houseName &&
      char.houseName === monarch.houseName &&
      !char.isCadetFounder
  );
}

export function getChildRoleForParents(
  mother: Partial<Character>,
  father: Partial<Character> | undefined,
  _realm: Pick<Realm, 'id' | 'name' | 'government' | 'rulerId'> | undefined,
  _isBoy: boolean,
  isBastard: boolean,
  _monarch?: Partial<Character>
): { role: CourtRole; title: string } {
  const dynName = isBastard ? (mother.houseName || 'Unknown') : (father?.houseName || mother.houseName || 'Unknown');
  if (isBastard) {
    return {
      role: 'Disinherited Bastard',
      title: `Bastard Child of House ${dynName}`,
    };
  }
  return {
    role: 'Child',
    title: `Child of House ${dynName}`,
  };
}

export function formatCharacterRoleLabel(
  char: Partial<Character> | null | undefined,
  world?: { realms?: Realm[]; characters?: Character[] } | null
): string {
  if (!char?.role) return 'Courtier';
  if (
    char.role === 'Child' ||
    char.role === 'Cadet Prince' ||
    char.role === 'Cadet Princess' ||
    char.role === 'Noble Scion'
  ) {
    return 'Child';
  }
  const isRoyal = isCharacterRoyalLineage(char, world);
  const realm = world?.realms?.find((r) => r.id === char.realmId);
  const sovRank = realm ? getRealmSovereignRank(realm) : undefined;
  const isFem = char.gender === 'female';

  if (!isRoyal) {
    if (char.role === 'Royal Uncle') {
      return isFem ? 'Elder Kinswoman' : 'Elder Kinsman';
    }
    if (char.role === 'Crown Heir' || char.role === 'Heir') {
      const monarch = realm?.rulerId ? world?.characters?.find((c) => c.id === realm.rulerId) : undefined;
      const isRealmHeir = Boolean(
        !monarch ||
          monarch.heirId === char.id ||
          char.liegeId === monarch.id ||
          char.knownFatherId === monarch.id ||
          char.motherId === monarch.id
      );
      if (isRealmHeir && sovRank) {
        if (sovRank.titleTier === 'Duke') return isFem ? 'Ducal Heiress' : 'Ducal Heir';
        if (sovRank.titleTier === 'Count') return isFem ? 'Comital Heiress' : 'Comital Heir';
      }
      if (!isRealmHeir) return 'Vassal Heir';
      return isFem ? 'Heiress' : 'Heir';
    }
  }
  return char.role;
}

export function sanitizeNonRoyalTitle(
  title: string | undefined,
  gender: 'male' | 'female' | undefined
): string {
  const raw = (title || '').trim();
  if (!raw) return 'Child';
  // Never alter Principality or Prince-Bishopric ecclesiastical titles
  if (/prince-bishop|prince-abbess|principality/i.test(raw)) return raw;
  const isFem = gender === 'female';
  return raw
    .replace(/\bCrown Princess\b/gi, 'Heiress')
    .replace(/\bCrown Prince\b/gi, 'Heir')
    .replace(/\bCadet Princess\b/gi, 'Child')
    .replace(/\bCadet Prince\b/gi, 'Child')
    .replace(/\bNoble Scion\b/gi, 'Child')
    .replace(/\bDowager Princess\b/gi, 'Dowager Lady')
    .replace(/\bPrincess\b/gi, isFem ? 'Heiress' : 'Heir')
    .replace(/\bPrince\b/gi, isFem ? 'Heiress' : 'Child');
}

export interface SubordinateVassalStyle {
  role: CourtRole;
  titleTier: TitleTier;
  title: string;
  rankLabel: string;
  fiefName: string;
  isNobleHouse: boolean;
}

export function getSubordinateVassalStyle(
  realm: Pick<Realm, 'name' | 'government'> | null | undefined,
  liegeTier: TitleTier,
  gender: 'male' | 'female',
  seatName: string,
  kind: 'county_fief' | 'barony' | 'port' | 'market',
  useEarlStyle = false
): SubordinateVassalStyle {
  const isFem = gender === 'female';
  const gov = getGovernmentProfile(realm?.government);
  const sovIsMayor = gov.rulerTitleMale.toLowerCase().includes('mayor');
  const isTribal = gov.id === 'tribal_chiefdom' || gov.id === 'clan_confederation';
  const isCityState = gov.id === 'city_state';

  if (kind === 'county_fief') {
    const tier = getLowerTitleTier(liegeTier, 'Count');
    if (tier === 'Count') {
      const rankLabel = isFem ? 'Countess' : useEarlStyle ? 'Earl' : 'Count';
      return {
        role: 'Vassal Count',
        titleTier: 'Count',
        title: `${rankLabel} of ${seatName}`,
        rankLabel,
        fiefName: useEarlStyle ? `Earldom of ${seatName}` : `County of ${seatName}`,
        isNobleHouse: true,
      };
    }
    if (tier === 'Baron') {
      const rankLabel = isCityState
        ? 'Magistrate'
        : isTribal
        ? 'Thane'
        : isFem
        ? 'Baroness'
        : 'Baron';
      return {
        role: 'Vassal Baron',
        titleTier: 'Baron',
        title: `${rankLabel} of ${seatName}`,
        rankLabel,
        fiefName: isCityState
          ? `Chartered Ward of ${seatName}`
          : isTribal
          ? `Tribal Stead of ${seatName}`
          : `Barony of ${seatName}`,
        isNobleHouse: true,
      };
    }
    if (tier === 'Mayor') {
      const rankLabel = sovIsMayor ? 'Syndic' : isFem ? 'Lady Mayor' : 'Mayor';
      return {
        role: 'Lord Mayor',
        titleTier: 'Mayor',
        title: `${rankLabel} of ${seatName}`,
        rankLabel,
        fiefName: `Borough of ${seatName}`,
        isNobleHouse: false,
      };
    }
    return {
      role: 'Village Bailiff',
      titleTier: 'Commoner',
      title: `Reeve of ${seatName}`,
      rankLabel: 'Reeve',
      fiefName: `Parish of ${seatName}`,
      isNobleHouse: false,
    };
  }

  if (kind === 'port') {
    const tier = getLowerTitleTier(liegeTier, 'Mayor');
    if (tier === 'Mayor') {
      const usePortmaster = sovIsMayor || useEarlStyle;
      const rankLabel = usePortmaster ? 'Portmaster' : isFem ? 'Lady Mayor' : 'Lord Mayor';
      return {
        role: usePortmaster ? 'Portmaster' : 'Lord Mayor',
        titleTier: 'Mayor',
        title: `${rankLabel} of ${seatName}`,
        rankLabel,
        fiefName: `Harbor of ${seatName}`,
        isNobleHouse: false,
      };
    }
    return {
      role: 'Portmaster',
      titleTier: 'Commoner',
      title: `Harbor Factor of ${seatName}`,
      rankLabel: 'Harbor Factor',
      fiefName: `Harbor of ${seatName}`,
      isNobleHouse: false,
    };
  }

  if (kind === 'market') {
    const tier = getLowerTitleTier(liegeTier, 'Mayor');
    if (tier === 'Mayor') {
      const useGuildmaster = sovIsMayor || useEarlStyle;
      const rankLabel = useGuildmaster ? 'Guildmaster' : isFem ? 'Lady Mayor' : 'Lord Mayor';
      return {
        role: useGuildmaster ? 'Guildmaster' : 'Lord Mayor',
        titleTier: 'Mayor',
        title: `${rankLabel} of ${seatName}`,
        rankLabel,
        fiefName: `Market of ${seatName}`,
        isNobleHouse: false,
      };
    }
    return {
      role: 'Guildmaster',
      titleTier: 'Commoner',
      title: `Market Reeve of ${seatName}`,
      rankLabel: 'Market Reeve',
      fiefName: `Market of ${seatName}`,
      isNobleHouse: false,
    };
  }

  // kind === 'barony'
  const tier = getLowerTitleTier(liegeTier, 'Baron');
  if (tier === 'Baron') {
    const rankLabel = isTribal ? 'Thane' : isFem ? 'Baroness' : 'Baron';
    return {
      role: 'Vassal Baron',
      titleTier: 'Baron',
      title: `${rankLabel} of ${seatName}`,
      rankLabel,
      fiefName: isTribal ? `Stead of ${seatName}` : `Barony of ${seatName}`,
      isNobleHouse: true,
    };
  }
  if (tier === 'Mayor') {
    const rankLabel = sovIsMayor ? 'Alderman' : 'Bailiff';
    return {
      role: 'Guildmaster',
      titleTier: 'Mayor',
      title: `${rankLabel} of ${seatName}`,
      rankLabel,
      fiefName: `Ward of ${seatName}`,
      isNobleHouse: false,
    };
  }
  return {
    role: 'Village Bailiff',
    titleTier: 'Commoner',
    title: `Reeve of ${seatName}`,
    rankLabel: 'Reeve',
    fiefName: `Manor of ${seatName}`,
    isNobleHouse: false,
  };
}

export function getCharacterRankTitle(
  char: Pick<Character, 'id' | 'role' | 'titleTier' | 'title' | 'gender' | 'realmId' | 'countyId'> | {
    id?: string;
    role: string;
    titleTier?: TitleTier;
    title?: string;
    gender?: 'male' | 'female';
    realmId?: string;
    countyId?: string;
  },
  world?: Pick<WorldState, 'realms' | 'counties'>
): string {
  const realm = world?.realms?.find((r) => r.id === char.realmId);
  const isSovereign =
    char.role === 'Monarch' ||
    Boolean(realm && char.id && realm.rulerId === char.id);

  if (isSovereign && realm) {
    return getRealmSovereignRank(realm, char.gender).rankTitle;
  }

  let tier = char.titleTier;
  if (realm && tier) {
    const sovRank = getRealmSovereignRank(realm, char.gender);
    if (getTitleTierRank(tier) >= getTitleTierRank(sovRank.titleTier)) {
      tier = getLowerTitleTier(sovRank.titleTier);
    }
  }

  const isFem = char.gender === 'female';
  if (tier === 'Emperor') return isFem ? 'Empress' : 'Emperor';
  if (tier === 'King') return isFem ? 'Queen' : 'King';
  if (tier === 'Duke') {
    if (char.title?.toLowerCase().startsWith('margrav')) return isFem ? 'Margravine' : 'Margrave';
    if (char.title?.toLowerCase().startsWith('grand duk') || char.title?.toLowerCase().startsWith('grand duch')) {
      return isFem ? 'Grand Duchess' : 'Grand Duke';
    }
    return isFem ? 'Duchess' : 'Duke';
  }
  if (tier === 'Count') {
    const county = world?.counties?.find((ct) => ct.id === char.countyId);
    const isEarlStyle =
      Boolean(county?.name.toLowerCase().startsWith('earldom')) ||
      Boolean(char.title?.toLowerCase().startsWith('earl'));
    if (isFem) return 'Countess';
    return isEarlStyle ? 'Earl' : 'Count';
  }
  if (tier === 'Baron') {
    if (char.title?.toLowerCase().includes('thane')) return 'Thane';
    if (char.title?.toLowerCase().includes('magistrate')) return 'Magistrate';
    if (char.title?.toLowerCase().includes('alderman')) return 'Alderman';
    return isFem ? 'Baroness' : 'Baron';
  }
  if (tier === 'Mayor') {
    if (char.role === 'Portmaster') return 'Portmaster';
    if (char.role === 'Guildmaster' || char.role === 'Merchant Guildmaster') return 'Guildmaster';
    return isFem ? 'Lady Mayor' : 'Mayor';
  }
  return char.role || 'Commoner';
}

export function getSocietyProfile(societyName?: string): MedievalSocietyProfile {
  const clean = (societyName || '').trim().toLowerCase();
  const exact = MEDIEVAL_SOCIETY_TYPES.find((s) => s.name.toLowerCase() === clean || s.id === clean);
  if (exact) return exact;
  return MEDIEVAL_SOCIETY_TYPES[0];
}

export const CULTURE_PRESETS = [
  {
    name: 'Valorian High Imperial',
    ethos: 'Bellicose & Chivalric',
    heritage: 'Old High Kings',
    martialTradition: 'Cataphract Vanguards & Plate Knights',
    languageGroup: 'Classical High Valorian',
    linguisticFamily: 'valorian',
    color: '#854D0E',
    firstNamesMale: ['Alden', 'Valerius', 'Theodoric', 'Cassian', 'Godfrey', 'Baldwin', 'Aurelius', 'Merrick', 'Tybalt', 'Gareth'],
    firstNamesFemale: ['Elysia', 'Gwendolyn', 'Aurelia', 'Vespera', 'Beatrix', 'Helena', 'Isolde', 'Seraphina', 'Eleanor', 'Vivienne'],
    houseNames: ['Vane', 'Aethelgard', 'Castellane', 'Montfort', 'Valerius', 'Crownshield', 'Baelor', 'Gryphonheart', 'Dragoncrest'],
    mottos: [
      'By Blade and Law',
      'The Falcon Never Stoops',
      'Unbroken by Time',
      'Golden Are Our Vows',
      'Faith Above Iron',
    ],
  },
  {
    name: 'Skaldic Fjordlanders',
    ethos: 'Stoic & Maritime',
    heritage: 'Northern Reavers',
    martialTradition: 'Longship Shieldwalls & Huskarls',
    languageGroup: 'Old Runemark',
    linguisticFamily: 'skaldic',
    color: '#0369A1',
    firstNamesMale: ['Ragnor', 'Torstein', 'Bjorn', 'Eirik', 'Sigurd', 'Halvar', 'Sven', 'Ulfgar', 'Ivar', 'Styrbjorn'],
    firstNamesFemale: ['Astrid', 'Freya', 'Sigrid', 'Hilda', 'Yrsa', 'Ingrid', 'Thyra', 'Brynhild', 'Gudrun', 'Gunnhild'],
    houseNames: ['Ironbark', 'Frostfang', 'Stormstrider', 'Ravenscar', 'Wolfborn', 'Sea-Wolf', 'Grimm', 'Bloodaxe', 'Winterborne'],
    mottos: [
      'The Sea Demands Tribute',
      'Iron in the Bone',
      'Fear No Winter',
      'Rime and Vengeance',
      'Heads High in the Gale',
    ],
  },
  {
    name: 'Qadiri Oasis Caliphate',
    ethos: 'Communal & Astrological',
    heritage: 'Dune Navigators',
    martialTradition: 'Desert Horse Archers & Mamluk Guard',
    languageGroup: 'Qadiri Script',
    linguisticFamily: 'qadiri',
    color: '#B45309',
    firstNamesMale: ['Tariq', 'Malik', 'Ziyad', 'Suleiman', 'Farhan', 'Rashid', 'Harun', 'Nizar', 'Ibrahim', 'Selim'],
    firstNamesFemale: ['Soraya', 'Yasmin', 'Fatima', 'Layla', 'Zahra', 'Samira', 'Noor', 'Amina', 'Rania', 'Dalia'],
    houseNames: ['Al-Miraj', 'Ibn-Sina', 'Suntreaders', 'Al-Rashid', 'Scorpionguard', 'Al-Mansur', 'Duneveil', 'Golden-Crescent'],
    mottos: [
      'Guided by the Constellations',
      'Water is Truth',
      'The Sand Forgives Nothing',
      'Honor in the Shade',
      'Bright as the Zenith',
    ],
  },
  {
    name: 'Sylvathi Foresters',
    ethos: 'Spiritual & Isolationist',
    heritage: 'Ancient Arbor Wardens',
    martialTradition: 'Longbow Waywatchers & Moss-Rangers',
    languageGroup: 'Sylvic Whisper',
    linguisticFamily: 'sylvathi',
    color: '#15803D',
    firstNamesMale: ['Caelum', 'Faelan', 'Aeron', 'Silvan', 'Branoc', 'Rowan', 'Eamonn', 'Garrick', 'Kaelen', 'Theron'],
    firstNamesFemale: ['Maeve', 'Rhiannon', 'Morrigan', 'Elowen', 'Niamh', 'Briar', 'Lyra', 'Fiona', 'Sylvia', 'Aisling'],
    houseNames: ['Willowbrow', 'Greenmantle', 'Oakenshield', 'Briarwood', 'Deeproot', 'Thornvale', 'Moonshadow', 'Verdant-Grip'],
    mottos: [
      'The Roots Remember',
      'Quiet as the Moss',
      'Strike Like the Gale',
      'Green Will Outlive Stone',
      'Shadow Protects the Hearth',
    ],
  },
  {
    name: 'Kharaz Iron Clan',
    ethos: 'Craftsmen & Traditionalist',
    heritage: 'Deep Hall Delvers',
    martialTradition: 'Halberd Phalanx & Siege Crossbows',
    languageGroup: 'Runic Kharazic',
    linguisticFamily: 'kharaz',
    color: '#4B5563',
    firstNamesMale: ['Krag', 'Torvald', 'Barek', 'Durgin', 'Kazador', 'Grombril', 'Thorbjorn', 'Thrain', 'Gimlar', 'Balthazar'],
    firstNamesFemale: ['Helga', 'Kari', 'Dagna', 'Valda', 'Borghild', 'Thora', 'Bera', 'Sigrun', 'Brunhilde', 'Valka'],
    houseNames: ['Ironforge', 'Coppervein', 'Stonebreaker', 'Anvilguard', 'Deepdelve', 'Goldcrest', 'Rimepeak', 'Steel-Hearth'],
    mottos: [
      'Tempered in the Fire',
      'Stand as the Crag',
      'Gold Never Rusts',
      'We Do Not Yield',
      'Oathbound to the Stone',
    ],
  },
  {
    name: 'Porphyrian Archons',
    ethos: 'Bureaucratic & Liturgical',
    heritage: 'Porphyry Theme-Lords',
    martialTradition: 'Armored Cataphracts & Greek-Fire Galleys',
    languageGroup: 'High Byzantic',
    linguisticFamily: 'byzantion',
    color: '#7E22CE',
    firstNamesMale: ['Alexios', 'Basileios', 'Nikephoros', 'Ioannes', 'Justinian', 'Manuel', 'Andronikos', 'Theodoros', 'Leon', 'Romanos'],
    firstNamesFemale: ['Theodora', 'Zoe', 'Eudoxia', 'Irene', 'Anna', 'Sophia', 'Anastasia', 'Kassandra', 'Euphemia', 'Helena'],
    houseNames: ['Komnenos', 'Palaiologos', 'Doukas', 'Phokas', 'Laskaris', 'Tzimiskes', 'Vatatzes', 'Monomachos'],
    mottos: [
      'One Throne Under Heaven',
      'Purple Endures the Storm',
      'Wisdom Guards the Walls',
      'By Charter and Flame',
      'Eternal Is the City',
    ],
  },
  {
    name: 'Altan Steppe Riders',
    ethos: 'Nomadic & Martial',
    heritage: 'Sky-Vault Horsemen',
    martialTradition: 'Horse-Archer Tumens & Heavy Lancers',
    languageGroup: 'Orkhon Steppe-Tongue',
    linguisticFamily: 'steppic',
    color: '#D97706',
    firstNamesMale: ['Temur', 'Batu', 'Altan', 'Subotai', 'Berke', 'Jebe', 'Kubilai', 'Tengri', 'Noyan', 'Khasar'],
    firstNamesFemale: ['Borte', 'Sorghaghtani', 'Khutulun', 'Altani', 'Mandukhai', 'Oelun', 'Toregene', 'Bolormaa', 'Esen', 'Chabi'],
    houseNames: ['Altan-Ordu', 'Borjigin', 'Qara-Khai', 'Suldus', 'Khori-Tumen', 'Naiman', 'Skyrider', 'Wolf-Stirrup'],
    mottos: [
      'Wide as the Blue Sky',
      'Our Walls Are Saddles',
      'Swift as the Steppe Wind',
      'The Bow Bends Not First',
      'Beneath the Eternal Vault',
    ],
  },
  {
    name: 'Ostlandic Boyar-Clans',
    ethos: 'Timbered & Resolute',
    heritage: 'River-Ford Voivodes',
    martialTradition: 'Druzhina Retinues & Axe-Infantry',
    languageGroup: 'Old Gradic',
    linguisticFamily: 'ostlandic',
    color: '#0F766E',
    firstNamesMale: ['Vladimir', 'Miroslav', 'Boleslaw', 'Jaromir', 'Svyatoslav', 'Rostislav', 'Oleg', 'Igor', 'Casimir', 'Stanislaw'],
    firstNamesFemale: ['Yaroslava', 'Milena', 'Ludmila', 'Olga', 'Zofia', 'Danuta', 'Bronislava', 'Krasna', 'Vesna', 'Jadwiga'],
    houseNames: ['Volynski', 'Galichov', 'Novgorodin', 'Chernigov', 'Sokolov', 'Medvedev', 'Berezov', 'Zlatomir'],
    mottos: [
      'Roots Deep in Winter',
      'By Oak and Broadaxe',
      'Steady at the River Ford',
      'Amber Lights the Pine',
      'Shields Locked Together',
    ],
  },
  {
    name: 'Castellaran March-Lords',
    ethos: 'Devout & Frontier-Chivalric',
    heritage: 'Sierra Reconquistadors',
    martialTradition: 'Jinete Light Horse & Military Orders',
    languageGroup: 'Iberan Romance',
    linguisticFamily: 'iberan',
    color: '#B91C1C',
    firstNamesMale: ['Alfonso', 'Rodrigo', 'Sancho', 'Fernando', 'Ramiro', 'Diego', 'Enrique', 'Lope', 'Pedro', 'Vasco'],
    firstNamesFemale: ['Isabella', 'Urraca', 'Berenguela', 'Leonor', 'Elvira', 'Blanca', 'Ines', 'Violante', 'Catalina', 'Constanza'],
    houseNames: ['de Mendoza', 'de Vega', 'de Alcazar', 'de Monteverde', 'de Toledo', 'de Santacruz', 'de Cabrera', 'de Silva'],
    mottos: [
      'Upon the Granite Ridge',
      'Lance, Cross and Banner',
      'None Pass Without Leave',
      'Steadfast as the Sierra',
      'Gold Bought With Valor',
    ],
  },
  {
    name: 'Serene Lagooners',
    ethos: 'Mercantile & Civic',
    heritage: 'Guild-Port Patricians',
    martialTradition: 'Arsenal Crossbowmen & Condottieri',
    languageGroup: 'Ligurian Vulgate',
    linguisticFamily: 'maritime',
    color: '#0E7490',
    firstNamesMale: ['Lorenzo', 'Marco', 'Dandolo', 'Niccolo', 'Bartolomeo', 'Gaspare', 'Pietro', 'Andrea', 'Domenico', 'Carlo'],
    firstNamesFemale: ['Beatrice', 'Caterina', 'Lucrezia', 'Bianca', 'Fiammetta', 'Chiara', 'Ginevra', 'Lavinia', 'Vittoria', 'Elisabetta'],
    houseNames: ['Contarini', 'Morosini', 'Foscari', 'Loredan', 'Spinola', 'Doria', 'Grimaldi', 'Visconti'],
    mottos: [
      'Every Gale Brings Coin',
      'Peace Keeps the Ledger',
      'Queen of the Narrow Seas',
      'Chartered Under Lion Wings',
      'Salt, Silk and Silver',
    ],
  },
];

export const RELIGION_PRESETS = [
  {
    name: 'The Solar Orthodoxy',
    deity: 'Sol Invictus, The Unconquered Sun',
    doctrine: 'Monotheistic, Strict Priesthood, Divine Right of Kings, Holy Inquisition',
    symbol: '☀️',
    color: '#EAB308',
  },
  {
    name: 'Covenant of the Deep Wells',
    deity: 'The Leviathan & The Sea Mother',
    doctrine: 'Dualistic, Tidal Offerings, Maritime Burials, Ancestral Oracles',
    symbol: '🌊',
    color: '#0284C7',
  },
  {
    name: 'Old Sylvan Pantheon',
    deity: 'The Horned Father & The Earth Crone',
    doctrine: 'Animist, Sacred Groves, Seasonal Blood Tithes, Spirit Communion',
    symbol: '🌿',
    color: '#16A34A',
  },
  {
    name: 'The Runic Forge Cult',
    deity: 'Vulcanus the Great Shaper',
    doctrine: 'Philosophical, Craft as Worship, Everburning Flame, Eternal Oaths',
    symbol: '⚒️',
    color: '#DC2626',
  },
  {
    name: 'Circle of the Astral Veil',
    deity: 'The Star Weavers',
    doctrine: 'Mystic, Celestial Divination, Transmigration of Souls, Asceticism',
    symbol: '✨',
    color: '#9333EA',
  },
  {
    name: 'Communion of the White Mitre',
    deity: 'The Triune Shepherd & Seven Martyrs',
    doctrine: 'Ecumenical, Mendicant Abbeys, Sanctuary Laws, Reliquary Pilgrimage',
    symbol: '✝️',
    color: '#F59E0B',
  },
  {
    name: 'Covenant of the Sapphire Crescent',
    deity: 'Al-Nur, The Architect of Meridians',
    doctrine: 'Unitarian, Scriptural Jurists, Charity Alms, Star-Calibrated Prayer',
    symbol: '☪️',
    color: '#10B981',
  },
  {
    name: 'Oath of the Eternal Blue Vault',
    deity: 'Tengri, Lord of Endless Sky & Hearth-Mother',
    doctrine: 'Sky-Animist, Kurultai Omens, Sacred White Mares, Ancestral Banners',
    symbol: '🦅',
    color: '#0EA5E9',
  },
  {
    name: 'Liturgy of the Twin Scales',
    deity: 'Asha the Radiant & Zohak of Shadow',
    doctrine: 'Dualistic, Fire Altars, Truth-Trials, Sacred Purity Laws',
    symbol: '⚖️',
    color: '#F97316',
  },
  {
    name: 'Cloister of the Weeping Bell',
    deity: 'Saint Aurelius of the Silent Vigil',
    doctrine: 'Ascetic Monasticism, Vows of Poverty, Illuminated Tomes, Bell-Hours',
    symbol: '🕯️',
    color: '#8B5CF6',
  },
];

// ============================================================================
// PROCEDURAL CULTURE & RELIGION SYNTHESIS (Unique Per Seed & Geography)
// ============================================================================

export type TerrainAffinity = 'coastal' | 'mountain' | 'forest' | 'arid' | 'steppe' | 'temperate';

interface CultureSynthesisArchetype {
  family: CulturalLinguisticFamily;
  affinities: TerrainAffinity[];
  namePrefixes: string[];
  nameSuffixes: string[];
  ethoses: string[];
  heritages: string[];
  martialTraditions: string[];
  languageTemplates: string[];
  architectureStyles: string[];
  folkloreTemplates: string[];
  customsPool: string[];
  colors: string[];
}

const CULTURE_ARCHETYPES: CultureSynthesisArchetype[] = [
  {
    family: 'valorian',
    affinities: ['temperate'],
    namePrefixes: ['High', 'Crowned', 'Golden', 'Vesper', 'Old', 'Valerian', 'Aurelian', 'Royal'],
    nameSuffixes: ['Crownfolk', 'Palatines', 'Vassal-Kin', 'Chivalrics', 'Sovereigns', 'Lowlanders', 'Banners'],
    ethoses: ['Bellicose & Chivalric', 'Law-Bound & Courtly', 'Heraldic & Ceremonial', 'Vassal-Proud & Martial'],
    heritages: ['High-Crown Ancients', 'Chartered Crown-Lords', 'Banneret Lineages', 'Tournament Dukes'],
    martialTraditions: ['Barded Lance Knights & Crossbowmen', 'Feudal Men-at-Arms & Halberdiers', 'Longbow Yeomen & Mounted Squires'],
    languageTemplates: ['High Chancery {root}', 'Courtly {root}', 'Old Demesne {root}'],
    architectureStyles: ['Vaulted Gothic Keeps & Limestone Abbeys', 'Battlemented Curtain Walls & Barbicans', 'Timbered Guildhalls & Rose-Windowed Cathedrals'],
    folkloreTemplates: ['Chivalric gestes and tournament lays sung in {lang}', 'Chronicles of sworn seven-banner oaths kept in {lang}', 'Troubadour ballads of dragons and courtly honor in {lang}'],
    customsPool: ['Hereditary Heraldry', 'Trial by Combat', 'Harvest Assizes', 'Knightly Vigil', 'Chartered Guild Fairs'],
    colors: ['#92400E', '#B45309', '#991B1B', '#7C2D12'],
  },
  {
    family: 'skaldic',
    affinities: ['coastal', 'mountain'],
    namePrefixes: ['Rime', 'Fjord', 'Storm', 'Skald', 'Salt', 'Varang', 'Ice', 'Longship'],
    nameSuffixes: ['Seafarers', 'Reavers', 'Oarsmen', 'Thing-Folk', 'Skalds', 'Marklanders'],
    ethoses: ['Stoic & Maritime', 'Fate-Driven & Bold', 'Oath-Bound & Seafaring', 'Hardy & Egalitarian'],
    heritages: ['Fjord Navigators', 'Northern Thing-Freeholders', 'Varangian Oarsmen', 'Winter-Runers'],
    martialTraditions: ['Longship Huskarls & Locked Shieldwalls', 'Daneaxe Guards & Coastal Raiders', 'Skirmishing Javelin-Crews & Seaborne Levies'],
    languageTemplates: ['Old Runemark {root}', 'Northern Fjord-{root}', 'Skaldic {root}'],
    architectureStyles: ['Steep-Pitched Stave Halls & Ringforts', 'Carved Dragon-Gable Longhouses & Slipways', 'Turf-Roofed Winter Burghs & Beacon Towers'],
    folkloreTemplates: ['Alliterative Eddic sagas chanted beside mead-hearths in {lang}', 'Runestone epitaphs and sea-king lays in {lang}', 'Winter-night riddle contests spoken in {lang}'],
    customsPool: ['Allthing Assemblies', 'Wergild Blood-Fines', 'Runestone Carvings', 'Oar-Thole Oaths', 'Yule Blot Feasts'],
    colors: ['#0369A1', '#1E40AF', '#0F766E', '#334155'],
  },
  {
    family: 'qadiri',
    affinities: ['arid'],
    namePrefixes: ['Qadiri', 'Zirid', 'Saffron', 'Zenith', 'Al-Miraj', 'Crescent', 'Oasis', 'Dune'],
    nameSuffixes: ['Astronomers', 'Caravaneers', 'Caliphates', 'Scribes', 'Horsemen', 'Gardeners'],
    ethoses: ['Scholarly & Astrological', 'Hospitality-Bound & Mercantile', 'Geometric & Devout', 'Poetic & Stoic'],
    heritages: ['Dune Meridian-Mappers', 'Qanat Builders', 'Silk-Caravan Princes', 'Astrolabe Sages'],
    martialTraditions: ['Mamluk Lancers & Composite Horse-Archers', 'Oasis Camel-Scouts & Damascus Swordsmen', 'Towering Gate-Guards & Desert Outriders'],
    languageTemplates: ['Classical {root} Script', 'Oasis {root} Canticle', 'Courtly {root} Verse'],
    architectureStyles: ['Domed Caravanserais & Striped Muqarnas Arches', 'Wind-Catching Mudbrick Citadels & Courtyards', 'Tiled Madrasas & Terraced Citrus Gardens'],
    folkloreTemplates: ['Star-chart parables and desert hospitality tales in {lang}', 'Rhyming qasida epics recited at oasis wells in {lang}', 'Alchemical and astronomical treatises penned in {lang}'],
    customsPool: ['Qanat Water-Sharing', 'Astrolabe Timekeeping', 'Sacred Guest Sanctuary', 'Calligraphic Coinage', 'Silk Souk Charters'],
    colors: ['#D97706', '#CA8A04', '#C2410C', '#059669'],
  },
  {
    family: 'sylvathi',
    affinities: ['forest'],
    namePrefixes: ['Verdant', 'Briar', 'Glen', 'Arbor', 'Cael', 'Mist', 'Thorn', 'Moss'],
    nameSuffixes: ['Wardens', 'Glenfolk', 'Druid-Kin', 'Stalkers', 'Bough-Clans', 'Vale-Watch'],
    ethoses: ['Spiritual & Sylvan', 'Oral-Tradition & Vigilant', 'Kin-Loyal & Secluded', 'Animist & Poetic'],
    heritages: ['Elder-Grove Keepers', 'Misty Glen Septs', 'Yew-Bow Wardens', 'Standing-Stone Elders'],
    martialTraditions: ['Yew-Longbow Ambushes & Moss-Stalkers', 'Chariot-Spearmen & Thicket-Guards', 'Wolfhound Scouts & Green-Cloaked Rangers'],
    languageTemplates: ['Sylvic Whisper-{root}', 'Old Brythonic {root}', 'Grove-Cant {root}'],
    architectureStyles: ['Moss-Grown Brochs & Ring-Ditched Hills', 'Living-Oak Shrines & Timber Palisades', 'Thatched Roundhalls & Standing-Stone Circles'],
    folkloreTemplates: ['Harp-sung lays of seasonal equinoxes and forest spirits in {lang}', 'Oral genealogies memorized by wandering bards in {lang}', 'Herbal lore and green-knight parables in {lang}'],
    customsPool: ['Brehon Oath-Courts', 'Equinox Bonfires', 'Sacred Oak Sanctuary', 'Harp-Bard Guilds', 'Grove Boundary Stones'],
    colors: ['#15803D', '#166534', '#4D7C0F', '#047857'],
  },
  {
    family: 'kharaz',
    affinities: ['mountain'],
    namePrefixes: ['Kharaz', 'Anvil', 'Crag', 'Granite', 'Deep-Hold', 'Ironvein', 'Rimepeak', 'Basalt'],
    nameSuffixes: ['Delvers', 'Smith-Clans', 'Stonewardens', 'Pass-Keepers', 'Guildsmen', 'Hammers'],
    ethoses: ['Artisan & Traditionalist', 'Oath-Graven & Unyielding', 'Guild-Strict & Ancestral', 'Frugal & Vigilant'],
    heritages: ['Deep-Vein Miners', 'Crag-Bridge Masons', 'Runic Smelters', 'High-Pass Wardens'],
    martialTraditions: ['Pike-Wall Phalanxes & Heavy Pavise Crossbows', 'Iron-Maul Pioneers & Mountain Sappers', 'Armored Gate-Breakers & Cliff-Scouts'],
    languageTemplates: ['Chiseled {root}', 'Highland {root}', 'Forge-Runic {root}'],
    architectureStyles: ['Cyclopean Ashlar Bastions & Vaulted Mines', 'Switchback Mountain Viaducts & Granite Keeps', 'Stepped Slate Townships & Smelter Towers'],
    folkloreTemplates: ['Hammer-cadence smithing hymns carved on stone in {lang}', 'Guild-roll lineages of master architects in {lang}', 'Mountain-pass siege chronicles preserved in {lang}'],
    customsPool: ['Hallmark Guild Seals', 'Ancestor Stone Tablets', 'Pass-Toll Charters', 'Everburning Hearth Fires', 'Apprentice Masterworks'],
    colors: ['#4B5563', '#57534E', '#78350F', '#374151'],
  },
  {
    family: 'byzantion',
    affinities: ['temperate', 'coastal'],
    namePrefixes: ['Porphyry', 'Basil', 'Aureo', 'Theme', 'Archon', 'Marble', 'Byzantic', 'Laurel'],
    nameSuffixes: ['Archons', 'Themes', 'Legions', 'Logothetes', 'Exarchs', 'Citizens'],
    ethoses: ['Bureaucratic & Liturgical', 'Cosmopolitan & Ceremonial', 'Legalistic & Diplomatic', 'Scholarly & Imperial'],
    heritages: ['Imperial Chrysobulls', 'Golden-Horn Admirals', 'Law-Codex Jurists', 'Basilica Mosaicists'],
    martialTraditions: ['Armored Cataphracts & Skutatoi Spear-Blocks', 'Greek-Fire Dromon Fleets & Varangian Retainers', 'Border Akritai & Composite Archers'],
    languageTemplates: ['High {root} Chancery', 'Liturgical {root}', 'Imperial {root}'],
    architectureStyles: ['Pendentive Domes & Polychrome Marble Basilicas', 'Triple-Moated Land Walls & Cisterns', 'Tiled Aqueducts & Mosaic-Lined Palaces'],
    folkloreTemplates: ['Chronographia court histories and theological disputations in {lang}', 'Hippodrome acclamations and saint-lives illuminated in {lang}', 'Tactical manuals and imperial orations in {lang}'],
    customsPool: ['Theme Land-Grants', 'Imperial Silk Monopolies', 'Gold Solidus Standard', 'Ecumenical Synods', 'Civic Chariot Factions'],
    colors: ['#7E22CE', '#6D28D9', '#9D174D', '#A21CAF'],
  },
  {
    family: 'steppic',
    affinities: ['steppe', 'arid'],
    namePrefixes: ['Altan', 'Qara', 'Orkhon', 'Blue-Sky', 'Falcon', 'Tumen', 'Kipchak', 'Steppe'],
    nameSuffixes: ['Riders', 'Hordes', 'Arrow-Clans', 'Kurultai', 'Nomads', 'Yurt-Folk'],
    ethoses: ['Equestrian & Expansive', 'Meritocratic & Martial', 'Pastoral & Tolerant', 'Swift & Oath-Bound'],
    heritages: ['Eternal-Sky Tumens', 'Kurultai Electors', 'Relay-Post Riders', 'Falconer Khans'],
    martialTraditions: ['Feigned-Retreat Horse Archers & Heavy Stirrup Lancers', 'Decimal Tumen Columns & Siege Engineers', 'Scout Relay Outriders & Lasso-Catchers'],
    languageTemplates: ['Orkhon {root}', 'Highland Steppe-{root}', 'Kurai {root}'],
    architectureStyles: ['Painted Felt Yurts & Timbered Ordu-Towns', 'Stone Kurgan Mounds & Relay Caravanserais', 'Mobile Royal Pavilions & Steppe Wells'],
    folkloreTemplates: ['Throat-sung horse-head fiddle epics recited at campfires in {lang}', 'Kurultai hunting laws and ancestor legends in {lang}', 'Sky-omen verses memorized by shamans in {lang}'],
    customsPool: ['Kurultai Succession Moots', 'Yam Relay Horses', 'Religious Immunity Seals', 'Great Autumn Hunt', 'Milk-Wine Libations'],
    colors: ['#B45309', '#CA8A04', '#0284C7', '#65A30D'],
  },
  {
    family: 'ostlandic',
    affinities: ['temperate', 'forest'],
    namePrefixes: ['Ostland', 'Grad', 'Amber', 'Birch', 'Boyar', 'Volyn', 'Snowpine', 'Dnieper'],
    nameSuffixes: ['Voivodes', 'Boyars', 'Timberfolk', 'River-Clans', 'Druzhinas', 'Plowmen'],
    ethoses: ['Resolute & Communal', 'Timber-Crafted & Orthodox', 'River-Mercantile & Martial', 'Winter-Hardened & Stoic'],
    heritages: ['River-Portage Princes', 'Fur-Tribute Towns', 'Boyar Duma Houses', 'Birch-Forest Pioneers'],
    martialTraditions: ['Druzhina Heavy Cavalry & Poleaxe Militia', 'River-Barge Raiders & Winter Pelt-Scouts', 'Sled-Borne Crossbows & Palatine Retinues'],
    languageTemplates: ['Old Gradic {root}', 'Riverine {root}', 'Boyar {root}'],
    architectureStyles: ['Onion-Domed Timber Churches & Whitewashed Kremlins', 'Log-Palisade Ostrogs & Painted Boyar Terems', 'Boardwalk River Wharves & Granary Towers'],
    folkloreTemplates: ['Bylina heroic chants of bogatyrs sung to gusli harps in {lang}', 'Monastery chronicles written on birch-bark in {lang}', 'Winter-hearth tales of amber forests in {lang}'],
    customsPool: ['Veche Town Assemblies', 'Birch-Bark Charters', 'Fur-Pelt Tribute', 'Boyar Duma Ranks', 'River Portage Tolls'],
    colors: ['#0F766E', '#15803D', '#1D4ED8', '#991B1B'],
  },
  {
    family: 'iberan',
    affinities: ['mountain', 'arid', 'temperate'],
    namePrefixes: ['Castellaran', 'Sierra', 'Alcazar', 'Sun-Cross', 'Red-Mesa', 'Hidalgo', 'Cruz', 'Vega'],
    nameSuffixes: ['Marchers', 'Hidalgos', 'Crusaders', 'Vanguard', 'Caballeros', 'Rangers'],
    ethoses: ['Zealous & Frontier-Proud', 'Chivalric & Austere', 'Chartered-Town & Martial', 'Honor-Bound & Resolute'],
    heritages: ['Border-Tower Orders', 'Mountain Kingdom Heirs', 'Chartered Fueros', 'Saffron-Valley Lords'],
    martialTraditions: ['Jinete Skirmish Cavalry & Armored Caballeros', 'Tercio-Precursor Pikemen & Steel Buckler Infantry', 'Fortress Crossbowmen & Military Orders'],
    languageTemplates: ['Sierra {root} Romance', 'Chancery {root}', 'Marcher {root}'],
    architectureStyles: ['Sun-Baked Stone Alcazars & Plateresque Abbeys', 'Hilltop Watchtowers & Romanesque Cloisters', 'Terraced Olive Estates & Arcaded Plazas'],
    folkloreTemplates: ['Frontier cantares of siege heroism chanted in {lang}', 'Monastic chronicles of mountain reconquests in {lang}', 'Knightly trovas and border ballads in {lang}'],
    customsPool: ['Municipal Fueros Charters', 'Military-Monastic Orders', 'Transhumance Flock Guilds', 'Border Watch Beacons', 'Duel of Honor'],
    colors: ['#B91C1C', '#DC2626', '#B45309', '#7C2D12'],
  },
  {
    family: 'maritime',
    affinities: ['coastal'],
    namePrefixes: ['Serene', 'Lagoon', 'Corsair', 'Pelagic', 'Thalassic', 'Sovereign-Port', 'Lido', 'Coral'],
    nameSuffixes: ['Merchants', 'Navigators', 'Patricians', 'Corsairs', 'Syndics', 'Mariners'],
    ethoses: ['Mercantile & Diplomatic', 'Urban & Factional', 'Naval & Opportunistic', 'Patronage & Civic'],
    heritages: ['Chartered Guild-Ports', 'Sea-Bank Financiers', 'Galley Arsenal Masters', 'Island Factoria'],
    martialTraditions: ['War-Galley Ram Fleets & Marine Crossbowmen', 'Hired Condottieri Pike Companies', 'Harbor Chain Boom Guards & Signal Brigs'],
    languageTemplates: ['Harbor {root} Vulgate', 'Admiralty {root}', 'Patrician {root}'],
    architectureStyles: ['Marble Palazzo Canals & Campanile Towers', 'Sea-Walled Arsenals & Loggia Exchanges', 'Lantern Lighthouses & Vaulted Warehouses'],
    folkloreTemplates: ['Portolan sea-charts and merchant-captain logs written in {lang}', 'Carnival satires and guild-banquet lays in {lang}', 'Maritime saints\' legends sung along quays in {lang}'],
    customsPool: ['Notarized Sea-Loans', 'Grand Council Ballots', 'Arsenal Shipyards', 'Consular Trade Quarters', 'Quarantine Harbor Laws'],
    colors: ['#0E7490', '#0284C7', '#0D9488', '#BE123C'],
  },
];

export function synthesizeProceduralCultures(
  count: number,
  prng: PRNG,
  dominantAffinities: TerrainAffinity[],
  moddedCultures: Array<(typeof CULTURE_PRESETS)[number]> = []
): Culture[] {
  const result: Culture[] = [];
  const usedNames = new Set<string>();
  const usedColors = new Set<string>();

  // 1. Honor any user-modded custom cultures first
  for (const mc of moddedCultures) {
    if (result.length >= count) break;
    usedNames.add(mc.name.toLowerCase());
    usedColors.add(mc.color.toLowerCase());
    result.push({
      id: `culture_${result.length + 1}`,
      name: mc.name,
      ethos: mc.ethos,
      heritage: mc.heritage,
      folklore: `Traditional epics and court lays in ${mc.languageGroup}`,
      languageGroup: mc.languageGroup,
      linguisticFamily: (mc as { linguisticFamily?: string }).linguisticFamily || resolveLinguisticFamily(mc.name),
      martialTradition: mc.martialTradition,
      color: mc.color,
      burgPrefixes: BURG_PREFIXES,
      burgSuffixes: BURG_SUFFIXES,
    });
  }

  // 2. Weight & diversify archetypes by world geography, guaranteeing fresh cultural families
  const prioritized = [...CULTURE_ARCHETYPES].sort((a, b) => {
    const scoreA = a.affinities.filter((af) => dominantAffinities.includes(af)).length + prng.next() * 2.2;
    const scoreB = b.affinities.filter((af) => dominantAffinities.includes(af)).length + prng.next() * 2.2;
    return scoreB - scoreA;
  });

  const rootsByFamily: Record<CulturalLinguisticFamily, string[]> = {
    valorian: ['Aurelian', 'Castellan', 'Valerian', 'Corvani', 'Montfort', 'Bellamy', 'Solarian', 'Draken', 'Vesper', 'Lorian'],
    skaldic: ['Skald', 'Varang', 'Hrim', 'Norr', 'Kald', 'Jotun', 'Fjord', 'Valkyr', 'Sval', 'Ulf'],
    qadiri: ['Qadiri', 'Zirid', 'Saffron', 'Al-Miraj', 'Kufic', 'Marid', 'Tarim', 'Sahar', 'Shabaz', 'Qasr'],
    sylvathi: ['Sylvic', 'Brython', 'Cael', 'Elowen', 'Fael', 'Rhian', 'Briar', 'Glyn', 'Nym', 'Torin'],
    kharaz: ['Kharaz', 'Durn', 'Karak', 'Kazad', 'Thar', 'Grim', 'Anvil', 'Balgor', 'Cairn', 'Grom'],
    byzantion: ['Porphyrian', 'Byzantic', 'Thessalan', 'Nikaean', 'Trapezic', 'Komnenian', 'Basilic', 'Chalkid', 'Mystran', 'Rhodian'],
    steppic: ['Altan', 'Orkhon', 'Kipchak', 'Batu', 'Tenger', 'Suldus', 'Naiman', 'Khazar', 'Oirat', 'Sarai'],
    ostlandic: ['Ostland', 'Gradic', 'Volynian', 'Galician', 'Novgorodian', 'Polotsk', 'Moravic', 'Chernigov', 'Smolen', 'Brest'],
    iberan: ['Castellaran', 'Navarran', 'Toledan', 'Zaragan', 'Alcantaran', 'Cabreran', 'Zamoran', 'Cordoban', 'Leones', 'Aragoran'],
    maritime: ['Venedran', 'Genovan', 'Ragusian', 'Amalfi', 'Pelagic', 'Zaran', 'Candian', 'Coralli', 'Dalmat', 'Pisan'],
  };

  let idx = 0;
  let guard = 0;
  while (result.length < count && guard < 40) {
    guard++;
    const arch = prioritized[idx % prioritized.length];
    idx++;

    const rootPool = rootsByFamily[arch.family];
    const root = prng.pick(rootPool);
    const prefix = prng.pick(arch.namePrefixes);
    const suffix = prng.pick(arch.nameSuffixes);
    const candidateName =
      prng.next() < 0.52
        ? `${root} ${suffix}`
        : prefix.toLowerCase() === root.toLowerCase()
        ? `${root} ${suffix}`
        : `${prefix} ${root}`;

    if (usedNames.has(candidateName.toLowerCase())) continue;
    usedNames.add(candidateName.toLowerCase());

    const languageGroup = prng.pick(arch.languageTemplates).replace('{root}', root);
    const ethos = prng.pick(arch.ethoses);
    const heritage = prng.pick(arch.heritages);
    const martialTradition = prng.pick(arch.martialTraditions);
    const architectureStyle = prng.pick(arch.architectureStyles);
    const folklore = prng.pick(arch.folkloreTemplates).replace('{lang}', languageGroup);
    const customs = prngShuffle([...arch.customsPool], prng).slice(0, 3);

    const fallbackPalette = ['#92400E', '#0369A1', '#B45309', '#15803D', '#4B5563', '#7E22CE', '#0F766E', '#B91C1C', '#0E7490', '#CA8A04'];
    const color =
      arch.colors.find((c) => !usedColors.has(c.toLowerCase())) ||
      fallbackPalette.find((c) => !usedColors.has(c.toLowerCase())) ||
      arch.colors[0];
    usedColors.add(color.toLowerCase());

    result.push({
      id: `culture_${result.length + 1}`,
      name: candidateName,
      ethos,
      heritage,
      folklore,
      languageGroup,
      linguisticFamily: arch.family,
      martialTradition,
      architectureStyle,
      customs,
      color,
      burgPrefixes: BURG_PREFIXES,
      burgSuffixes: BURG_SUFFIXES,
    });
  }

  return result;
}

interface ReligionSynthesisArchetype {
  family: string;
  affinities: TerrainAffinity[];
  nameTemplates: string[];
  deityNames: string[];
  deityTitles: string[];
  clergyTitles: string[];
  sacredTextPrefixes: string[];
  sacredTextNouns: string[];
  tenetsPool: string[];
  mythTemplates: string[];
  pilgrimageRites: string[];
  symbols: string[];
  colors: string[];
  zealousnessRange: [number, number];
}

const RELIGION_ARCHETYPES: ReligionSynthesisArchetype[] = [
  {
    family: 'Solar & Celestial Monotheism',
    affinities: ['temperate', 'arid'],
    nameTemplates: ['The {adj} Orthodoxy', 'Church of the {noun}', 'Order of the {adj} Dawn', 'Sovereign Rite of {deity}'],
    deityNames: ['Sol Invictus', 'Aureon', 'Helios', 'Solael', 'The Undying Radiance', 'Elion'],
    deityTitles: ['The Unconquered Sun', 'Sovereign of the Firmament', 'Lord of Sacred Fire', 'The Gilded Judge'],
    clergyTitles: ['Archbishop', 'Solar Primate', 'Grand Prelate', 'High Canon'],
    sacredTextPrefixes: ['Codex', 'Lectionary', 'Canticles', 'Testament'],
    sacredTextNouns: ['of Noon', 'of the Seven Rays', 'of the Zenith', 'of Eternal Dawn'],
    tenetsPool: ['Monotheistic Orthodoxy', 'Divine Right of Anointed Kings', 'Strict Cathedral Hierarchy', 'Armed Pilgrimage', 'Liturgical Tithes', 'Solar Fasting'],
    mythTemplates: [
      'When cold darkness drowned the primal sea, {deity} forged the sky-vault with a single lance of noon-fire and bequeathed the {text} to seven shepherd-kings.',
      'Upon the Golden Mountain, {deity} crowned the first anointed mortal with sunlight, binding kings to uphold justice lest the sun eclipse forever.',
    ],
    pilgrimageRites: ['Barefoot Dawn Ascent to the High Basilica', 'Votive Tapers Lit at Solstice Vigil'],
    symbols: ['☀️', '🔆', '👑', '⚜️'],
    colors: ['#EAB308', '#D97706', '#F59E0B', '#CA8A04'],
    zealousnessRange: [60, 88],
  },
  {
    family: 'Ecumenical Saintly Church',
    affinities: ['temperate', 'mountain'],
    nameTemplates: ['Communion of {noun}', 'Synod of the {adj} Mitre', 'Apostolic Rite of {noun}', 'Fellowship of {deity}'],
    deityNames: ['The Triune Shepherd', 'Saint Aurelius', 'The Eternal Logos', 'Saint Cassian'],
    deityTitles: ['Keeper of the Keys', 'Shepherd of Souls', 'Martyr of the Stone Bridge', 'Architect of Mercy'],
    clergyTitles: ['Archbishop', 'Patriarch', 'Cardinal-Legate', 'Mitred Abbot'],
    sacredTextPrefixes: ['Acts', 'Canon', 'Psalter', 'Epistles'],
    sacredTextNouns: ['of the Martyrs', 'of the Bell-Hours', 'of Charity', 'of the Conciliar Seal'],
    tenetsPool: ['Canon Law Courts', 'Mendicant Abbeys', 'Reliquary Veneration', 'Sanctuary of Altars', 'Vows of Celibacy', 'Charity Alms'],
    mythTemplates: [
      'At the breaking of the Iron Age, {deity} walked barefoot between warring armies, ringing a cracked bronze bell whose echo turned drawn blades into plowshares, recorded in {text}.',
      'Seven martyrs carried the unbroken chalice across flooded valleys while {deity} parted storm-clouds until the first stone sanctuary rose.',
    ],
    pilgrimageRites: ['Seven-Shrine Wayfarer Walk Carrying Oak Staves', 'Veneration of Martyred Relics at All-Saints Vigil'],
    symbols: ['✝️', '🕊️', '🗝️', '🕯️'],
    colors: ['#F59E0B', '#B45309', '#9333EA', '#E11D48'],
    zealousnessRange: [55, 82],
  },
  {
    family: 'Prophetic Meridian Unitarianism',
    affinities: ['arid', 'coastal'],
    nameTemplates: ['Covenant of {noun}', 'Reciters of the {adj} Seal', 'Way of the {noun}', 'House of {deity}'],
    deityNames: ['Al-Nur', 'Al-Haqq', 'The Unseen Architect', 'Qadir the First'],
    deityTitles: ['Master of Meridians', 'The Compassionate Witness', 'Light Beyond Stars', 'Lord of Living Springs'],
    clergyTitles: ['Grand Qadi', 'Mufti-Elder', 'Chief Imam', 'Keeper of the Mihrab'],
    sacredTextPrefixes: ['Tablets', 'Recitations', 'Scrolls', 'Almanac'],
    sacredTextNouns: ['of the Straight Path', 'of Night Stars', 'of Living Water', 'of Just Scales'],
    tenetsPool: ['Strict Unitarianism', 'Jurist Courts', 'Astronomical Prayer Hours', 'Mandatory Alms-Tithe', 'Sacred Guest Sanctuary', 'Iconoclasm'],
    mythTemplates: [
      'In the breathless night of the Great Erg, {deity} revealed the seventy-seven verses of {text} upon sapphire stone beside an unfailing spring.',
      'When caravan routes were lost in dust storms, {deity} set the guiding zenith-stars in place and bound every tribe under common justice.',
    ],
    pilgrimageRites: ['Desert Caravan Trek to the Mother Oasis', 'Night-Watch Recitation Under the New Crescent'],
    symbols: ['☪️', '🌙', '⭐', '🧭'],
    colors: ['#10B981', '#059669', '#0D9488', '#D97706'],
    zealousnessRange: [58, 85],
  },
  {
    family: 'Maritime & Abyssal Mystery',
    affinities: ['coastal'],
    nameTemplates: ['Covenant of {noun}', 'Brethren of the {adj} Tide', 'Oracles of {deity}', 'Guild-Cult of {noun}'],
    deityNames: ['The Sea Mother', 'Pelagos', 'Nereia', 'The Brine Leviathan', 'Thalassa'],
    deityTitles: ['Mistress of the Tides', 'Sovereign of Deep Trenches', 'Binder of Gales', 'Guardian of Anchors'],
    clergyTitles: ['Tide-Oracle', 'Harbor Hierophant', 'Sea-Cantor', 'Wave-Bishop'],
    sacredTextPrefixes: ['Logs', 'Canticle', 'Charts', 'Litany'],
    sacredTextNouns: ['of the Seven Currents', 'of Salt & Foam', 'of Submerged Bells', 'of the Compass Rose'],
    tenetsPool: ['Tidal Offerings', 'Maritime Burials', 'Admiralty Oath-Keeping', 'Beacon Sanctuaries', 'Syncretic Port Tolerance', 'Saltwater Baptism'],
    mythTemplates: [
      'Before any dry shore rose from the foam, {deity} sang the drowned continents into coral reefs, inscribing safe passages in {text}.',
      'Seven shipwrights survived the Forty-Day Gale by casting silver astrolabes into the waves; in answer, {deity} lifted their flagship to found the first harbor shrine.',
    ],
    pilgrimageRites: ['Lantern-Boat Procession at Spring Equinox Tide', 'Sinking Inscribed Copper Anchors Beyond the Harbor Bar'],
    symbols: ['🌊', '🔱', '🐚', '⚓'],
    colors: ['#0284C7', '#0E7490', '#1D4ED8', '#0891B2'],
    zealousnessRange: [30, 58],
  },
  {
    family: 'Sylvan & Animist Druidry',
    affinities: ['forest'],
    nameTemplates: ['Old {adj} Circle', 'Veneration of {noun}', 'Grove-Rite of {deity}', 'Bough-Covenant of {noun}'],
    deityNames: ['The Horned Father', 'Danu the Earth-Crone', 'Cernunnos', 'The Elder Willow', 'Sylvaen'],
    deityTitles: ['Lord of Antlers & Moss', 'Weaver of Seasons', 'First of the Deep Roots', 'Watcher of Stag-Paths'],
    clergyTitles: ['Archdruid', 'Grove-Hierophant', 'Elder Bard', 'Oaken Seer'],
    sacredTextPrefixes: ['Ogham', 'Oral Lore', 'Seasons', 'Whispers'],
    sacredTextNouns: ['of the Four Winds', 'of the Sacred Mist', 'of Ancient Boughs', 'of Antler & Stone'],
    tenetsPool: ['Sacred Groves Protected', 'Solstice Libations', 'Spirit Communion', 'Syncretic Nature-Law', 'Oral Lorekeeping', 'Ritual Hunting Taboos'],
    mythTemplates: [
      '{deity} wept green rain over barren slate until moss, oak, and stag sprang forth together, binding humankind to guard the elder woods per {text}.',
      'The first druid carved the calendar onto a lightning-struck yew after {deity} walked through winter frost leaving blooming hawthorn behind.',
    ],
    pilgrimageRites: ['Silent Solstice Vigil Among Standing Stones', 'Wreathing Ancient Oaks with Woven Reed Charms'],
    symbols: ['🌿', '🌳', '🦌', '🍃'],
    colors: ['#16A34A', '#15803D', '#4D7C0F', '#22C55E'],
    zealousnessRange: [32, 60],
  },
  {
    family: 'Dualistic Light & Shadow Creed',
    affinities: ['mountain', 'arid', 'temperate'],
    nameTemplates: ['Creed of {noun}', 'Liturgy of the {adj} Flame', 'Order of {deity}', 'Dual Covenant of {noun}'],
    deityNames: ['Asha the Radiant', 'Ahura-Mazd', 'Vespera & Dawn', 'The Twin Watchers', 'Ormazd'],
    deityTitles: ['Lord of Uncreated Light', 'Judge of Truth & Falsehood', 'Keeper of Sacred Hearths', 'Balancer of Worlds'],
    clergyTitles: ['High Magus', 'Flame-Prelate', 'Dastur Elder', 'Canon of the Scales'],
    sacredTextPrefixes: ['Avesta', 'Hymns', 'Scrolls', 'Book'],
    sacredTextNouns: ['of Fire & Ash', 'of the Twin Scales', 'of Truth', 'of the Seventh Gate'],
    tenetsPool: ['Cosmic Dualism', 'Everburning Fire Altars', 'Trial by Ordeal', 'Absolute Truthfulness', 'Sky-Tower Burials', 'Purity Ordinances'],
    mythTemplates: [
      'From the first spark came Truth, and from its shadow came Deceit; {deity} set the eternal hearth-altar between them as told in {text}.',
      'For three thousand winters Light and Shadow clashed upon the World-Ridge until {deity} forged the Bronze Scales of mortal conscience.',
    ],
    pilgrimageRites: ['Bearing Live Embers Between Mountain Fire-Temples', 'Dawn Purification at Running Mountain Springs'],
    symbols: ['⚖️', '🔥', '☀️', '🕯️'],
    colors: ['#F97316', '#EA580C', '#DC2626', '#EAB308'],
    zealousnessRange: [50, 78],
  },
  {
    family: 'Forge, Hearth & Stone Craft-Piety',
    affinities: ['mountain'],
    nameTemplates: ['Runic {adj} Cult', 'Brotherhood of {noun}', 'Anvil-Creed of {deity}', 'Hearth-Law of {noun}'],
    deityNames: ['Vulcanus', 'Aule-Khazad', 'The Great Shaper', 'Brigid of the Hearth', 'Surt-Vard'],
    deityTitles: ['Master of the First Anvil', 'Shaper of Peaks', 'Keeper of Undying Coals', 'Patron of Honest Steel'],
    clergyTitles: ['Grand Forge-Cantor', 'Anvil-Prelate', 'Stone-Hierophant', 'Master Hearth-Priest'],
    sacredTextPrefixes: ['Ledger', 'Runes', 'Manual', 'Sagas'],
    sacredTextNouns: ['of Tempered Iron', 'of the Deep Chisel', 'of Guild Oaths', 'of Unbroken Stone'],
    tenetsPool: ['Craft as Worship', 'Everburning Guild Hearths', 'Unbreakable Oath-Slates', 'Stone-Vault Ancestor Honors', 'Hospitality of Bread & Salt'],
    mythTemplates: [
      '{deity} hammered the raw continents flat upon a cosmic anvil and taught the first masons to bind archways without mortar in {text}.',
      'When winter froze every river, {deity} struck flint against granite, hiding embers inside mountain seams so mortal smiths might endure.',
    ],
    pilgrimageRites: ['Forging a Pilgrimage Nail at the Mother Sanctuary Anvil', 'Carving Family Marks into the Great Quarry Pillar'],
    symbols: ['⚒️', '🛡️', '🔥', '⛰️'],
    colors: ['#DC2626', '#991B1B', '#78350F', '#64748B'],
    zealousnessRange: [38, 65],
  },
  {
    family: 'Sky-Father & Ancestral Tengriism',
    affinities: ['steppe'],
    nameTemplates: ['Oath of {noun}', 'Sky-Rite of {deity}', 'Tumen-Faith of {noun}', 'Banner-Cult of {deity}'],
    deityNames: ['Tengri', 'Kok-Munkh', 'The Blue Vault', 'Umai the Hearth-Mother', 'Erlik-Judge'],
    deityTitles: ['Lord of Endless Sky', 'Watcher Over Saddles', 'Giver of Wind & Thunder', 'Protector of Clans'],
    clergyTitles: ['Grand Shaman', 'Sky-Seer', 'Beki Elder', 'Banner-Oracle'],
    sacredTextPrefixes: ['Yassa', 'Chants', 'Chronicle', 'Oracles'],
    sacredTextNouns: ['of the Blue Heaven', 'of the White Mare', 'of Sacred Banners', 'of the Steppe Wind'],
    tenetsPool: ['Syncretic Tolerance of Foreign Faiths', 'Horse-Sacrifice Omens', 'Sacred Ancestor Standards', 'Kurultai Divination', 'Sky-Burial on High Crags'],
    mythTemplates: [
      'A grey wolf and a fallow doe crossed the endless grass under the gaze of {deity}, birthing the clans whose oaths are kept in {text}.',
      'Lightning split the sacred birch upon the Kurultai hill, revealing the iron banner of {deity} that grants victory to united horse-lords.',
    ],
    pilgrimageRites: ['Tying Silk Ribbons to High Cairn Passes', 'White-Mare Libation at the Great Midsummer Kurultai'],
    symbols: ['🦅', '🏹', '🐎', '☀️'],
    colors: ['#0EA5E9', '#0284C7', '#D97706', '#65A30D'],
    zealousnessRange: [22, 48],
  },
  {
    family: 'Cloistered & Astral Mysticism',
    affinities: ['temperate', 'mountain', 'forest'],
    nameTemplates: ['Circle of {noun}', 'Cloister of the {adj} Bell', 'Vigil of {deity}', 'Confraternity of {noun}'],
    deityNames: ['The Star Weavers', 'Sophia-Logos', 'The Silent Watcher', 'Lady of the Seventh Veil'],
    deityTitles: ['Keeper of Hidden Harmonies', 'Mistress of Bells & Stars', 'Guardian of Contemplation', 'Silent Judge'],
    clergyTitles: ['Archimandrite', 'Prior-Astronomer', 'Cloister Elder', 'High Canticle'],
    sacredTextPrefixes: ['Horologion', 'Treatises', 'Glosses', 'Visions'],
    sacredTextNouns: ['of the Astral Veil', 'of Contemplative Silence', 'of the Harmonic Spheres', 'of Penitence'],
    tenetsPool: ['Ascetic Monasticism', 'Celestial Augury', 'Scriptoria Preservation', 'Transmigration of Souls', 'Pacifist Sanctuary', 'Night Bell Vigils'],
    mythTemplates: [
      'During the Night of Three Comets, seven anchorites heard the crystal spheres turn in silence and transcribed {text} by candlelight.',
      '{deity} spun silver threads from starlight to anchor straying souls back toward the mountain monastery above the clouds.',
    ],
    pilgrimageRites: ['Three-Day Silent Retreat in Cliffside Hermitages', 'Copying a Illuminated Psalm at the Mother Scriptorium'],
    symbols: ['✨', '🕯️', '🔮', '🕊️'],
    colors: ['#9333EA', '#7E22CE', '#6366F1', '#4F46E5'],
    zealousnessRange: [35, 68],
  },
];

const RELIGION_ADJECTIVES = ['Aurelian', 'Sacred', 'Undying', 'Silver', 'Iron', 'Midnight', 'Sapphire', 'Radiant', 'Crimson', 'Verdant', 'Ancient', 'Sovereign', 'Cloistered', 'Seraphic', 'Sevenfold'];
const RELIGION_NOUNS = ['Dawn', 'Firmament', 'Veil', 'Crown', 'Wellspring', 'Chalice', 'Pillars', 'Vigil', 'Bell', 'Anvil', 'Meridian', 'Grove', 'Covenant', 'Scales', 'Horizon'];

export function synthesizeProceduralReligions(
  count: number,
  prng: PRNG,
  dominantAffinities: TerrainAffinity[],
  moddedReligions: Array<(typeof RELIGION_PRESETS)[number]> = []
): Religion[] {
  const result: Religion[] = [];
  const usedNames = new Set<string>();
  const usedColors = new Set<string>();
  const usedSymbols = new Set<string>();

  // 1. Honor user-modded custom religions first
  for (const mr of moddedReligions) {
    if (result.length >= count) break;
    usedNames.add(mr.name.toLowerCase());
    usedColors.add(mr.color.toLowerCase());
    usedSymbols.add(mr.symbol);
    result.push({
      id: `religion_${result.length + 1}`,
      name: mr.name,
      deity: mr.deity,
      doctrine: mr.doctrine,
      sacredMyth: `Ancient testament of ${mr.deity} handed down through consecrated temples.`,
      holySiteBurgId: '',
      symbol: mr.symbol,
      color: mr.color,
      theologyFamily: 'Custom Modded Tradition',
      clergyTitle: 'High Prelate',
      sacredText: `Codex of ${mr.name}`,
      pilgrimageRite: 'Annual Pilgrimage to the Mother Sanctuary',
      tenets: mr.doctrine.split(',').map((s) => s.trim()).filter(Boolean),
      zealousness: 55,
    });
  }

  // 2. Weight theology archetypes so every world explores distinct theological traditions
  const shuffledArchs = [...RELIGION_ARCHETYPES].sort((a, b) => {
    const scoreA = a.affinities.filter((af) => dominantAffinities.includes(af)).length + prng.next() * 2.4;
    const scoreB = b.affinities.filter((af) => dominantAffinities.includes(af)).length + prng.next() * 2.4;
    return scoreB - scoreA;
  });

  const fallbackPalette = ['#EAB308', '#0284C7', '#16A34A', '#DC2626', '#9333EA', '#0D9488', '#F97316', '#E11D48', '#6366F1'];

  let idx = 0;
  let guard = 0;
  while (result.length < count && guard < 45) {
    guard++;
    const arch = shuffledArchs[idx % shuffledArchs.length];
    idx++;

    const deityCore = prng.pick(arch.deityNames);
    const deityTitle = prng.pick(arch.deityTitles);
    const deity = `${deityCore}, ${deityTitle}`;
    const adj = prng.pick(RELIGION_ADJECTIVES);
    const noun = prng.pick(RELIGION_NOUNS);
    const shortDeity = deityCore.replace(/^The\s+/i, '');
    const candName = prng
      .pick(arch.nameTemplates)
      .replace('{adj}', adj)
      .replace('{noun}', noun)
      .replace('{deity}', shortDeity);

    if (usedNames.has(candName.toLowerCase())) continue;
    usedNames.add(candName.toLowerCase());

    const sacredText = `${prng.pick(arch.sacredTextPrefixes)} ${prng.pick(arch.sacredTextNouns)}`;
    const tenets = prngShuffle([...arch.tenetsPool], prng).slice(0, 3);
    const doctrine = `${arch.family.split(' ')[0]}, ${tenets.join(', ')}`;
    const clergyTitle = prng.pick(arch.clergyTitles);
    const pilgrimageRite = prng.pick(arch.pilgrimageRites);
    const sacredMyth = prng
      .pick(arch.mythTemplates)
      .replace(/\{deity\}/g, deityCore)
      .replace(/\{text\}/g, sacredText);

    const symbol = arch.symbols.find((s) => !usedSymbols.has(s)) || arch.symbols[0];
    usedSymbols.add(symbol);

    const color =
      arch.colors.find((c) => !usedColors.has(c.toLowerCase())) ||
      fallbackPalette.find((c) => !usedColors.has(c.toLowerCase())) ||
      arch.colors[0];
    usedColors.add(color.toLowerCase());

    const zealousness = prng.range(arch.zealousnessRange[0], arch.zealousnessRange[1]);

    result.push({
      id: `religion_${result.length + 1}`,
      name: candName,
      deity,
      doctrine,
      sacredMyth,
      holySiteBurgId: '',
      symbol,
      color,
      theologyFamily: arch.family,
      clergyTitle,
      sacredText,
      pilgrimageRite,
      tenets,
      zealousness,
    });
  }

  return result;
}

function prngShuffle<T>(arr: T[], prng: PRNG): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const BURG_SUFFIXES = ['ford', 'burg', 'haven', 'spire', 'vale', 'port', 'cross', 'watch', 'hall', 'keep', 'wick', 'dell', 'holm', 'glen', 'reach'];
export const BURG_PREFIXES = ['Oakhaven', 'Stone', 'High', 'Raven', 'Iron', 'Golden', 'Silver', 'Storm', 'Winter', 'Sun', 'Deep', 'Black', 'Bright', 'North', 'Eagle', 'Falcon'];

export const TRADE_GOODS = [
  'Fine Steel & Damascus Blades',
  'Royal Purple Silk & Tapestries',
  'Aged Cask Wine & Metheglin',
  'Dragonbone Carvings & Ivory',
  'Silver Bullion & Minted Coin',
  'Ancient Parchment & Sacred Vellum',
  'Spices, Saffron & Frankincense',
  'Mithril Ingots & Arcane Runes',
  'Salted Cod, Herring & Smoked Sturgeon',
  'War Horses & Destriers',
  'Alchemical Brimstone & Vitriol',
  'Grain & Emmer Wheat',
  'Timber & Pine Planks',
  'Iron Ore & Bog Bloom',
  'Wool Fleeces & Linens',
  'Copper Ingots & Bronzework',
  'Rock Salt & Brine Blocks',
  'Clay Bricks & Terracotta',
  'Stone Blocks & Ashlar',
  'Furs & Ermine Pelts',
  'Coal & Bituminous Fuel',
  'Flax & Linen Fiber',
  'Hemp & Rigging Cordage',
  'Barley & Malt',
  'Tallow & Rendered Lard',
  'Hide & Heavy Leather',
  'Tin Ore & Casserite',
  'Lead Ingots & Roofing Sheets',
  'Quarried Slate & Tiles',
  'Beeswax & Church Tapers',
  'Honey & Sweet Comb',
  'Olives & Press Oil',
  'Grapes & Vineyard Must',
  'Dye Lichen & Woad',
  'Peat Turf & Fire Sods',
  'Herbs & Medicinal Salves',
  'Smoked Ham & Cured Pork',
  'Oak Bark & Tannins',
  'Tar & Pitch Pine Resins',
  'Amber & Fossil Gemstones',
  'Glassware & Annealed Vials',
  'Armor Plate & Maille',
  'Bows & Selected Yew Staves',
  'Pottery & Glazed Amphoras',
  'Jewelry & Filigree Gold',
  'Fine Leathercraft & Saddles',
  'Pearls & River Oysters',
  'Incense & Myrrh',
  'Alum & Mordant Salts',
  'Saltpeter & Niter Crystals',
  'Pewterware & Steins',
  'Dyes & Cochineal Scarlet',
];

export const SCHEME_TYPES = [
  { type: 'Murder' as const, name: 'Assassination Plot', desc: 'Conspire with court poisoners to eliminate a hated rival or sovereign.' },
  { type: 'Fabricate Claim' as const, name: 'Fabricate Title Claim', desc: 'Direct the court chaplain and heralds to forge ancient lineage deeds to a coveted county.' },
  { type: 'Incite Rebellion' as const, name: 'Incite Vassal Revolt', desc: 'Secretly funnel silver and whispered promises to disgruntled border counts.' },
  { type: 'Seduce Heir' as const, name: 'Seduce Realm Heir', desc: 'Entangle the kingdom’s heir in a scandalous romance to secure covert leverage.' },
  { type: 'Blackmail for Strong Hook' as const, name: 'Blackmail for Strong Hook', desc: 'Exploit a dark secret to force a permanent council seat or exemption from crown taxes.' },
  { type: 'Abduct Heir' as const, name: 'Abduct Heir Apparent', desc: 'Lurk in the shadows to take the royal child hostage and dictate succession terms.' },
  { type: 'Expose Dark Secret' as const, name: 'Expose Royal Heresy', desc: 'Publicly humiliate the liege before the high church to ignite a crisis of legitimacy.' },
  { type: 'Befriend Rival' as const, name: 'Diplomatic Sway', desc: 'Send rare falconry gifts and sworn pacts to reconcile bitter blood feuds.' },
];

export const CHARACTER_SECRETS = [
  'Secretly poisoned their elder brother during the winter famine to inherit the ducal coronet.',
  'Conceals a bastard child born of an illicit affair with a rival sovereign’s spouse.',
  'Practices forbidden midnight witchcraft and demonic scrying condemned by the high church.',
  'Forged the ancient charter granting their house exemption from royal war taxes.',
  'Embezzled five thousand gold marks from the cathedral construction treasury.',
  'Carries the hereditary bloodline curse of madness, concealed behind powdered cosmetics.',
  'Secretly converted to the proscribed heretical faith of the Astral Veil.',
  'Bribed the Grand Inquisitor to burn an innocent rival for false sorcery.',
];

export const HOOK_REASONS = [
  'Witnessed the poisoning of Duke Baldwin’s chalice at the harvest tourney.',
  'Possesses signed love letters proving an illicit affair with the Crown Consort.',
  'Retains the original authentic land deed proving the current count holds forged titles.',
  'Shielded them from an imperial writ of treason after the failed march revolt.',
  'Funded their mercenary host with covert gold bullion in exchange for an unbreakable blood debt.',
];

// Calculate Derived Skills (Attributes) from base + traits
export function computeCharacterStats(char: Character) {
  let diplomacy = char.baseDiplomacy || 10;
  let martial = char.baseMartial || 10;
  let stewardship = char.baseStewardship || 10;
  let intrigue = char.baseIntrigue || 10;
  let learning = char.baseLearning || 10;
  let prowess = char.baseProwess || 8;
  let dread = char.dread || 0;

  const allTraitNames = [
    ...(char.personalityTraits || []),
    char.educationTrait,
    ...(char.congenitalTraits || []),
    ...(char.physicalHealthTraits || []),
    ...(char.commanderTraits || []),
    ...(char.lifestyleTraits || []),
    char.statusTrait,
  ].filter(Boolean) as string[];

  for (const tName of allTraitNames) {
    const tDef = CHARACTER_TRAITS.find((x) => x.name.toLowerCase() === tName.toLowerCase());
    if (tDef) {
      diplomacy += tDef.diplomacyMod;
      martial += tDef.martialMod;
      stewardship += tDef.stewardshipMod;
      intrigue += tDef.intrigueMod;
      learning += tDef.learningMod;
      if (tDef.prowessMod) prowess += tDef.prowessMod;
      if (tDef.dreadMod) dread += tDef.dreadMod;
    }
  }

  return {
    diplomacy: Math.max(0, diplomacy),
    martial: Math.max(0, martial),
    stewardship: Math.max(0, stewardship),
    intrigue: Math.max(0, intrigue),
    learning: Math.max(0, learning),
    prowess: Math.max(0, prowess),
    dread: Math.min(100, Math.max(0, dread)),
  };
}

// Derive AI Personality Archetype from Traits
export function deriveAIArchetype(personalityTraits: string[], educationTrait?: string, role?: string): AIArchetype {
  const pSet = new Set(personalityTraits.map((t) => t.toLowerCase()));

  if (pSet.has('sadistic') || (pSet.has('callous') && pSet.has('wrathful'))) {
    return 'Hedonistic Tyrant';
  }
  if (pSet.has('deceitful') && (pSet.has('ambitious') || pSet.has('paranoid'))) {
    return 'Ruthless Schemer';
  }
  if (pSet.has('just') && (pSet.has('brave') || pSet.has('honest') || pSet.has('temperate'))) {
    return 'Honorable Paragon';
  }
  if (pSet.has('zealous')) {
    return 'Religious Zealot';
  }
  if (pSet.has('brave') && (pSet.has('wrathful') || educationTrait?.toLowerCase().includes('warrior') || educationTrait?.toLowerCase().includes('strategist'))) {
    return 'Warmonger Vanguard';
  }
  if (pSet.has('craven') && (pSet.has('fickle') || pSet.has('deceitful'))) {
    return 'Craven Sycophant';
  }
  if (pSet.has('gluttonous') || (pSet.has('greedy') && pSet.has('ambitious'))) {
    return 'Gluttonous Usurper';
  }
  if (role === 'Disinherited Bastard' || pSet.has('vengeful')) {
    return 'Vengeful Bastard';
  }
  if (pSet.has('diligent') && pSet.has('temperate')) {
    return 'Benevolent Builder';
  }
  if (pSet.has('lustful') || pSet.has('compassionate')) {
    return 'Tragic Romantic';
  }
  if (pSet.has('cynical') || educationTrait?.toLowerCase().includes('scholar') || educationTrait?.toLowerCase().includes('philosopher')) {
    return 'Scholarly Hermit';
  }

  return 'Honorable Paragon';
}

// Interpersonal Opinion Matrix based on Character Traits
export function calculateCharacterOpinion(
  charA: Character,
  charB: Character,
  sameRealm: boolean,
  sameFaith: boolean,
  sameCulture: boolean
): number {
  let opinion = 0;

  // Base realm loyalty
  if (charB.id === charA.liegeId) {
    opinion += 15; // Sworn allegiance
    if (charA.personalityTraits.includes('Ambitious')) opinion -= 25; // Covets liege's crown
    if (charA.personalityTraits.includes('Content')) opinion += 20; // Loyal subject
  }
  if (charA.id === charB.liegeId) {
    if (charB.personalityTraits.includes('Ambitious')) opinion -= 15;
  }

  // Culture & Faith
  if (!sameFaith) {
    opinion -= 25;
    if (charA.personalityTraits.includes('Zealous')) opinion -= 35; // Hates heretics
  } else {
    opinion += 10;
    if (charA.personalityTraits.includes('Zealous')) opinion += 15;
  }

  if (sameCulture) opinion += 10;

  // Opposite Trait Clashes
  if (charA.personalityTraits.includes('Brave') && charB.personalityTraits.includes('Craven')) opinion -= 20;
  if (charA.personalityTraits.includes('Honest') && charB.personalityTraits.includes('Deceitful')) opinion -= 30;
  if (charA.personalityTraits.includes('Compassionate') && (charB.personalityTraits.includes('Sadistic') || charB.personalityTraits.includes('Callous'))) opinion -= 40;
  if (charA.personalityTraits.includes('Just') && charB.personalityTraits.includes('Arbitrary')) opinion -= 25;
  if (charA.personalityTraits.includes('Zealous') && charB.personalityTraits.includes('Cynical')) opinion -= 30;

  // Mutual Trait Affinity
  if (charA.personalityTraits.includes('Brave') && charB.personalityTraits.includes('Brave')) opinion += 15;
  if (charA.personalityTraits.includes('Just') && charB.personalityTraits.includes('Just')) opinion += 15;
  if (charA.personalityTraits.includes('Gregarious') && charB.personalityTraits.includes('Gregarious')) opinion += 15;
  if (charA.personalityTraits.includes('Diligent') && charB.personalityTraits.includes('Diligent')) opinion += 10;

  // Dread Impact
  const statsB = computeCharacterStats(charB);
  if (statsB.dread > 40 && charA.personalityTraits.includes('Craven')) {
    opinion -= 15; // Terrified obedience
  }

  // Bounds
  return Math.max(-100, Math.min(100, Math.round(opinion)));
}
