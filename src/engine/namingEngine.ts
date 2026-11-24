import { PRNG } from '../utils/proceduralNoise';

export type CulturalLinguisticFamily =
  | 'valorian'
  | 'skaldic'
  | 'qadiri'
  | 'sylvathi'
  | 'kharaz'
  | 'byzantion'
  | 'steppic'
  | 'ostlandic'
  | 'iberan'
  | 'maritime';

interface PhoneticGrammar {
  // Personal name syllables
  maleOnsets: string[];
  maleMiddles: string[];
  maleEndings: string[];
  femaleOnsets: string[];
  femaleMiddles: string[];
  femaleEndings: string[];
  // Noble house patterns
  housePrefixes: string[];
  houseSuffixes: string[];
  housePrefixParticle?: string; // e.g. 'Al-' or 'de '
  // Place / settlement / realm patterns
  placeOnsets: string[];
  placeMiddles: string[];
  placeEndings: string[];
  compoundRoots: string[];
  compoundSuffixes: string[];
  coastalSuffixes: string[];
  mountainSuffixes: string[];
  forestSuffixes: string[];
  realmEndings: string[];
}

const GRAMMARS: Record<CulturalLinguisticFamily, PhoneticGrammar> = {
  valorian: {
    maleOnsets: ['Al', 'Val', 'Theo', 'Cas', 'God', 'Bald', 'Aur', 'Mer', 'Tyb', 'Gar', 'Cor', 'Luc', 'Mar', 'Oct', 'Jul', 'Seb', 'Had', 'Lor', 'Ren', 'Ced', 'Edm', 'Row', 'Ber', 'Rod', 'Leo', 'Vic', 'Fau', 'Gal', 'Ser', 'Dor'],
    maleMiddles: ['er', 'en', 'or', 'an', 'ar', 'al', 'in', 'ol', 'em', 'is', 'av', 'el', 'at', 'ir', 'ul'],
    maleEndings: ['ic', 'ius', 'us', 'an', 'en', 'on', 'ard', 'win', 'frey', 'rick', 'ald', 'or', 'el', 'as', 'ian', 'mont', 'bert', 'und'],
    femaleOnsets: ['El', 'Gwen', 'Aur', 'Ves', 'Bea', 'Hel', 'Is', 'Ser', 'Elea', 'Viv', 'Clar', 'Luc', 'Cel', 'Ros', 'Mar', 'Cat', 'Jul', 'Lyr', 'Syl', 'Val', 'Adel', 'Cam', 'Oct', 'Fior', 'Mir', 'Oph', 'Thea', 'Cor', 'Am', 'Bel'],
    femaleMiddles: ['en', 'ar', 'el', 'is', 'an', 'al', 'or', 'in', 'av', 'es', 'il', 'er', 'am', 'ol'],
    femaleEndings: ['a', 'ia', 'ina', 'elle', 'ette', 'ara', 'ene', 'ora', 'isa', 'lyn', 'ine', 'ea', 'anne', 'ice', 'ilde', 'ona'],
    housePrefixes: ['Val', 'Mont', 'Castel', 'Aethel', 'Corv', 'Bel', 'Cour', 'Vane', 'Beau', 'Clare', 'Gryph', 'Sov', 'Aur', 'Drak', 'Haut', 'Lor', 'Mar', 'Roch', 'Ver', 'Sol', 'Chast', 'Dor', 'Fau', 'Lions', 'Tour', 'Argent', 'Cinder', 'Vesper', 'Crest', 'Harrow'],
    houseSuffixes: ['fort', 'lane', 'mont', 'gard', 'crest', 'shield', 'bourne', 'mere', 'ville', 'court', 'helm', 'vale', 'hart', 'spire', 'croft', 'ley', 'ford', 'wood', 'bridge', 'march', 'moor', 'stone', 'ward', 'ridge', 'hall'],
    placeOnsets: ['Val', 'Cor', 'Mont', 'Bel', 'Cast', 'Aur', 'Sol', 'Clar', 'Mar', 'Ver', 'Dor', 'Lor', 'Roch', 'Hau', 'Cal', 'Fau', 'Ser', 'Taur', 'Al', 'Brin', 'Cael', 'Edr', 'Gal', 'Lir', 'Nor', 'Ost', 'Pel', 'Riv', 'Tal', 'Vyr'],
    placeMiddles: ['en', 'ar', 'or', 'al', 'is', 'er', 'an', 'el', 'ol', 'in', 'av', 'et'],
    placeEndings: ['ia', 'or', 'on', 'um', 'is', 'en', 'as', 'ar', 'el', 'os', 'a', 'e'],
    compoundRoots: ['Amber', 'Alder', 'Ash', 'Barrow', 'Bell', 'Birch', 'Bramble', 'Briar', 'Cairn', 'Cedar', 'Cinder', 'Clover', 'Copper', 'Crown', 'Dawn', 'Dusk', 'Elder', 'Elm', 'Fallow', 'Fawn', 'Fern', 'Flint', 'Gale', 'Gild', 'Granite', 'Grey', 'Hart', 'Hawk', 'Hazel', 'Heather', 'Hollow', 'Hound', 'Ivory', 'Kestrel', 'Lark', 'Laurel', 'Linden', 'Mallow', 'Meadow', 'Mist', 'Moss', 'Ochre', 'Orchard', 'Osprey', 'Pine', 'Red', 'Reed', 'Roan', 'Rose', 'Rowan', 'Sable', 'Saffron', 'Sage', 'Shale', 'Stag', 'Swan', 'Thistle', 'Thorn', 'Vesper', 'White', 'Willow', 'Wren', 'Yew'],
    compoundSuffixes: ['ford', 'burg', 'haven', 'spire', 'vale', 'cross', 'watch', 'hall', 'keep', 'wick', 'dell', 'holm', 'glen', 'reach', 'stead', 'bridge', 'crest', 'gate', 'hurst', 'leigh', 'mere', 'moor', 'ridge', 'shire', 'thorne', 'ton', 'well', 'wood', 'worth'],
    coastalSuffixes: ['port', 'bay', 'haven', 'cove', 'quay', 'harbor', 'mouth', 'point', 'strand', 'tide', 'wharf', 'landing', 'head'],
    mountainSuffixes: ['crag', 'peak', 'tor', 'pass', 'hold', 'eyrie', 'cairn', 'cliff', 'ridge', 'spire', 'height', 'scar'],
    forestSuffixes: ['wood', 'glade', 'grove', 'hurst', 'holt', 'shaw', 'thicket', 'bough', 'frith', 'copse'],
    realmEndings: ['ia', 'land', 'mark', 'reach', 'gard', 'or', 'ea', 'aine', 'oria', 'en', 'mont', 'vale'],
  },
  skaldic: {
    maleOnsets: ['Rag', 'Tor', 'Bj', 'Eir', 'Sig', 'Hal', 'Sv', 'Ulf', 'Iv', 'Styr', 'Har', 'Knut', 'Leif', 'Olav', 'Skal', 'Gunn', 'Hrok', 'Jor', 'Sten', 'Vig', 'Asg', 'Bram', 'Dag', 'Frey', 'Grim', 'Hakon', 'Kael', 'Magn', 'Orm', 'Rolf'],
    maleMiddles: ['ar', 'or', 'ur', 'en', 'al', 'ir', 'an', 'ol', 'un', 'ek'],
    maleEndings: ['stein', 'orn', 'ik', 'urd', 'var', 'gar', 'bjorn', 'ald', 'ulf', 'rik', 'en', 'mund', 'son', 'brand', 'dir', 'leif', 'grim'],
    femaleOnsets: ['Ast', 'Frey', 'Sig', 'Hil', 'Yr', 'Ing', 'Thyr', 'Bryn', 'Gud', 'Gunn', 'Siv', 'Run', 'Helg', 'Skad', 'Alv', 'Dag', 'Eir', 'Frid', 'Hall', 'Jor', 'Kari', 'Liv', 'Nann', 'Rag', 'Solv', 'Tov', 'Unn', 'Vig'],
    femaleMiddles: ['r', 'n', 'l', 'v', 'd', 'g', 's'],
    femaleEndings: ['id', 'a', 'da', 'sa', 'rid', 'hild', 'run', 'dis', 'gerd', 'veig', 'borg', 'ny', 'la', 'vor', 'lin'],
    housePrefixes: ['Frost', 'Storm', 'Raven', 'Wolf', 'Sea', 'Rime', 'Ice', 'Skald', 'Fjord', 'Gale', 'Bear', 'Elk', 'Whale', 'Ash', 'Drift', 'Crag', 'Skjold', 'Hearth', 'Flint', 'Krak', 'Nord', 'Sleet', 'Tide', 'Valk', 'Wyrm', 'Oar', 'Keel', 'Fang', 'Prow', 'Snow'],
    houseSuffixes: ['fang', 'strider', 'scar', 'born', 'axe', 'borne', 'shield', 'helm', 'breaker', 'jaw', 'claw', 'heart', 'blood', 'spear', 'bane', 'ward', 'son', 'fell', 'vik', 'mark', 'hold', 'crest', 'grim'],
    placeOnsets: ['Skal', 'Fjor', 'Hrim', 'Norr', 'Valk', 'Sval', 'Kald', 'Drak', 'Jot', 'Bryn', 'Gunn', 'Hauk', 'Is', 'Krak', 'Lof', 'Mjol', 'Ostr', 'Ragn', 'Skag', 'Torv', 'Ulv', 'Vind', 'Ymir', 'Asg', 'Berg', 'Dyr', 'Eik', 'Glim', 'Hval', 'Kjol'],
    placeMiddles: ['a', 'o', 'e', 'i', 'u', 'ar', 'or', 'en', 'al'],
    placeEndings: ['vik', 'fjord', 'heim', 'gard', 'nes', 'dal', 'holm', 'stad', 'mark', 'berg', 'sund', 'by', 'ey', 'vann', 'fell'],
    compoundRoots: ['Frost', 'Rime', 'Drift', 'Gale', 'Pine', 'Wolf', 'Bear', 'Elk', 'Whale', 'Seal', 'Walrus', 'Raven', 'Skua', 'Oar', 'Keel', 'Sleet', 'Glacier', 'Crag', 'Slate', 'Birch', 'Alder', 'Mist', 'Storm', 'Tide', 'Cold', 'White', 'Grey', 'Nord', 'Skald', 'Hearth'],
    compoundSuffixes: ['vik', 'heim', 'gard', 'dal', 'holm', 'stad', 'by', 'nes', 'mark', 'fell', 'watch', 'haven', 'hold', 'stead', 'cross'],
    coastalSuffixes: ['vik', 'fjord', 'sund', 'nes', 'haven', 'port', 'strand', 'ey', 'holm', 'cove', 'quay'],
    mountainSuffixes: ['fell', 'berg', 'crag', 'tind', 'horn', 'pass', 'peak', 'scar', 'hold'],
    forestSuffixes: ['skov', 'holt', 'wood', 'lunde', 'grove', 'glade', 'hurst'],
    realmEndings: ['mark', 'land', 'heim', 'gard', 'rike', 'vik', 'fjord', 'dal'],
  },
  qadiri: {
    maleOnsets: ['Tar', 'Mal', 'Ziy', 'Sul', 'Far', 'Rash', 'Har', 'Niz', 'Ibr', 'Sel', 'Kahl', 'Qad', 'Zam', 'Jaf', 'Hak', 'Kar', 'Mans', 'Nas', 'Om', 'Raf', 'Sal', 'Waz', 'Yus', 'Zah', 'Am', 'Bas', 'Daw', 'Fad', 'Ghal', 'Ham'],
    maleMiddles: ['a', 'i', 'u', 'ai', 'ay', 'ar', 'al', 'im', 'an', 'ir'],
    maleEndings: ['iq', 'ik', 'ad', 'an', 'id', 'un', 'ar', 'im', 'ur', 'is', 'eem', 'ah', 'ir', 'al', 'ud', 'in'],
    femaleOnsets: ['Sor', 'Yas', 'Fat', 'Lay', 'Zah', 'Sam', 'Noor', 'Am', 'Ran', 'Dal', 'Az', 'Far', 'Hab', 'Jam', 'Kal', 'Lub', 'Mar', 'Nad', 'Qam', 'Saf', 'Tah', 'Waf', 'Zay', 'In', 'Lat', 'Mun', 'Naf', 'Sal', 'Shad', 'Zul'],
    femaleMiddles: ['a', 'i', 'ay', 'ir', 'al', 'an', 'im', 'ur'],
    femaleEndings: ['a', 'ya', 'in', 'ah', 'ra', 'ia', 'een', 'ila', 'ima', 'iya', 'an', 'ur', 'isa'],
    housePrefixes: ['Miraj', 'Sina', 'Rashid', 'Mansur', 'Qadir', 'Zahir', 'Kamil', 'Nasir', 'Farid', 'Tariq', 'Hakim', 'Jafar', 'Karim', 'Latif', 'Majid', 'Nadir', 'Qasim', 'Rafiq', 'Sadiq', 'Tahir', 'Wahid', 'Yasin', 'Zafar', 'Dune', 'Sun', 'Crescent', 'Saffron', 'Oasis', 'Star', 'Zenith'],
    houseSuffixes: ['veil', 'treader', 'guard', 'crest', 'spire', 'well', 'star', 'sand', 'wind', 'shade', 'sun', 'moon', 'palm', 'ridge'],
    housePrefixParticle: 'Al-',
    placeOnsets: ['Qad', 'Zir', 'Mar', 'Sam', 'Tar', 'Kar', 'Nas', 'Shab', 'Dar', 'Khaz', 'Mahr', 'Sab', 'Tad', 'Wad', 'Zah', 'Bahr', 'Fay', 'Ghad', 'Hadr', 'Jaz', 'Kuf', 'Mad', 'Naf', 'Qasr', 'Riy', 'Suf', 'Tab', 'Yab', 'Zuf', 'Ayn'],
    placeMiddles: ['a', 'i', 'u', 'ar', 'al', 'an', 'ir', 'ay', 'as'],
    placeEndings: ['a', 'ah', 'an', 'ar', 'at', 'id', 'in', 'ir', 'iya', 'un', 'ur', 'abad', 'qasr', 'ayn', 'shahr'],
    compoundRoots: ['Amber', 'Saffron', 'Dune', 'Oasis', 'Palm', 'Mirage', 'Zenith', 'Star', 'Sun', 'Crescent', 'Ochre', 'Sand', 'Salt', 'Spice', 'Silk', 'Myrrh', 'Cinnamon', 'Falcon', 'Jackal', 'Gazelle', 'Onyx', 'Topaz', 'Copper', 'Brass', 'Shade', 'Well', 'Spring', 'Canyon', 'Mesa', 'Red'],
    compoundSuffixes: ['wells', 'oasis', 'spire', 'gate', 'qasr', 'shade', 'haven', 'cross', 'watch', 'reach', 'court', 'caravan', 'market', 'hold'],
    coastalSuffixes: ['port', 'harbor', 'bay', 'bandar', 'cove', 'quay', 'point', 'strand', 'pearl'],
    mountainSuffixes: ['jabal', 'crag', 'pass', 'peak', 'mesa', 'canyon', 'ridge', 'tor'],
    forestSuffixes: ['palm', 'grove', 'garden', 'oasis', 'shade', 'orchard', 'glade'],
    realmEndings: ['a', 'ia', 'istan', 'at', 'an', 'ar', 'iya', 'ah'],
  },
  sylvathi: {
    maleOnsets: ['Cael', 'Fael', 'Aer', 'Silv', 'Bran', 'Row', 'Eam', 'Gar', 'Kael', 'Ther', 'Lir', 'Or', 'Tad', 'Corm', 'Dair', 'Fin', 'Gwyn', 'Ior', 'Lor', 'Mael', 'Nial', 'Ois', 'Padr', 'Rian', 'Soren', 'Tal', 'Vael', 'Bryn', 'Cian', 'Darr'],
    maleMiddles: ['a', 'e', 'i', 'o', 'ae', 'ei', 'an', 'ar', 'el', 'or'],
    maleEndings: ['um', 'an', 'on', 'oc', 'en', 'in', 'ick', 'ach', 'yr', 'yn', 'eth', 'ir', 'orn', 'as', 'iel'],
    femaleOnsets: ['Maev', 'Rhian', 'Mor', 'Elow', 'Niam', 'Bri', 'Lyr', 'Fion', 'Syl', 'Ais', 'Bron', 'Ciar', 'Deir', 'Eil', 'Fael', 'Gwen', 'Iol', 'Keir', 'Lian', 'Mair', 'Nol', 'Orl', 'Rois', 'Saoir', 'Tams', 'Ygr', 'Cer', 'Elv', 'Luth', 'Vael'],
    femaleMiddles: ['a', 'e', 'i', 'ae', 'ia', 'el', 'en', 'an', 'ir'],
    femaleEndings: ['e', 'a', 'en', 'an', 'yn', 'ia', 'ith', 'wen', 'lin', 'na', 'ra', 'is', 'eth', 'ara'],
    housePrefixes: ['Willow', 'Green', 'Oak', 'Briar', 'Deep', 'Thorn', 'Moon', 'Verdant', 'Fern', 'Moss', 'Alder', 'Rowan', 'Birch', 'Aspen', 'Cedar', 'Elm', 'Hazel', 'Ivy', 'Linden', 'Maple', 'Pine', 'Yew', 'Dew', 'Mist', 'Shade', 'Leaf', 'Bough', 'Stag', 'Wren', 'Owl'],
    houseSuffixes: ['brow', 'mantle', 'shield', 'wood', 'root', 'vale', 'shadow', 'bough', 'leaf', 'grove', 'song', 'whisper', 'glen', 'brook', 'fern', 'moss', 'thorn', 'bloom', 'shade', 'ward', 'crest', 'hart'],
    placeOnsets: ['Syl', 'Ael', 'Bri', 'Cael', 'Dor', 'Eir', 'Fael', 'Glyn', 'Hyr', 'Ily', 'Kael', 'Lir', 'Mael', 'Nym', 'Oir', 'Pry', 'Rhi', 'Syr', 'Tir', 'Vael', 'Wyn', 'Yew', 'Arb', 'Bryn', 'Caer', 'Dun', 'Gwen', 'Llan', 'Rath', 'Tor'],
    placeMiddles: ['a', 'e', 'i', 'o', 'ae', 'an', 'el', 'ir', 'or', 'yn'],
    placeEndings: ['is', 'en', 'ar', 'on', 'yr', 'ael', 'yn', 'eth', 'or', 'ia', 'ell', 'an', 'och', 'wy'],
    compoundRoots: ['Willow', 'Oak', 'Briar', 'Thorn', 'Fern', 'Moss', 'Alder', 'Rowan', 'Birch', 'Aspen', 'Cedar', 'Elm', 'Hazel', 'Ivy', 'Linden', 'Maple', 'Pine', 'Yew', 'Dew', 'Mist', 'Moon', 'Star', 'Silver', 'Green', 'Amber', 'Stag', 'Fawn', 'Wren', 'Owl', 'Brook'],
    compoundSuffixes: ['glade', 'grove', 'glen', 'vale', 'brook', 'hollow', 'wood', 'holt', 'bower', 'dell', 'mere', 'ford', 'haven', 'reach', 'watch', 'spire', 'green'],
    coastalSuffixes: ['cove', 'bay', 'haven', 'strand', 'mouth', 'point', 'tide', 'port', 'isle'],
    mountainSuffixes: ['tor', 'crag', 'ridge', 'peak', 'cairn', 'pass', 'height', 'cliff'],
    forestSuffixes: ['glade', 'grove', 'bower', 'wood', 'holt', 'thicket', 'frith', 'bough', 'glen'],
    realmEndings: ['ia', 'or', 'en', 'yr', 'wood', 'vale', 'glade', 'reach', 'mark'],
  },
  kharaz: {
    maleOnsets: ['Krag', 'Tor', 'Bar', 'Durg', 'Kaz', 'Grom', 'Thor', 'Thr', 'Gim', 'Balth', 'Brok', 'Dain', 'Dwal', 'Far', 'Fund', 'Gl', 'Gror', 'Khor', 'Mor', 'Nain', 'Nor', 'Or', 'Rur', 'Skar', 'Thror', 'Ulf', 'Vorn', 'Zul', 'Drak', 'Khar'],
    maleMiddles: ['a', 'o', 'u', 'ar', 'or', 'ur', 'in', 'im', 'al', 'uk'],
    maleEndings: ['ak', 'ek', 'in', 'or', 'un', 'ar', 'im', 'il', 'vald', 'bjorn', 'din', 'grim', 'dur', 'gar', 'rik', 'mar', 'zor'],
    femaleOnsets: ['Helg', 'Kar', 'Dag', 'Val', 'Borg', 'Thor', 'Ber', 'Sig', 'Brun', 'Valk', 'Astr', 'Bryn', 'Dis', 'Frid', 'Gerd', 'Grim', 'Hild', 'Ing', 'Jor', 'Katr', 'Mag', 'Nann', 'Orl', 'Run', 'Skad', 'Tov', 'Ulv', 'Yrs'],
    femaleMiddles: ['a', 'i', 'o', 'u', 'ar', 'or', 'il', 'un'],
    femaleEndings: ['a', 'i', 'na', 'da', 'hild', 'ra', 'run', 'ka', 'ga', 'dis', 'la', 'va', 'ma'],
    housePrefixes: ['Iron', 'Copper', 'Stone', 'Anvil', 'Deep', 'Gold', 'Rime', 'Steel', 'Granite', 'Basalt', 'Flint', 'Coal', 'Ember', 'Forge', 'Hammer', 'Ore', 'Pick', 'Quartz', 'Ruby', 'Shale', 'Silver', 'Slate', 'Crag', 'Cairn', 'Delve', 'Vault', 'Pillar', 'Hearth', 'Spire', 'Onyx'],
    houseSuffixes: ['forge', 'vein', 'breaker', 'guard', 'delve', 'crest', 'peak', 'hearth', 'hammer', 'helm', 'beard', 'shield', 'axe', 'fist', 'brow', 'pick', 'vault', 'stone', 'crag', 'hold', 'hall', 'grip'],
    placeOnsets: ['Khar', 'Durn', 'Grim', 'Kaz', 'Thar', 'Bar', 'Grom', 'Karak', 'Khaz', 'Mor', 'Nul', 'Ork', 'Ruk', 'Skar', 'Tor', 'Urz', 'Vorn', 'Zul', 'Balg', 'Cairn', 'Drak', 'Falg', 'Gald', 'Hrok', 'Krag', 'Malg', 'Norg', 'Ralg', 'Thrag', 'Vulg'],
    placeMiddles: ['a', 'o', 'u', 'ar', 'or', 'ur', 'az', 'uz', 'ak', 'ok'],
    placeEndings: ['az', 'ak', 'un', 'or', 'im', 'ul', 'ar', 'ek', 'ok', 'ur', 'dum', 'hold', 'delve', 'hall', 'crag', 'gate'],
    compoundRoots: ['Iron', 'Copper', 'Bronze', 'Tin', 'Coal', 'Ember', 'Cinder', 'Granite', 'Basalt', 'Flint', 'Quartz', 'Shale', 'Slate', 'Onyx', 'Garnet', 'Anvil', 'Forge', 'Hammer', 'Crag', 'Cairn', 'Pillar', 'Vault', 'Deep', 'Dark', 'Cold', 'Rime', 'Stone', 'Ore', 'Silver', 'Gold'],
    compoundSuffixes: ['hold', 'delve', 'hall', 'forge', 'gate', 'crag', 'peak', 'pass', 'cairn', 'vault', 'mine', 'hearth', 'keep', 'watch', 'burg', 'bridge'],
    coastalSuffixes: ['port', 'quay', 'dock', 'haven', 'cove', 'bay', 'strand', 'anchor'],
    mountainSuffixes: ['peak', 'crag', 'hold', 'delve', 'pass', 'cairn', 'spire', 'gate', 'vault', 'tor', 'ridge'],
    forestSuffixes: ['timber', 'holt', 'wood', 'clearing', 'grove', 'lumber', 'glen'],
    realmEndings: ['az', 'un', 'hold', 'mark', 'gard', 'dum', 'kar', 'or', 'land', 'crag'],
  },
  byzantion: {
    maleOnsets: ['Alex', 'Constan', 'Just', 'Bas', 'Nikeph', 'Theod', 'Ioann', 'Man', 'Andron', 'Leon', 'Mich', 'Georg', 'Greg', 'Roman', 'Phok', 'Demet', 'Chrys', 'Zeno', 'Stav', 'Ath'],
    maleMiddles: ['an', 'en', 'or', 'el', 'is', 'ar', 'em', 'ol', 'ad'],
    maleEndings: ['ios', 'ius', 'os', 'as', 'es', 'ikos', 'oros', 'ides', 'inos', 'on', 'ius'],
    femaleOnsets: ['Theod', 'Eudox', 'Zoe', 'Ir', 'Komn', 'Soph', 'Anast', 'Hel', 'Agath', 'Kass', 'Pulch', 'Ath', 'Euph', 'Xenia', 'Mel', 'Phot', 'Chry', 'Evd', 'Bas', 'Kyri'],
    femaleMiddles: ['a', 'e', 'i', 'o', 'an', 'el', 'or', 'is', 'ad'],
    femaleEndings: ['a', 'ia', 'ene', 'ora', 'ina', 'eis', 'andra', 'ope', 'onia', 'issa'],
    housePrefixes: ['Komn', 'Palai', 'Douk', 'Angel', 'Lask', 'Kanta', 'Phok', 'Tzim', 'Vatatz', 'Bryen', 'Dalass', 'Meliss', 'Tornik', 'Synad', 'Monom', 'Diog', 'Kourk', 'Rhall', 'Phil', 'Strat'],
    houseSuffixes: ['enos', 'ologos', 'as', 'ites', 'oulos', 'akis', 'ides', 'ianos', 'otes', 'ikos'],
    placeOnsets: ['Thess', 'Nika', 'Trapez', 'Adrian', 'Antioch', 'Byz', 'Chalk', 'Dyrr', 'Ephes', 'Koryn', 'Myst', 'Perg', 'Phil', 'Rhod', 'Sard', 'Smyr', 'Tars', 'Amas', 'Herak', 'Selym'],
    placeMiddles: ['a', 'e', 'o', 'al', 'an', 'ar', 'en', 'ol'],
    placeEndings: ['polis', 'kastron', 'ia', 'on', 'opolis', 'ion', 'eia', 'ous', 'os', 'aia'],
    compoundRoots: ['Golden', 'Purple', 'Marble', 'Basil', 'Cedar', 'Cypress', 'Olive', 'Harbor', 'Imperial', 'Silver', 'Laurel', 'Ivory', 'Porphyry', 'Sun', 'Sea', 'Arch', 'Crown', 'Saint', 'Saffron', 'Bronze'],
    compoundSuffixes: ['polis', 'kastron', 'port', 'spire', 'gate', 'haven', 'arch', 'agora', 'tower', 'keep'],
    coastalSuffixes: ['liman', 'port', 'polis', 'bay', 'haven', 'quay', 'straits', 'harbor', 'cove'],
    mountainSuffixes: ['kastron', 'mount', 'pass', 'cliff', 'tor', 'ridge', 'peak', 'watch'],
    forestSuffixes: ['grove', 'cypress', 'laurel', 'olive', 'glade', 'hurst'],
    realmEndings: ['ia', 'on', 'as', 'eia', 'polis', 'archate', 'theme', 'oria'],
  },
  steppic: {
    maleOnsets: ['Tem', 'Bat', 'Alt', 'Sub', 'Ber', 'Jeb', 'Kub', 'Oged', 'Chag', 'Tol', 'Bay', 'Kha', 'Teng', 'Arig', 'Hul', 'Noy', 'Sar', 'Tim', 'Yeke', 'Khas', 'Tog', 'Buri', 'Mung', 'Qad', 'Suld'],
    maleMiddles: ['u', 'a', 'o', 'ar', 'ur', 'ul', 'an', 'ei'],
    maleEndings: ['ur', 'ai', 'an', 'khan', 'tai', 'tu', 'gu', 'chi', 'ge', 'luk', 'bei', 'ar', 'ok', 'in'],
    femaleOnsets: ['Bort', 'Sorg', 'Alt', 'Khot', 'Chab', 'Mand', 'Oel', 'Tore', 'Yel', 'Sar', 'Nerg', 'Esen', 'Khut', 'Ghoa', 'Bula', 'Alan', 'Tset', 'Munk', 'Bolor', 'Ulan'],
    femaleMiddles: ['a', 'e', 'u', 'i', 'ul', 'an', 'or'],
    femaleEndings: ['e', 'a', 'ui', 'un', 'in', 'khai', 'tan', 'jin', 'lan', 'dai'],
    housePrefixes: ['Altan', 'Borj', 'Qara', 'Bay', 'Naim', 'Ker', 'Merk', 'Oir', 'Jalay', 'Suld', 'Urian', 'Khor', 'Tatar', 'Orkh', 'Steppe', 'Iron', 'Sky', 'Wolf', 'Falcon', 'Wind'],
    houseSuffixes: ['gin', 'khai', 'tai', 'urdu', 'rider', 'bow', 'stirrup', 'tumen', 'ban', 'kor', 'yurt'],
    placeOnsets: ['Karak', 'Orkh', 'Almal', 'Sar', 'Balk', 'Sam', 'Tar', 'Khot', 'Ulan', 'Teng', 'Batu', 'Kyz', 'Otr', 'Sigh', 'Tash', 'Yark', 'Bal', 'Khov', 'Sel', 'Tuv'],
    placeMiddles: ['a', 'o', 'u', 'ar', 'al', 'or', 'ul'],
    placeEndings: ['orum', 'balikh', 'ordu', 'bulak', 'kum', 'kent', 'su', 'köl', 'tagh', 'nor'],
    compoundRoots: ['Golden', 'Black', 'White', 'Blue', 'Red', 'Iron', 'Wind', 'Sky', 'Falcon', 'Horse', 'Steppe', 'Wolf', 'Eagle', 'River', 'Reed', 'Salt', 'Grass', 'Sun', 'Ash', 'Silver'],
    compoundSuffixes: ['ordu', 'bulak', 'ford', 'camp', 'kurgan', 'gate', 'steppe', 'crossing', 'watch', 'well'],
    coastalSuffixes: ['port', 'bay', 'haven', 'lagoon', 'mouth', 'landing'],
    mountainSuffixes: ['tagh', 'pass', 'crag', 'ridge', 'peak', 'watch'],
    forestSuffixes: ['birch', 'taiga', 'grove', 'thicket', 'larch'],
    realmEndings: ['khanate', 'ordu', 'ia', 'stan', 'steppe', 'yurt', 'kagan', 'ar'],
  },
  ostlandic: {
    maleOnsets: ['Vlad', 'Mir', 'Boles', 'Jar', 'Cas', 'Svyat', 'Rost', 'Kaz', 'Vse', 'Drag', 'Rad', 'Bor', 'Oleg', 'Igor', 'Stan', 'Prem', 'Lesz', 'Dob', 'Miesz', 'Voj'],
    maleMiddles: ['o', 'i', 'a', 'is', 'os', 'em', 'av'],
    maleEndings: ['slav', 'mir', 'bor', 'mil', 'rad', 'ek', 'ik', 'ko', 'an', 'ov', 'ych', 'en', 'gost'],
    femaleOnsets: ['Yar', 'Mil', 'Lud', 'Olga', 'Zof', 'Dan', 'Swiet', 'Dob', 'Bron', 'Vlast', 'Ruz', 'Kras', 'Boh', 'Vlad', 'Jadw', 'Ksen', 'Mar', 'Vesn', 'Zlata', 'Snez'],
    femaleMiddles: ['a', 'o', 'i', 'is', 'an', 'il'],
    femaleEndings: ['slava', 'mila', 'na', 'ka', 'a', 'ina', 'ova', 'ya', 'usha', 'enka'],
    housePrefixes: ['Rur', 'Piast', 'Prem', 'Volyn', 'Gal', 'Morav', 'Chern', 'Novg', 'Bel', 'Kras', 'Zlat', 'Dubr', 'Ostr', 'Vilk', 'Medv', 'Sokol', 'Berez', 'Tver', 'Suzd', 'Polot'],
    houseSuffixes: ['ovich', 'sky', 'ov', 'ev', 'grad', 'mir', 'ek', 'in', 'horn', 'shield', 'forest'],
    placeOnsets: ['Nov', 'Krak', 'Bres', 'Kiev', 'Vladimir', 'Prag', 'Gdan', 'Smol', 'Polot', 'Tver', 'Rost', 'Psk', 'Lviv', 'Hal', 'Vrat', 'Lub', 'Tor', 'Poz', 'Chern', 'Bel'],
    placeMiddles: ['o', 'a', 'i', 'og', 'es', 'or', 'ov'],
    placeEndings: ['grad', 'gorod', 'mir', 'ovo', 'ice', 'sk', 'ec', 'ov', 'law', 'pol', 'in', 'bor'],
    compoundRoots: ['Birch', 'Amber', 'Oak', 'Wolf', 'Falcon', 'Bear', 'Snow', 'Pine', 'Silver', 'White', 'Black', 'Red', 'Gold', 'Marsh', 'Reed', 'River', 'Dawn', 'Frost', 'Stag', 'Linden'],
    compoundSuffixes: ['grad', 'bor', 'mir', 'ford', 'watch', 'pole', 'grove', 'ostrog', 'keep', 'ford'],
    coastalSuffixes: ['port', 'gdan', 'bay', 'haven', 'lagoon', 'mouth', 'quay'],
    mountainSuffixes: ['gora', 'crag', 'pass', 'peak', 'ridge', 'skar'],
    forestSuffixes: ['bor', 'puszcza', 'grove', 'birch', 'linden', 'wood'],
    realmEndings: ['ia', 'land', 'gard', 'grad', 'rus', 'mor', 'mark', 'ovia'],
  },
  iberan: {
    maleOnsets: ['Alf', 'Rod', 'Sanc', 'Fern', 'Gons', 'Rami', 'Pel', 'Dieg', 'Enr', 'Jim', 'Alv', 'Ber', 'Gar', 'Lope', 'Mart', 'Ordon', 'Pedr', 'Tello', 'Vasc', 'Xim'],
    maleMiddles: ['on', 'er', 'an', 'i', 'o', 'ar', 'al'],
    maleEndings: ['so', 'igo', 'o', 'ando', 'ez', 'az', 'ayo', 'ique', 'ez', 'aldo', 'in', 'io'],
    femaleOnsets: ['Isab', 'Urr', 'Bereng', 'Leon', 'Elv', 'Sanc', 'Jim', 'Blan', 'Ines', 'Viol', 'Catal', 'Aldon', 'Menc', 'Beat', 'Sol', 'Const', 'Mayor', 'Guiom', 'Teresa', 'Estef'],
    femaleMiddles: ['a', 'e', 'i', 'al', 'or', 'an'],
    femaleEndings: ['a', 'ia', 'or', 'ina', 'ez', 'el', 'ilde', 'ona', 'encia', 'isa'],
    housePrefixes: ['Cast', 'Arag', 'Nav', 'Mont', 'Vega', 'Mendoz', 'Guzm', 'Ponce', 'Laran', 'Har', 'Silva', 'Vald', 'Cord', 'Toled', 'Alcant', 'Calat', 'Sant', 'Vill', 'Cabr', 'Aguil'],
    houseSuffixes: ['zar', 'monte', 'roca', 'valle', 'campo', 'verde', 'fuerte', 'sol', 'vega', 'rio', 'cruz', 'castro'],
    housePrefixParticle: 'de ',
    placeOnsets: ['Zar', 'Tol', 'Cord', 'Sev', 'Val', 'Burg', 'Seg', 'Avil', 'Sal', 'Zam', 'Pam', 'Leon', 'Sori', 'Cacer', 'Bad', 'Mur', 'Gran', 'Almer', 'Cart', 'Ovie'],
    placeMiddles: ['a', 'e', 'o', 'ar', 'al', 'on', 'or'],
    placeEndings: ['oza', 'edo', 'oba', 'illa', 'encia', 'os', 'ia', 'on', 'ar', 'al', 'azar', 'cruz'],
    compoundRoots: ['Sierra', 'Monte', 'Rio', 'Valle', 'Sol', 'Oro', 'Hierro', 'Piedra', 'Blanca', 'Roja', 'Cruz', 'Torre', 'Puente', 'Halcon', 'Lobo', 'Encina', 'Olivo', 'Vega', 'Campo', 'Alba'],
    compoundSuffixes: ['castro', 'alcazar', 'puente', 'monte', 'valle', 'torre', 'real', 'vega', 'port', 'campo'],
    coastalSuffixes: ['puerto', 'cala', 'bahia', 'mar', 'costa', 'faro', 'isla'],
    mountainSuffixes: ['sierra', 'pico', 'paso', 'peña', 'cerro', 'roca'],
    forestSuffixes: ['bosque', 'encinar', 'robledal', 'soto', 'selva'],
    realmEndings: ['ia', 'ona', 'erra', 'ar', 'al', 'leon', 'castilla', 'illa'],
  },
  maritime: {
    maleOnsets: ['Lor', 'Marco', 'Dand', 'Cont', 'Mor', 'Zor', 'Fosc', 'Grim', 'Mocen', 'Ven', 'Piet', 'Giov', 'Nicc', 'Batt', 'Andr', 'Bart', 'Carlo', 'Domen', 'Filip', 'Gasp'],
    maleMiddles: ['en', 'an', 'ar', 'o', 'i', 'ol', 'el'],
    maleEndings: ['zo', 'o', 'olo', 'arini', 'i', 'ano', 'eri', 'ardo', 'oni', 'ino', 'io', 'ello'],
    femaleOnsets: ['Beat', 'Catar', 'Lucre', 'Bianc', 'Fiam', 'Elis', 'Clar', 'Chiara', 'Ginev', 'Lavin', 'Vitt', 'Viol', 'Orset', 'Contes', 'Margh', 'Donat', 'Alvis', 'Pao', 'Sera', 'Valer'],
    femaleMiddles: ['a', 'i', 'e', 'an', 'ar', 'ol'],
    femaleEndings: ['a', 'ina', 'etta', 'zia', 'ora', 'ia', 'ice', 'ella', 'ina', 'essa'],
    housePrefixes: ['Dand', 'Contar', 'Moros', 'Fosc', 'Mocen', 'Grim', 'Lored', 'Orse', 'Brag', 'Ven', 'Spin', 'Doria', 'Fiesc', 'Grimald', 'Viscont', 'Stroz', 'Med', 'Bemb', 'Zeno', 'Priul'],
    houseSuffixes: ['ini', 'aro', 'oni', 'elli', 'ieri', 'ato', 'olo', 'esi', 'ano', 'eri'],
    placeOnsets: ['Ven', 'Gen', 'Rag', 'Pisa', 'Amalf', 'Zara', 'Cand', 'Fam', 'Mod', 'Kor', 'Chio', 'Liv', 'Ancon', 'Bar', 'Spal', 'Catt', 'Trani', 'Otran', 'Mess', 'Paler'],
    placeMiddles: ['e', 'a', 'o', 'ar', 'al', 'en', 'or'],
    placeEndings: ['ia', 'oa', 'osa', 'ara', 'ona', 'porto', 'mare', 'isola', 'lido', 'enza', 'etto'],
    compoundRoots: ['Porto', 'Bella', 'Vera', 'Alta', 'Bassa', 'Bianca', 'Rossa', 'Oro', 'Sale', 'Vento', 'Mare', 'Isola', 'Galea', 'Faro', 'Torre', 'San', 'Corallo', 'Perla', 'Onda', 'Seta'],
    compoundSuffixes: ['porto', 'mare', 'lido', 'faro', 'scala', 'piazza', 'borgo', 'isola', 'forte', 'riva'],
    coastalSuffixes: ['porto', 'lido', 'faro', 'mare', 'rada', 'molo', 'isola', 'cala'],
    mountainSuffixes: ['monte', 'rocca', 'passo', 'cima', 'torre', 'castello'],
    forestSuffixes: ['bosco', 'selva', 'pineta', 'ombra', 'valle'],
    realmEndings: ['ia', 'oa', 'mare', 'terra', 'lido', 'laguna', 'enza', 'ona'],
  },
};

export function resolveLinguisticFamily(
  cultureName?: string,
  explicitFamily?: string
): CulturalLinguisticFamily {
  const hint = (explicitFamily || '').toLowerCase().trim();
  if (
    hint === 'valorian' ||
    hint === 'skaldic' ||
    hint === 'qadiri' ||
    hint === 'sylvathi' ||
    hint === 'kharaz' ||
    hint === 'byzantion' ||
    hint === 'steppic' ||
    hint === 'ostlandic' ||
    hint === 'iberan' ||
    hint === 'maritime'
  ) {
    return hint;
  }

  const c = (cultureName || '').toLowerCase();
  if (c.includes('skald') || c.includes('fjord') || c.includes('nord') || c.includes('rime') || c.includes('varang')) return 'skaldic';
  if (c.includes('qadir') || c.includes('oasis') || c.includes('caliph') || c.includes('desert') || c.includes('sultan') || c.includes('al-')) return 'qadiri';
  if (c.includes('sylv') || c.includes('forest') || c.includes('arbor') || c.includes('glen') || c.includes('briar') || c.includes('caer')) return 'sylvathi';
  if (c.includes('kharaz') || c.includes('iron') || c.includes('clan') || c.includes('crag') || c.includes('anvil') || c.includes('delve')) return 'kharaz';
  if (c.includes('byzant') || c.includes('archon') || c.includes('basil') || c.includes('porphyr') || c.includes('theme') || c.includes('hellen')) return 'byzantion';
  if (c.includes('steppe') || c.includes('khan') || c.includes('horde') || c.includes('tenger') || c.includes('nomad') || c.includes('altan') || c.includes('ordu')) return 'steppic';
  if (c.includes('ostland') || c.includes('grad') || c.includes('boyar') || c.includes('birch') || c.includes('kiev') || c.includes('slav') || c.includes('rus')) return 'ostlandic';
  if (c.includes('iber') || c.includes('castel') || c.includes('sierra') || c.includes('alcaz') || c.includes('marq') || c.includes('hidalgo')) return 'iberan';
  if (c.includes('maritim') || c.includes('lagoon') || c.includes('serene') || c.includes('corsair') || c.includes('doge') || c.includes('thalass') || c.includes('pelag')) return 'maritime';
  return 'valorian';
}

function cleanEuphony(raw: string): string {
  // Collapse triple identical letters & awkward double vowel/consonant seams, capitalize cleanly
  const collapsed = raw
    .replace(/([a-zA-Z])\1\1+/g, '$1$1')
    .replace(/aa/gi, 'a')
    .replace(/ii/gi, 'i')
    .replace(/uu/gi, 'u')
    .replace(/--+/g, '-');
  return collapsed
    .split(/(\s|-)/)
    .map((part) => (part.length > 0 && /[a-zA-Z]/.test(part[0]) ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join('');
}

function joinParts(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  // Avoid repeating the exact seam letter (e.g. "Stone" + "edge" or "Val" + "lane" -> "Vallane" is okay, "Black" + "keep" -> "Blackeep" avoid)
  const lastA = a[a.length - 1].toLowerCase();
  const firstB = b[0].toLowerCase();
  if (lastA === firstB && !['l', 'r', 'n', 's'].includes(lastA)) {
    return a + b.slice(1);
  }
  return a + b;
}

/**
 * Per-world procedural naming registry that synthesizes fresh, culturally cohesive names
 * and guarantees zero repeated settlement, realm, or noble house names across the entire world.
 */
export class WorldNameRegistry {
  private prng: PRNG;
  private usedSettlements = new Set<string>();
  private usedRealms = new Set<string>();
  private usedHouses = new Set<string>();
  private usedFullCharacterNames = new Set<string>();
  private recentFirstNames = new Map<string, Set<string>>();
  private explicitFamilies = new Map<string, CulturalLinguisticFamily>();

  constructor(prng: PRNG) {
    this.prng = prng;
  }

  public registerCultureFamily(cultureName: string, family?: string): void {
    if (!cultureName || !family) return;
    this.explicitFamilies.set(cultureName.toLowerCase(), resolveLinguisticFamily(cultureName, family));
  }

  private getFamilyForCulture(cultureName?: string): CulturalLinguisticFamily {
    if (cultureName) {
      const registered = this.explicitFamilies.get(cultureName.toLowerCase());
      if (registered) return registered;
    }
    return resolveLinguisticFamily(cultureName);
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.prng.next() * arr.length)];
  }

  private synthesizePhoneticPlace(g: PhoneticGrammar): string {
    const roll = this.prng.next();
    if (roll < 0.45) {
      return cleanEuphony(joinParts(this.pick(g.placeOnsets), this.pick(g.placeEndings)));
    }
    return cleanEuphony(
      joinParts(
        joinParts(this.pick(g.placeOnsets), this.pick(g.placeMiddles)),
        this.pick(g.placeEndings)
      )
    );
  }

  private synthesizeCompoundPlace(
    g: PhoneticGrammar,
    siteHint?: 'coastal' | 'mountain' | 'forest' | 'inland'
  ): string {
    const root = this.pick(g.compoundRoots);
    let suffixPool = g.compoundSuffixes;
    if (siteHint === 'coastal' && this.prng.next() < 0.72) {
      suffixPool = g.coastalSuffixes;
    } else if (siteHint === 'mountain' && this.prng.next() < 0.72) {
      suffixPool = g.mountainSuffixes;
    } else if (siteHint === 'forest' && this.prng.next() < 0.72) {
      suffixPool = g.forestSuffixes;
    }
    const suffix = this.pick(suffixPool);
    if (root.toLowerCase() === suffix.toLowerCase()) {
      return this.synthesizePhoneticPlace(g);
    }
    return cleanEuphony(joinParts(root, suffix));
  }

  /**
   * Generates a globally unique settlement/burg name tailored to culture & terrain.
   */
  public nextBurgName(
    cultureName?: string,
    siteHint?: 'coastal' | 'mountain' | 'forest' | 'inland'
  ): string {
    const family = this.getFamilyForCulture(cultureName);
    const g = GRAMMARS[family];

    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate =
        this.prng.next() < 0.52
          ? this.synthesizeCompoundPlace(g, siteHint)
          : this.synthesizePhoneticPlace(g);
      const key = candidate.toLowerCase();
      if (candidate.length >= 4 && !this.usedSettlements.has(key) && !this.usedRealms.has(key)) {
        this.usedSettlements.add(key);
        return candidate;
      }
    }

    // Guaranteed unique fallback with geographic qualifier
    const qualifiers = ['Old', 'New', 'High', 'Low', 'East', 'West', 'North', 'South', 'Upper', 'Lower'];
    for (let i = 0; i < 30; i++) {
      const base = this.synthesizePhoneticPlace(g);
      const qualified = `${this.pick(qualifiers)} ${base}`;
      const key = qualified.toLowerCase();
      if (!this.usedSettlements.has(key)) {
        this.usedSettlements.add(key);
        return qualified;
      }
    }
    const fallback = `${this.synthesizePhoneticPlace(g)}${this.usedSettlements.size + 1}`;
    this.usedSettlements.add(fallback.toLowerCase());
    return fallback;
  }

  /**
   * Generates a globally unique Realm / Kingdom name (distinct from settlements & houses).
   */
  public nextRealmName(cultureName?: string): string {
    const family = this.getFamilyForCulture(cultureName);
    const g = GRAMMARS[family];

    for (let attempt = 0; attempt < 50; attempt++) {
      const roll = this.prng.next();
      let candidate: string;
      if (roll < 0.55) {
        candidate = cleanEuphony(
          joinParts(
            joinParts(this.pick(g.placeOnsets), this.pick(g.placeMiddles)),
            this.pick(g.realmEndings)
          )
        );
      } else {
        candidate = cleanEuphony(joinParts(this.pick(g.placeOnsets), this.pick(g.realmEndings)));
      }
      const key = candidate.toLowerCase();
      if (
        candidate.length >= 5 &&
        !this.usedRealms.has(key) &&
        !this.usedSettlements.has(key) &&
        !this.usedHouses.has(key)
      ) {
        this.usedRealms.add(key);
        return candidate;
      }
    }

    const fallback = cleanEuphony(joinParts(this.pick(g.placeOnsets), this.pick(g.realmEndings)));
    this.usedRealms.add(fallback.toLowerCase());
    return fallback;
  }

  /**
   * Generates a globally unique Noble House surname for Monarchs, Dukes, Counts, Barons & Courtiers.
   */
  public nextHouseName(cultureName?: string, excludeHouses?: Set<string>): string {
    const family = this.getFamilyForCulture(cultureName);
    const g = GRAMMARS[family];

    for (let attempt = 0; attempt < 50; attempt++) {
      let candidate: string;
      const roll = this.prng.next();
      if (g.housePrefixParticle && roll < 0.55) {
        const stem = cleanEuphony(
          joinParts(this.pick(g.placeOnsets), this.pick(g.maleEndings))
        );
        candidate = `${g.housePrefixParticle}${stem}`;
      } else if (roll < 0.72) {
        candidate = cleanEuphony(joinParts(this.pick(g.housePrefixes), this.pick(g.houseSuffixes)));
      } else {
        candidate = cleanEuphony(
          joinParts(
            joinParts(this.pick(g.placeOnsets), this.pick(g.placeMiddles)),
            this.pick(g.houseSuffixes)
          )
        );
      }
      const key = candidate.toLowerCase();
      if (
        candidate.length >= 4 &&
        !this.usedHouses.has(key) &&
        !this.usedRealms.has(key) &&
        !(excludeHouses && excludeHouses.has(key))
      ) {
        this.usedHouses.add(key);
        return candidate;
      }
    }

    // Fallback with compound variation
    const fallback = cleanEuphony(joinParts(this.pick(g.compoundRoots), this.pick(g.houseSuffixes)));
    this.usedHouses.add(fallback.toLowerCase());
    return fallback;
  }

  /**
   * Generates a culturally authentic, non-repeating character first name.
   * Ensures no two characters in the same house (or realm scope) receive the same first name.
   */
  public nextFirstName(
    cultureName: string | undefined,
    gender: 'Male' | 'Female',
    scopeKey = 'global'
  ): string {
    const family = this.getFamilyForCulture(cultureName);
    const g = GRAMMARS[family];
    let scopeSet = this.recentFirstNames.get(scopeKey);
    if (!scopeSet) {
      scopeSet = new Set<string>();
      this.recentFirstNames.set(scopeKey, scopeSet);
    }

    const onsets = gender === 'Male' ? g.maleOnsets : g.femaleOnsets;
    const middles = gender === 'Male' ? g.maleMiddles : g.femaleMiddles;
    const endings = gender === 'Male' ? g.maleEndings : g.femaleEndings;

    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate =
        this.prng.next() < 0.62
          ? cleanEuphony(joinParts(this.pick(onsets), this.pick(endings)))
          : cleanEuphony(joinParts(joinParts(this.pick(onsets), this.pick(middles)), this.pick(endings)));
      const key = candidate.toLowerCase();
      const fullKey = `${scopeKey}|${key}`;
      if (
        candidate.length >= 3 &&
        candidate.length <= 13 &&
        !scopeSet.has(key) &&
        !this.usedFullCharacterNames.has(fullKey)
      ) {
        scopeSet.add(key);
        this.usedFullCharacterNames.add(fullKey);
        return candidate;
      }
    }

    const fallback = cleanEuphony(joinParts(this.pick(onsets), this.pick(endings)));
    scopeSet.add(fallback.toLowerCase());
    return fallback;
  }
}
