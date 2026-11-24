import {
  Character,
  Realm,
  Burg,
  SagaStory,
  LoreEntity,
  WorldState,
} from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import { isElectronDesktop } from '../utils/runtimeEnv';

export type SagaGenre =
  | 'Tragedy'
  | 'Betrayal'
  | 'Succession Crisis'
  | 'Forbidden Love'
  | 'Dynastic Feud'
  | 'Religious Inquisitor'
  | 'Bastard\'s Revenge'
  | 'Heroic Defense'
  | 'Blackmail & Intrigue';

export interface StoryPromptOptions {
  genre?: SagaGenre;
  protagonistId?: string;
  antagonistId?: string;
  burgId?: string;
  customPremise?: string;
}

function pickTraitDrivenGenre(protagonist: Character, antagonist: Character, prng: PRNG): SagaGenre {
  const pTraits = new Set([
    ...(protagonist.personalityTraits || []),
    ...(protagonist.v17Traits || []),
    ...(protagonist.lifestyleTraits || []),
    ...(protagonist.statusTrait ? [protagonist.statusTrait] : []),
  ]);
  const aTraits = new Set([
    ...(antagonist.personalityTraits || []),
    ...(antagonist.v17Traits || []),
    ...(antagonist.lifestyleTraits || []),
    ...(antagonist.statusTrait ? [antagonist.statusTrait] : []),
  ]);

  const scores: Record<SagaGenre, number> = {
    'Betrayal': 1,
    'Succession Crisis': 1,
    'Forbidden Love': 1,
    'Dynastic Feud': 1,
    'Religious Inquisitor': 1,
    'Bastard\'s Revenge': 1,
    'Heroic Defense': 1,
    'Blackmail & Intrigue': 1,
    'Tragedy': 0.5,
  };

  if (aTraits.has('Deceitful') || aTraits.has('Sadistic') || aTraits.has('Callous') || antagonist.aiArchetype === 'Ruthless Schemer') {
    scores['Betrayal'] += 5;
    scores['Blackmail & Intrigue'] += 5;
  }
  if (pTraits.has('Honest') || pTraits.has('Just') || protagonist.aiArchetype === 'Honorable Paragon') {
    scores['Heroic Defense'] += 3;
    scores['Betrayal'] += 2;
  }
  if (aTraits.has('Zealous') || pTraits.has('Zealous') || antagonist.aiArchetype === 'Religious Zealot' || protagonist.aiArchetype === 'Religious Zealot') {
    scores['Religious Inquisitor'] += 6;
  }
  if (pTraits.has('Brave') || pTraits.has('Stubborn') || protagonist.aiArchetype === 'Warmonger Vanguard') {
    scores['Heroic Defense'] += 5;
    scores['Dynastic Feud'] += 3;
  }
  if (aTraits.has('Ambitious') || pTraits.has('Ambitious') || aTraits.has('Arrogant')) {
    scores['Succession Crisis'] += 5;
    scores['Dynastic Feud'] += 3;
  }
  if (aTraits.has('Vengeful') || pTraits.has('Vengeful') || aTraits.has('Wrathful') || antagonist.aiArchetype === 'Vengeful Bastard') {
    scores['Dynastic Feud'] += 4;
    scores['Bastard\'s Revenge'] += 3;
  }
  if (aTraits.has('Bastard') || aTraits.has('Disinherited Bastard') || pTraits.has('Bastard') || antagonist.aiArchetype === 'Vengeful Bastard') {
    scores['Bastard\'s Revenge'] += 7;
  }
  if ((pTraits.has('Lustful') || aTraits.has('Lustful') || pTraits.has('Gregarious') || protagonist.aiArchetype === 'Tragic Romantic') && !pTraits.has('Chaste') && !aTraits.has('Chaste')) {
    scores['Forbidden Love'] += 5;
  }
  if (pTraits.has('Chaste') && aTraits.has('Chaste')) {
    scores['Forbidden Love'] = 0;
  }
  if (pTraits.has('Paranoid') || aTraits.has('Paranoid')) {
    scores['Blackmail & Intrigue'] += 4;
    scores['Betrayal'] += 3;
  }

  const entries = (Object.entries(scores) as [SagaGenre, number][]).filter(([, w]) => w > 0);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = prng.next() * totalWeight;
  for (const [g, w] of entries) {
    roll -= w;
    if (roll <= 0) return g;
  }
  return entries[0][0];
}

export function generateSagaChapter(
  world: WorldState,
  options: StoryPromptOptions,
  prng: PRNG
): { story: SagaStory; loreEntity: LoreEntity; updatedCharacters: Character[] } {
  // 1. Pick Protagonist and Antagonist
  const aliveCharacters = world.characters.filter((c) => c.isAlive);
  const protagonist =
    (options.protagonistId && world.characters.find((c) => c.id === options.protagonistId)) ||
    prng.pick(aliveCharacters.length > 0 ? aliveCharacters : world.characters);

  let antagonist =
    options.antagonistId && world.characters.find((c) => c.id === options.antagonistId);
  if (!antagonist) {
    const candidates = world.characters.filter((c) => c.id !== protagonist.id);
    antagonist = protagonist.rivalId
      ? world.characters.find((c) => c.id === protagonist.rivalId) || prng.pick(candidates)
      : prng.pick(candidates) || protagonist;
  }

  // Pick Location Burg
  const locationBurg =
    (options.burgId && world.burgs.find((b) => b.id === options.burgId)) ||
    world.burgs.find((b) => b.id === protagonist.countyId) ||
    world.burgs.find((b) => b.stateId === protagonist.realmId) ||
    world.burgs[0];

  const protRealm = world.realms.find((r) => r.id === protagonist.realmId) || world.realms[0];
  const antRealm = antagonist
    ? world.realms.find((r) => r.id === antagonist.realmId) || protRealm
    : protRealm;

  const genre: SagaGenre =
    options.genre || pickTraitDrivenGenre(protagonist, antagonist, prng);

  const year = world.currentYear;
  const storyId = `saga_${Date.now()}_${prng.range(100, 999)}`;

  let title = '';
  let premise = '';
  let fullProse = '';
  let dialogueSnippet = '';
  let consequences = '';

  if (genre === 'Betrayal') {
    title = `The Poisoned Chalice of ${locationBurg.name}`;
    premise = `${protagonist.name} unveiled a deadly conspiracy within the privy council, orchestrated under the banner of House ${antagonist.houseName}.`;
    dialogueSnippet = `"${protagonist.houseMotto}," spat ${protagonist.name}, shattering the silver goblet upon the marble flags. "You swore upon the tombs of the holy saints, yet you served nightshade with the royal wine."`;
    fullProse = `
Autumn gales howled through the narrow arrow-slits of the Great Keep at ${locationBurg.name}. Within the vaulted banquet chamber, tapestries of silk and stag-hide swayed in the drafts as the nobility of ${protRealm.name} gathered to celebrate the seasonal harvest.

Yet behind the facade of minstrel songs, tension hung thick as smoke. For months, rumors had swirled regarding ${antagonist.name}, whose outwardly obsequious smiles masked a burning thirst for ${antagonist.ambition.toLowerCase()}. Guided by a fatal disposition toward ${antagonist.tragicFlaw.toLowerCase()}, the conspirator had secretly aligned with mercenary captains across the frontier of ${antRealm.name}.

When the high cupbearer approached the dais, ${protagonist.name} noticed the faint, bitter almond scent rising from the spiced vintage. Without a word, the sovereign seized the vessel, casting its contents before the assembled lords. The liquid hissed where it touched the cold stones.

${dialogueSnippet}

Armed guards surged into the hall. Though ${antagonist.name} fled through hidden masonry passages into the rainy night, the ancient covenant between House ${protagonist.houseName} and House ${antagonist.houseName} was sundered for all time.
    `.trim();
    consequences = `House ${protagonist.houseName} issued an imperial writ of treason against ${antagonist.name}. Feudal garrisons across ${locationBurg.name} were placed on war footing.`;
  } else if (genre === 'Succession Crisis') {
    title = `The War of the Two Crowns`;
    premise = `Upon the disputed death of the high monarch, ${protagonist.name} and ${antagonist.name} both claimed rightful succession to the throne of ${protRealm.name}.`;
    dialogueSnippet = `"A crown is not an heirloom to be passed like a silver spoon," declared ${protagonist.name}, unsheathing the ancestral blade. "It belongs to the sovereign whose iron will commands the realm."`;
    fullProse = `
The bells of ${locationBurg.name} tolled three hundred times, announcing the passing of the elder ruler into the halls of the ancestors. Yet before the funeral pyres could cool, the kingdom was torn asunder by conflicting wills.

${protagonist.name}, bearing the sacred signet ring, claimed the crown by virtue of primogeniture and feudal covenant. But ${antagonist.name}, supported by influential dukes and the martial host of the western marches, denounced the will as a forgery forged by corrupt chancellors. Driven by unbridled ${antagonist.ambition.toLowerCase()}, the challenger raised the lion banner outside the city gates.

Courtiers whispered of ${protagonist.darkSecret.toLowerCase()}, using it to sow doubt among the high barons. In the cathedral of ${protRealm.religion}, both rivals confronted one another before the high altar, surrounded by drawn steel and terrified clerics.

${dialogueSnippet}

No compromise could bridge the chasm. By nightfall, horsemen rode across every province carrying calls to arms, plunging ${protRealm.name} into a bitter succession civil war.
    `.trim();
    consequences = `The lords of ${protRealm.name} divided into warring factions. The royal treasury was split to fund rival legions.`;
  } else if (genre === 'Forbidden Love') {
    title = `The Secret of the Willow Bower`;
    premise = `A clandestine romance between scions of rival dynasties, defying the ancient blood feuds dividing their sovereign realms.`;
    dialogueSnippet = `"Let the councils rage and the war-horns blow," whispered ${protagonist.name} into the dark. "Between your hand and mine, there are neither frontiers nor kings."`;
    fullProse = `
Beyond the outer barbicans of ${locationBurg.name}, where the ancient river bent through groves of weeping willow, stood an abandoned water-mill forgotten by all save the hermit monks. Here, beneath the cloak of moonless nights, ${protagonist.name} risked life and dynasty to meet ${antagonist.name}.

Their two sovereign realms had bled each other across three generations of border wars. Priests of ${protRealm.religion} preached that fraternization was an unforgivable stain upon honor. Yet beneath the starlight, all titles and oaths melted away. Bound by a shared revulsion toward the cruelty of dynastic politics, they forged their own sanctuary.

${dialogueSnippet}

Yet peace in court never lasts long. A falconer loyal to the Chancellor noticed riding tracks leading repeatedly into the forbidden woods. A discarded pendant bearing the heraldic crest of ${antagonist.houseName} was brought before the court, setting into motion an inquiry that threatened both lovers with the dungeon.
    `.trim();
    consequences = `Both houses tightened court surveillance. The lovers exchanged coded correspondence through sympathetic minstrels, maintaining an oath of mutual protection.`;
  } else if (genre === 'Religious Inquisitor') {
    title = `The Anathema of ${locationBurg.name}`;
    premise = `An austere zealot initiated a terrifying inquisition into heresy, threatening the crown with holy excommunication.`;
    dialogueSnippet = `"Your earthly scepter is but kindling before the eternal fire," proclaimed ${antagonist.name}, holding aloft the sacred scripture. "Repent of your sins, or your name shall be expunged from the living annals."`;
    fullProse = `
The sky above ${locationBurg.name} was the color of tarnished lead as the grand prelates of ${protRealm.religion} processed through the cobbled streets, chanting dirges of repentance. At their head marched ${antagonist.name}, an unbending inquisitor whose fanatical piety had struck terror into town and court alike.

Word had reached the High Temple that ${protagonist.name} had granted sanctuary to unorthodox scholars and possessed forbidden grimoires. Seeking to assert spiritual supremacy over the crown, the inquisitor convened a tribunal upon the cathedral steps.

Lords and commoners gathered in hushed thousands. When ${protagonist.name} rode into the square without guards, refusing to bow before the iron altar, the confrontation reached a boiling point.

${dialogueSnippet}

Rather than submit to clerical tyranny, ${protagonist.name} produced royal charters granting the city burghers autonomy from church tithes, fracturing the clergy's grip and sparking an ideological schism that rippled across the continent.
    `.trim();
    consequences = `The High Prelate declared a conditional interdict upon the royal court. Reformist factions rallied behind ${protagonist.name}.`;
  } else if (genre === 'Bastard\'s Revenge') {
    title = `The Blood of the Disinherited`;
    premise = `A repudiated bastard son returned from exile with a host of sellswords to reclaim the ancestral castle of House ${protagonist.houseName}.`;
    dialogueSnippet = `"You gave me neither title nor land," said ${antagonist.name}, gazing up at the high ramparts, "so I have returned to take them by the red law of the sword."`;
    fullProse = `
For ten years, the name of ${antagonist.name} had been spoken only in taverns and mercenary camps. Disowned at birth due to courtly intrigue, the outcast had survived the grueling sand-arenas and frontier skirmishes of foreign principalities, forging a hardened company known as the Iron Vanguard.

Now, at the gates of ${locationBurg.name}, the banners of the company fluttered against the autumn sky. Within the fortress, ${protagonist.name} surveyed the siege lines from the battlements, haunted by memories of ancient betrayals that had cast the challenger into the cold.

When heralds called for a parley beneath the portcullis, the two blood-kin met separated only by iron bars and iron wills.

${dialogueSnippet}

The siege was bloody and prolonged. Trebuchet stones cracked the masonry of the western tower; midnight sorties filled the moat with fallen soldiers. In the end, a negotiated peace granted the claimant hereditary lordship over the border march, forever changing the balance of power.
    `.trim();
    consequences = `${antagonist.name} was formally legitimized by decree of the High Council, gaining the county lordship of the frontier.`;
  } else if (genre === 'Heroic Defense') {
    title = `The Shield of ${locationBurg.name}`;
    premise = `Surrounded by overwhelming enemy armies, ${protagonist.name} rallied the weary defenders in an epochal last stand.`;
    dialogueSnippet = `"Stand fast upon these stones!" cried ${protagonist.name}, raising the battered realm standard. "Though the walls may crumble into dust, the honor of ${protRealm.name} shall not yield!"`;
    fullProse = `
For forty days and forty nights, smoke had blotted out the sun over ${locationBurg.name}. The formidable siege engines of ${antRealm.name} had reduced the outer barbican to shattered stone and burning timber. Food supplies were exhausted, and water in the cisterns was rationed by the thimble.

Within the citadel, the remaining garrison was spent. Councilors urged capitulation, whispering that surrender was the only path to spare the city from the torch. But ${protagonist.name}, bearing armor dented from a dozen breaches, stepped forward onto the parapet in full view of the enemy host.

${dialogueSnippet}

Inspired by their commander's unbreakable courage, archers strung their bows with frayed sinew, and blacksmiths forged scrap iron into makeshift pikes. When the final grand assault commenced at dawn, the defenders hurled the attackers back down the ladders, holding the breach until the relief legions appeared upon the eastern horizon.
    `.trim();
    consequences = `${locationBurg.name} was forever dubbed 'The Unvanquished Citadel'. ${protagonist.name} was awarded the Golden Sun medallion of the Realm.`;
  } else if (genre === 'Blackmail & Intrigue') {
    title = `The Whispers of the Silk Chamber`;
    premise = `A clandestine letter detailing royal illegitimacy was wielded as a deadly lever to extort the crown's richest trade privileges.`;
    dialogueSnippet = `"Power does not reside in crowns of gold," whispered ${antagonist.name} with a cold smile, holding the wax-sealed parchment above the hearth. "It resides in the secrets men would burn kingdoms to conceal."`;
    fullProse = `
In the shadowy alcoves of the palace at ${locationBurg.name}, true power was measured not by the length of spears, but by the weight of stolen secrets. ${antagonist.name}, the cunning spymaster whose network of scullery maids and pageboys spanned every court, had uncovered an incontrovertible truth: the royal heir was not of royal blood.

Summoned to a private audience chamber lit only by beeswax tapers, ${protagonist.name} was forced to confront the fatal evidence. To expose the secret meant immediate rebellion and excommunication; to yield meant bowing to a subject's extortion.

${dialogueSnippet}

A duel of intellect and nerve unfolded across the mahogany table. Rather than succumb to panic, ${protagonist.name} feigned capitulation, agreeing to transfer lucrative tariff charters while secretly deploying loyal assassins to sever the blackmailer's communication web.
    `.trim();
    consequences = `A shadow war of whispers erupted between rival spymasters, leading to the mysterious disappearance of three court chancellors.`;
  } else {
    // Dynastic Feud
    title = `The Blood Oath of the Contested Marches`;
    premise = `An ancestral grudge between House ${protagonist.houseName} and House ${antagonist.houseName} erupted into open bloodshed over border tithes.`;
    dialogueSnippet = `"You claim this land by virtue of forged ink," roared ${protagonist.name}. "We hold it by the bone and iron of seven hundred winters!"`;
    fullProse = `
Dawn broke over the craggy highlands outside ${locationBurg.name} like spilled brass across an anvil. Mounted atop barded warhorses, the bannermen of ${protagonist.houseName} stood rank upon rank against the host of ${antagonist.houseName}.

For generations, both families had claimed ownership of the silver-veined valleys between their domains. Every peace treaty had proved ephemeral, broken by cattle raids and severed boundary markers. ${antagonist.name}, driven by ${antagonist.ambition.toLowerCase()}, had crossed the ford at midnight with three hundred lances.

${dialogueSnippet}

The clash of steel and shields reverberated through the mountain passes. Though the banners of ${protagonist.houseName} held the high ground, the field was left littered with the chivalry of both realms, ensuring that the vendetta would be passed down to their children's children.
    `.trim();
    consequences = `An eternal blood feud was declared. Both houses banned their kinsmen from ever speaking the name of their rival without spitting upon the earth.`;
  }

  // Weave user customPremise into local chapter when present
  if (options.customPremise && options.customPremise.trim().length > 0) {
    const cleanPremise = options.customPremise.trim();
    premise = `${cleanPremise} (${premise})`;
    fullProse = `${cleanPremise}\n\n${fullProse}`;
  }

  // Update character relationships immutably
  const updatedCharacters = world.characters.map((c) => {
    if (c.id === protagonist.id || c.id === antagonist.id) {
      return { ...c, opinions: { ...(c.opinions || {}) } };
    }
    return c;
  });
  const pChar = updatedCharacters.find((c) => c.id === protagonist.id);
  const aChar = updatedCharacters.find((c) => c.id === antagonist.id);

  if (pChar && aChar && pChar.id !== aChar.id) {
    if (genre === 'Forbidden Love') {
      pChar.opinions[aChar.id] = Math.min(100, (pChar.opinions[aChar.id] || 0) + 45);
      aChar.opinions[pChar.id] = Math.min(100, (aChar.opinions[pChar.id] || 0) + 45);
      pChar.loverId = aChar.id;
      aChar.loverId = pChar.id;
    } else {
      pChar.opinions[aChar.id] = Math.max(-100, (pChar.opinions[aChar.id] || 0) - 40);
      aChar.opinions[pChar.id] = Math.max(-100, (aChar.opinions[pChar.id] || 0) - 40);
      pChar.rivalId = aChar.id;
      aChar.rivalId = pChar.id;
    }
  }

  const story: SagaStory = {
    id: storyId,
    title,
    year,
    genre,
    protagonistId: protagonist.id,
    antagonistId: antagonist.id,
    locationBurgId: locationBurg.id,
    realmId: protRealm.id,
    premise,
    fullProse,
    dialogueSnippet,
    consequences,
  };

  // Compile matching LoreEntity for the WeasyPrint Lore Book
  const loreEntity: LoreEntity = {
    id: `lore_${storyId}`,
    category: 'The High Sagas & Epics',
    name: `${title} (Year ${year})`,
    summary: `[${genre}] ${premise}`,
    body_markdown: `
### Dramatis Personae & Setting
- **Protagonist**: ${protagonist.name} of House ${protagonist.houseName}
- **Antagonist / Counterpart**: ${antagonist.name} of House ${antagonist.houseName}
- **Seat of Conflict**: Citadel of ${locationBurg.name}, ${protRealm.name}
- **Recorded Year**: Year ${year} of the Sovereign Era

### The High Saga
${fullProse}

### Historical Consequences
*${consequences}*
    `.trim(),
    tags: ['Saga', genre, protagonist.houseName, antagonist.houseName],
  };

  return { story, loreEntity, updatedCharacters };
}

export async function generateSagaChapterAsync(
  world: WorldState,
  options: StoryPromptOptions,
  prng: PRNG
): Promise<{
  story: SagaStory;
  loreEntity: LoreEntity;
  updatedCharacters: Character[];
  aiAuthored: boolean;
}> {
  const chars = world.characters;
  const protagonist =
    chars.find((c) => c.id === options.protagonistId) ||
    chars[prng.range(0, Math.max(0, chars.length - 1))];
  const antagonist =
    chars.find((c) => c.id === options.antagonistId) ||
    chars.find((c) => c.id !== protagonist?.id) ||
    protagonist;
  const locationBurg =
    world.burgs.find((b) => b.id === options.burgId) ||
    world.burgs.find((b) => b.stateId === protagonist?.realmId) ||
    world.burgs[0];
  const protRealm =
    world.realms.find((r) => r.id === protagonist?.realmId) || world.realms[0];

  const resolvedGenre: SagaGenre =
    options.genre ||
    (protagonist && antagonist ? pickTraitDrivenGenre(protagonist, antagonist, prng) : 'Dynastic Feud');

  if (protagonist && antagonist && locationBurg && protRealm && !isElectronDesktop()) {
    try {
      const resp = await fetch('/api/ai/saga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protagonistName: protagonist.name,
          protagonistTitle: protagonist.title,
          houseName: protagonist.houseName,
          traits: [
            ...(protagonist.personalityTraits || []),
            ...(protagonist.v17Traits || []),
          ],
          tragicFlaw: protagonist.tragicFlaw,
          darkSecret: antagonist.darkSecret || protagonist.darkSecret,
          antagonistName: antagonist.name,
          realmName: protRealm.name,
          burgName: locationBurg.name,
          genre: resolvedGenre,
          year: world.currentYear,
          customPremise: options.customPremise?.trim() || '',
        }),
      });
      if (resp.ok) {
        const payload = await resp.json();
        if (payload?.ok && payload?.saga?.fullProse) {
          const base = generateSagaChapter(
            world,
            { ...options, genre: resolvedGenre },
            prng
          );
          const aiTitle = String(payload.saga.title || base.story.title);
          const aiPremise = String(payload.saga.premise || base.story.premise);
          const aiProse = String(payload.saga.fullProse || base.story.fullProse);
          const aiDialogue = String(payload.saga.dialogueSnippet || base.story.dialogueSnippet);
          const aiConseq = String(payload.saga.consequences || base.story.consequences);

          const story: SagaStory = {
            ...base.story,
            title: aiTitle,
            premise: aiPremise,
            fullProse: aiProse,
            dialogueSnippet: aiDialogue,
            consequences: aiConseq,
          };
          const loreEntity: LoreEntity = {
            ...base.loreEntity,
            name: `${aiTitle} (Year ${story.year})`,
            summary: `[${story.genre}] ${aiPremise}`,
            body_markdown: `### Dramatis Personae & Setting\n- **Protagonist**: ${protagonist.name} of House ${protagonist.houseName}\n- **Counterpart**: ${antagonist.name} of House ${antagonist.houseName}\n- **Seat of Conflict**: ${locationBurg.name}, ${protRealm.name}\n\n### The High Saga\n${aiProse}\n\n### Historical Consequences\n*${aiConseq}*`,
          };
          return {
            story,
            loreEntity,
            updatedCharacters: base.updatedCharacters,
            aiAuthored: true,
          };
        }
      }
    } catch {
      // Fallback cleanly to deterministic generator
    }
  }

  const fallback = generateSagaChapter(world, { ...options, genre: resolvedGenre }, prng);
  return { ...fallback, aiAuthored: false };
}
